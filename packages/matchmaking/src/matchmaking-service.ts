/**
 * In-memory matchmaking service for the Arena.gg platform.
 *
 * Implements the MatchmakingService contract from @arena/shared.
 * Handles queue management, atomic match creation with compensating
 * refunds on partial fee-deduction failure, idempotent match resolution,
 * rake collection, prize distribution, and ELO rating updates.
 *
 * KNOWN ISSUES:
 * - Partial payout on awardPrize failure after rake collected is a
 *   log-and-rethrow situation requiring operational tooling, not automatic
 *   reversal. The caller (API layer) must handle via operational tooling.
 * - In-memory queue does not survive server restart — acceptable for
 *   Phase 1 through beta. See queue.ts for the Redis swap point.
 * - Player list recovery for resolveMatch validation uses MatchPlayer
 *   rows from the database (populated during createMatch).
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  UserId,
  Money,
  Match,
  MatchId,
  MatchResult,
  GameId,
  WalletService,
  MatchmakingService,
  PlayerRating,
} from '@arena/shared';
import { MatchStatus, ValidationError } from '@arena/shared';
import type { PayoutCalculator } from './payout-calculator.js';
import { computeRake } from './rake.js';
import { updateElo } from './elo.js';
import { MatchQueue } from './queue.js';

/** Error thrown when a match is in an invalid state for the requested operation. */
class InvalidStateError extends ValidationError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'InvalidStateError';
  }
}

/**
 * In-memory implementation of MatchmakingService.
 *
 * @param walletService - Injected wallet service for fee deductions and prize payouts
 * @param prisma - Injected Prisma client for Match and PlayerRating persistence
 * @param calculators - Injected map of game ID to payout calculator
 * @param queue - Optional custom queue; defaults to new MatchQueue()
 */
export class InMemoryMatchmakingService implements MatchmakingService {
  private readonly walletService: WalletService;
  private readonly prisma: PrismaClient;
  private readonly calculators: Map<GameId, PayoutCalculator>;
  private readonly queue: MatchQueue;

  constructor(
    walletService: WalletService,
    prisma: PrismaClient,
    calculators: Map<GameId, PayoutCalculator>,
    queue?: MatchQueue,
  ) {
    this.walletService = walletService;
    this.prisma = prisma;
    this.calculators = calculators;
    this.queue = queue ?? new MatchQueue();
  }

  /**
   * Add a player to the matchmaking queue for a game and entry fee tier.
   * @throws ValidationError if entryFeeCents <= 0 or player is already in this bucket
   */
  async joinQueue(
    userId: UserId,
    gameId: GameId,
    entryFeeCents: Money,
  ): Promise<void> {
    if (!Number.isFinite(entryFeeCents as number) || (entryFeeCents as number) <= 0) {
      throw new ValidationError('entryFeeCents must be a positive integer', {
        userId,
        gameId,
        entryFeeCents,
      });
    }
    this.queue.add(userId, gameId, entryFeeCents);
  }

  /**
   * Remove a player from the matchmaking queue.
   * Idempotent: removing a player who is not queued is a no-op.
   */
  async leaveQueue(userId: UserId, gameId: GameId): Promise<void> {
    this.queue.remove(userId, gameId);
  }

  /**
   * Create a match from matched players. Deducts entry fees with compensating
   * refunds on partial failure.
   *
   * This is the COMPENSATING-TRANSACTION PATH:
   * 1. Persist Match row as QUEUED
   * 2. Deduct entry fees one by one
   * 3. On any deduction failure: refund all previously deducted fees, cancel match, rethrow
   * 4. On full success: update match to IN_PROGRESS, remove players from queue
   */
  async createMatch(
    gameId: GameId,
    playerIds: readonly UserId[],
    entryFeeCents: Money,
  ): Promise<Match> {
    // Validation
    if (playerIds.length < 2) {
      throw new ValidationError('Match requires at least 2 players', {
        gameId,
        playerCount: playerIds.length,
      });
    }
    if (!Number.isFinite(entryFeeCents as number) || (entryFeeCents as number) <= 0) {
      throw new ValidationError('entryFeeCents must be a positive integer', {
        gameId,
        entryFeeCents,
      });
    }
    const uniqueIds = new Set(playerIds);
    if (uniqueIds.size !== playerIds.length) {
      throw new ValidationError('Duplicate player IDs in match', {
        gameId,
        playerIds: [...playerIds],
      });
    }

    const { rakeCents, prizePoolCents } = computeRake(entryFeeCents, playerIds.length);
    const matchId = randomUUID() as MatchId;

    // Step 1: Persist Match row as QUEUED before deducting fees
    await (this.prisma as unknown as PrismaAny).match.create({
      data: {
        id: matchId,
        gameId: gameId as string,
        status: MatchStatus.QUEUED,
        entryFeeCents: BigInt(entryFeeCents as number),
        poolCents: BigInt(prizePoolCents as number),
        rakeCents: BigInt(rakeCents as number),
      },
    });

    // Create MatchPlayer rows for each player
    for (const playerId of playerIds) {
      await (this.prisma as unknown as PrismaAny).matchPlayer.create({
        data: {
          matchId: matchId as string,
          userId: playerId as string,
          rating: 1200, // default; will be overwritten in resolveMatch
        },
      });
    }

    // Step 2: Deduct entry fees with compensating refunds
    const deducted: UserId[] = [];
    try {
      for (const playerId of playerIds) {
        await this.walletService.deductEntryFee(playerId, matchId, entryFeeCents);
        deducted.push(playerId);
      }
    } catch (error: unknown) {
      // Compensating refunds — reverse order
      for (let i = deducted.length - 1; i >= 0; i--) {
        const refundUserId = deducted[i]!;
        try {
          await this.walletService.deposit(
            refundUserId,
            entryFeeCents,
            'refund',
            `refund-${matchId}-${refundUserId}`,
          );
        } catch (refundError: unknown) {
          // CRITICAL: Failed refund. Log and continue refunding others.
          console.error(
            'CRITICAL: Failed to refund entry fee during compensating transaction',
            {
              matchId,
              userId: refundUserId,
              amountCents: entryFeeCents,
              refundError:
                refundError instanceof Error
                  ? refundError.message
                  : String(refundError),
            },
          );
        }
      }

      // Cancel the match
      await (this.prisma as unknown as PrismaAny).match.update({
        where: { id: matchId as string },
        data: { status: MatchStatus.CANCELLED, resolvedAt: new Date() },
      });

      throw error;
    }

    // Step 3: All deductions succeeded — mark IN_PROGRESS
    const now = new Date();
    const updatedMatch = await (this.prisma as unknown as PrismaAny).match.update({
      where: { id: matchId as string },
      data: { status: MatchStatus.IN_PROGRESS, updatedAt: now },
    });

    // Remove players from queue
    for (const playerId of playerIds) {
      this.queue.remove(playerId, gameId, entryFeeCents);
    }

    return toMatch(updatedMatch, null);
  }

  /**
   * Resolve a completed match. Idempotent — retries are safe.
   *
   * Flow:
   * 1. Read match from DB; if RESOLVED, return as-is (idempotent)
   * 2. Validate result placements against match players
   * 3. Look up PayoutCalculator for this game
   * 4. Compute payouts and verify sum === prizePoolCents
   * 5. Collect rake (idempotent via matchId-scoped key)
   * 6. Award prizes in placement order (1st, 2nd, 3rd...)
   * 7. Update match to RESOLVED with result
   * 8. Update ELO ratings
   *
   * KNOWN ISSUE: If awardPrize fails after rake collected, this is a
   * partial-payout situation. We log and rethrow — do NOT reverse rake.
   * Operational tooling needed at the API layer.
   */
  async resolveMatch(matchId: MatchId, result: MatchResult): Promise<Match> {
    // Read match
    const matchRow = await (this.prisma as unknown as PrismaAny).match.findUnique({
      where: { id: matchId as string },
      include: { players: true },
    });
    if (!matchRow) {
      throw new ValidationError('Match not found', { matchId });
    }

    // Idempotent: already resolved → return unchanged
    if (matchRow.status === MatchStatus.RESOLVED) {
      return toMatch(matchRow, result);
    }

    if (matchRow.status === MatchStatus.CANCELLED) {
      throw new InvalidStateError('Cannot resolve a cancelled match', { matchId });
    }

    if (matchRow.status !== MatchStatus.IN_PROGRESS) {
      throw new InvalidStateError(
        `Cannot resolve match with status ${matchRow.status}; expected IN_PROGRESS`,
        { matchId, status: matchRow.status },
      );
    }

    // Validate result
    if (!result || result.length === 0) {
      throw new ValidationError('Match result cannot be empty', { matchId });
    }

    // Validate positions are contiguous starting at 1
    const positions = result.map((p) => p.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i + 1) {
        throw new ValidationError(
          'Placements must have contiguous positions starting at 1',
          { matchId, positions },
        );
      }
    }

    // Validate players match the match's player list
    const matchPlayerIds = new Set(
      (matchRow.players as Array<{ userId: string }>).map((mp) => mp.userId),
    );
    const resultPlayerIds = new Set(result.map((p) => p.userId as string));
    if (matchPlayerIds.size !== resultPlayerIds.size) {
      throw new ValidationError('Result players do not match match players', {
        matchId,
        expected: [...matchPlayerIds],
        got: [...resultPlayerIds],
      });
    }
    for (const id of resultPlayerIds) {
      if (!matchPlayerIds.has(id)) {
        throw new ValidationError('Result contains unknown player', {
          matchId,
          unknownUserId: id,
        });
      }
    }

    // Look up payout calculator
    const gameId = matchRow.gameId as GameId;
    const calculator = this.calculators.get(gameId);
    if (!calculator) {
      throw new ValidationError(
        `No PayoutCalculator registered for game ${gameId}`,
        { matchId, gameId },
      );
    }

    const prizePoolCents = Number(matchRow.poolCents) as Money;
    const rakeCents = Number(matchRow.rakeCents) as Money;

    // Compute payouts
    const payouts = calculator.calculate(prizePoolCents, result);

    // Invariant check: sum of payouts must equal prizePoolCents
    const payoutSum = payouts.reduce((sum, p) => sum + (p.payoutCents as number), 0);
    if (payoutSum !== (prizePoolCents as number)) {
      throw new ValidationError(
        'Payout sum does not equal prize pool — refusing to distribute money',
        {
          matchId,
          prizePoolCents,
          payoutSum,
          difference: (prizePoolCents as number) - payoutSum,
        },
      );
    }

    // Collect rake (idempotent via key)
    await this.walletService.collectRake(matchId, rakeCents, `rake-${matchId}`);

    // Award prizes in placement order (1st, 2nd, 3rd...)
    const sortedPayouts = [...payouts].sort((a, b) => {
      const posA = result.find((r) => r.userId === a.userId)!.position;
      const posB = result.find((r) => r.userId === b.userId)!.position;
      return posA - posB;
    });

    for (const payout of sortedPayouts) {
      if ((payout.payoutCents as number) > 0) {
        await this.walletService.awardPrize(
          payout.userId,
          matchId,
          payout.payoutCents,
        );
      }
    }

    // Update Match to RESOLVED
    const resolvedAt = new Date();
    await (this.prisma as unknown as PrismaAny).match.update({
      where: { id: matchId as string },
      data: { status: MatchStatus.RESOLVED, resolvedAt },
    });

    // Update MatchPlayer rows with final positions and payouts
    for (const placement of result) {
      const playerPayout = payouts.find((p) => p.userId === placement.userId);
      await (this.prisma as unknown as PrismaAny).matchPlayer.updateMany({
        where: {
          matchId: matchId as string,
          userId: placement.userId as string,
        },
        data: {
          finalPosition: placement.position,
          payoutCents: BigInt((playerPayout?.payoutCents ?? 0) as number),
        },
      });
    }

    // Update ELO ratings
    await this.updateRatings(gameId, result);

    return toMatch(
      { ...matchRow, status: MatchStatus.RESOLVED, resolvedAt },
      result,
    );
  }

  /**
   * Get a player's current ELO rating for a game.
   * Returns default 1200 for unrated players without persisting.
   */
  async getRating(userId: UserId, gameId: GameId): Promise<PlayerRating> {
    // We track ratings via MatchPlayer rows. For a clean getRating,
    // look at the most recent MatchPlayer for this user+game.
    const recent = await (this.prisma as unknown as PrismaAny).matchPlayer.findFirst({
      where: {
        userId: userId as string,
        match: { gameId: gameId as string },
      },
      orderBy: { joinedAt: 'desc' },
    });

    if (!recent) {
      return { userId, gameId, elo: 1200 };
    }

    return { userId, gameId, elo: recent.rating as number };
  }

  /**
   * Fetch current ratings, compute ELO updates, and persist new ratings.
   */
  private async updateRatings(
    gameId: GameId,
    result: MatchResult,
  ): Promise<void> {
    // Fetch current ratings for each player (from most recent match for this game)
    const playerRatings: number[] = [];
    const playerIds: UserId[] = [];
    const placements: number[] = [];

    for (const placement of result) {
      playerIds.push(placement.userId);
      placements.push(placement.position);

      const recent = await (this.prisma as unknown as PrismaAny).matchPlayer.findFirst({
        where: {
          userId: placement.userId as string,
          match: { gameId: gameId as string, status: MatchStatus.RESOLVED },
        },
        orderBy: { joinedAt: 'desc' },
      });

      playerRatings.push(recent ? (recent.rating as number) : 1200);
    }

    const newRatings = updateElo(playerRatings, placements);

    // The MatchPlayer rows for the current match were already created in createMatch.
    // Update them with the new post-match rating.
    // Note: we look up the matchPlayer for the current match (the one just resolved)
    // to update its rating to the post-match value.
    // We already wrote finalPosition above, now write updated rating.
    for (let i = 0; i < playerIds.length; i++) {
      // Find the MatchPlayer for this player in the most recent resolved match
      // Since we just resolved it, we can search for matches with this gameId that are RESOLVED
      const matchPlayers = await (this.prisma as unknown as PrismaAny).matchPlayer.findMany({
        where: {
          userId: playerIds[i] as string,
          match: { gameId: gameId as string, status: MatchStatus.RESOLVED },
        },
        orderBy: { joinedAt: 'desc' },
        take: 1,
      });

      if (matchPlayers.length > 0) {
        await (this.prisma as unknown as PrismaAny).matchPlayer.update({
          where: { id: matchPlayers[0].id },
          data: { rating: newRatings[i] },
        });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Prisma result → shared Match type mapping. */
function toMatch(
  row: Record<string, unknown>,
  result: MatchResult | null,
): Match {
  return {
    id: row.id as MatchId,
    gameId: row.gameId as GameId,
    status: row.status as MatchStatus,
    entryFeeCents: Number(row.entryFeeCents) as Money,
    prizePoolCents: Number(row.poolCents) as Money,
    rakeCents: Number(row.rakeCents) as Money,
    result,
    startedAt: row.updatedAt ? (row.updatedAt as Date) : null,
    endedAt: (row.resolvedAt as Date) ?? null,
  };
}

/**
 * Escape-hatch type for Prisma client method access.
 * PrismaClient generic types vary across generated clients;
 * we cast to this to access model methods without tying to a specific generation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaAny = Record<string, any>;
