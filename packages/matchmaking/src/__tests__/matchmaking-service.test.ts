/**
 * Matchmaking service tests.
 *
 * Uses vitest mocks for PrismaClient and WalletService.
 * No real database — same pattern as packages/wallet tests.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type {
  UserId,
  Money,
  MatchId,
  GameId,
  MatchResult,
  WalletService,
} from '@arena/shared';
import { ConflictError, MatchStatus, ValidationError } from '@arena/shared';
import { InMemoryMatchmakingService } from '../matchmaking-service.js';
import { WinnerTakesAllCalculator, BattleRoyaleTopThreeCalculator } from '../payout-calculator.js';
import type { PayoutCalculator } from '../payout-calculator.js';
import { MatchQueue } from '../queue.js';

/* ------------------------------------------------------------------ */
/*  Mock setup                                                         */
/* ------------------------------------------------------------------ */

function createMockWalletService(): WalletService {
  return {
    deposit: vi.fn().mockResolvedValue({ id: 'tx-refund' }),
    withdraw: vi.fn().mockResolvedValue({ id: 'tx-wd' }),
    deductEntryFee: vi.fn().mockResolvedValue({ id: 'tx-fee' }),
    awardPrize: vi.fn().mockResolvedValue({ id: 'tx-prize' }),
    collectRake: vi.fn().mockResolvedValue({ id: 'tx-rake' }),
    getBalance: vi.fn(),
    getTransactionHistory: vi.fn(),
  };
}

function createMockPrisma() {
  const matchCreate = vi.fn();
  const matchUpdate = vi.fn();
  const matchFindUnique = vi.fn();
  const matchPlayerCreate = vi.fn();
  const matchPlayerFindFirst = vi.fn();
  const matchPlayerFindMany = vi.fn();
  const matchPlayerUpdateMany = vi.fn();
  const matchPlayerUpdate = vi.fn();

  return {
    match: {
      create: matchCreate,
      update: matchUpdate,
      findUnique: matchFindUnique,
    },
    matchPlayer: {
      create: matchPlayerCreate,
      findFirst: matchPlayerFindFirst,
      findMany: matchPlayerFindMany,
      updateMany: matchPlayerUpdateMany,
      update: matchPlayerUpdate,
    },
    _mocks: {
      matchCreate,
      matchUpdate,
      matchFindUnique,
      matchPlayerCreate,
      matchPlayerFindFirst,
      matchPlayerFindMany,
      matchPlayerUpdateMany,
      matchPlayerUpdate,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const user1 = 'user-1' as UserId;
const user2 = 'user-2' as UserId;
const user3 = 'user-3' as UserId;
const user4 = 'user-4' as UserId;
const gameId = 'agario' as GameId;
const fee500 = 500 as Money;

function makeMatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-uuid',
    gameId: gameId as string,
    status: MatchStatus.IN_PROGRESS,
    entryFeeCents: BigInt(500),
    poolCents: BigInt(920),
    rakeCents: BigInt(80),
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    players: [
      { id: 'mp-1', matchId: 'match-uuid', userId: 'user-1', rating: 1200 },
      { id: 'mp-2', matchId: 'match-uuid', userId: 'user-2', rating: 1200 },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('InMemoryMatchmakingService', () => {
  let walletService: WalletService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let calculators: Map<GameId, PayoutCalculator>;
  let queue: MatchQueue;
  let service: InMemoryMatchmakingService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    walletService = createMockWalletService();
    prisma = createMockPrisma();
    calculators = new Map<GameId, PayoutCalculator>();
    calculators.set(gameId, new WinnerTakesAllCalculator());
    queue = new MatchQueue();

    // Default mock implementations
    prisma.match.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      players: [],
    }));
    prisma.match.update.mockImplementation(async (args: { data: Record<string, unknown>; where: Record<string, unknown> }) => ({
      id: args.where.id,
      gameId: gameId as string,
      entryFeeCents: BigInt(500),
      poolCents: BigInt(920),
      rakeCents: BigInt(80),
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      ...args.data,
    }));
    prisma.matchPlayer.create.mockResolvedValue({ id: 'mp-new' });
    prisma.matchPlayer.findFirst.mockResolvedValue(null);
    prisma.matchPlayer.findMany.mockResolvedValue([]);
    prisma.matchPlayer.updateMany.mockResolvedValue({ count: 1 });
    prisma.matchPlayer.update.mockResolvedValue({ id: 'mp-updated' });

    service = new InMemoryMatchmakingService(
      walletService,
      prisma as unknown as import('@prisma/client').PrismaClient,
      calculators,
      queue,
    );
  });

  /* ================================================================ */
  /*  joinQueue / leaveQueue                                          */
  /* ================================================================ */

  describe('joinQueue', () => {
    it('adds player to queue', async () => {
      await service.joinQueue(user1, gameId, fee500);
      expect(queue.hasPlayer(user1, gameId)).toBe(true);
    });

    it('entryFee <= 0 throws ValidationError', async () => {
      await expect(service.joinQueue(user1, gameId, 0 as Money)).rejects.toThrow(ValidationError);
      await expect(service.joinQueue(user1, gameId, -10 as Money)).rejects.toThrow(ValidationError);
    });
  });

  describe('leaveQueue', () => {
    it('joinQueue then leaveQueue: queue empty, no DB/wallet calls', async () => {
      await service.joinQueue(user1, gameId, fee500);
      await service.leaveQueue(user1, gameId);
      expect(queue.hasPlayer(user1, gameId)).toBe(false);
      expect(walletService.deposit).not.toHaveBeenCalled();
      expect(walletService.deductEntryFee).not.toHaveBeenCalled();
      expect(prisma.match.create).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  createMatch                                                      */
  /* ================================================================ */

  describe('createMatch', () => {
    it('happy path: 2 players → Match created, fees deducted, status IN_PROGRESS', async () => {
      queue.add(user1, gameId, fee500);
      queue.add(user2, gameId, fee500);

      const match = await service.createMatch(gameId, [user1, user2], fee500);
      expect(match.status).toBe(MatchStatus.IN_PROGRESS);
      expect(match.gameId).toBe(gameId);
      expect(walletService.deductEntryFee).toHaveBeenCalledTimes(2);
      expect(prisma.match.create).toHaveBeenCalledTimes(1);
      expect(queue.hasPlayer(user1, gameId)).toBe(false);
      expect(queue.hasPlayer(user2, gameId)).toBe(false);
    });

    it('4 players all succeed → 4 deductEntryFee calls, status IN_PROGRESS', async () => {
      const match = await service.createMatch(gameId, [user1, user2, user3, user4], fee500);
      expect(match.status).toBe(MatchStatus.IN_PROGRESS);
      expect(walletService.deductEntryFee).toHaveBeenCalledTimes(4);
    });

    it('compensating refund: 3rd player fails → 2 refund deposits, CANCELLED, error rethrown', async () => {
      const deductMock = vi.fn()
        .mockResolvedValueOnce({ id: 'tx-1' })
        .mockResolvedValueOnce({ id: 'tx-2' })
        .mockRejectedValueOnce(new Error('Insufficient funds'));
      (walletService as { deductEntryFee: typeof deductMock }).deductEntryFee = deductMock;

      await expect(
        service.createMatch(gameId, [user1, user2, user3], fee500),
      ).rejects.toThrow('Insufficient funds');

      // 2 refund deposits for the 2 successful deductions
      expect(walletService.deposit).toHaveBeenCalledTimes(2);
      // Refunds in reverse order
      expect((walletService.deposit as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(user2);
      expect((walletService.deposit as ReturnType<typeof vi.fn>).mock.calls[1]![0]).toBe(user1);
      const createdMatchId = prisma.match.create.mock.calls[0]![0].data.id as string;
      expect((walletService.deposit as ReturnType<typeof vi.fn>).mock.calls[0]![3]).toBe(
        `refund-${createdMatchId}-${user2}`,
      );
      expect((walletService.deposit as ReturnType<typeof vi.fn>).mock.calls[1]![3]).toBe(
        `refund-${createdMatchId}-${user1}`,
      );
      // Match cancelled
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MatchStatus.CANCELLED }),
        }),
      );
    });

    it('ConflictError during deduction is refunded, match is cancelled, and the same ConflictError is rethrown', async () => {
      const conflict = new ConflictError('Serialization failure', { retryable: true });
      const deductMock = vi.fn()
        .mockResolvedValueOnce({ id: 'tx-1' })
        .mockResolvedValueOnce({ id: 'tx-2' })
        .mockRejectedValueOnce(conflict);
      (walletService as { deductEntryFee: typeof deductMock }).deductEntryFee = deductMock;

      await expect(
        service.createMatch(gameId, [user1, user2, user3], fee500),
      ).rejects.toBe(conflict);

      expect(walletService.deposit).toHaveBeenCalledTimes(2);
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MatchStatus.CANCELLED }),
        }),
      );
    });

    it('refund-failure resilience: refund fails on first of 2 → second still attempted, CANCELLED', async () => {
      const deductMock = vi.fn()
        .mockResolvedValueOnce({ id: 'tx-1' })
        .mockResolvedValueOnce({ id: 'tx-2' })
        .mockRejectedValueOnce(new Error('Deduction failed'));
      (walletService as { deductEntryFee: typeof deductMock }).deductEntryFee = deductMock;

      const depositMock = vi.fn()
        .mockRejectedValueOnce(new Error('Refund failed'))  // first refund fails
        .mockResolvedValueOnce({ id: 'refund-2' });         // second refund succeeds
      (walletService as { deposit: typeof depositMock }).deposit = depositMock;

      await expect(
        service.createMatch(gameId, [user1, user2, user3], fee500),
      ).rejects.toThrow('Deduction failed');

      // Both refunds attempted
      expect(depositMock).toHaveBeenCalledTimes(2);
      // Match still cancelled
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MatchStatus.CANCELLED }),
        }),
      );
    });

    it('duplicate playerIds → validation throw, no DB/wallet writes', async () => {
      await expect(
        service.createMatch(gameId, [user1, user1], fee500),
      ).rejects.toThrow(ValidationError);
      expect(walletService.deductEntryFee).not.toHaveBeenCalled();
      expect(prisma.match.create).not.toHaveBeenCalled();
    });

    it('less than 2 players → validation throw', async () => {
      await expect(
        service.createMatch(gameId, [user1], fee500),
      ).rejects.toThrow(ValidationError);
    });

    it('entryFeeCents <= 0 → validation throw', async () => {
      await expect(
        service.createMatch(gameId, [user1, user2], 0 as Money),
      ).rejects.toThrow(ValidationError);
    });

    it('non-integer entryFeeCents → validation throw', async () => {
      await expect(
        service.createMatch(gameId, [user1, user2], 12.5 as Money),
      ).rejects.toThrow(ValidationError);
    });
  });

  /* ================================================================ */
  /*  resolveMatch                                                     */
  /* ================================================================ */

  describe('resolveMatch', () => {
    const matchId = 'match-uuid' as MatchId;

    it('happy path: 2 players, WinnerTakesAll → rake collected, prize awarded, RESOLVED', async () => {
      prisma.match.findUnique.mockResolvedValue(makeMatchRow());

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      const match = await service.resolveMatch(matchId, result);
      expect(match.status).toBe(MatchStatus.RESOLVED);
      expect(match.result).toEqual([
        { userId: user1, position: 1, payoutCents: 920 },
        { userId: user2, position: 2, payoutCents: 0 },
      ]);
      expect(walletService.collectRake).toHaveBeenCalledWith(matchId, 80, `rake-${matchId}`);
      expect(walletService.awardPrize).toHaveBeenCalledWith(user1, matchId, 920, `prize-${matchId}-${user1}`);
      // 2nd place gets 0, so awardPrize not called for them
      expect(walletService.awardPrize).toHaveBeenCalledTimes(1);
    });

    it('idempotent: second call on RESOLVED match is no-op and returns persisted result', async () => {
      prisma.match.findUnique.mockResolvedValue(
        makeMatchRow({
          status: MatchStatus.RESOLVED,
          resolvedAt: new Date(),
          players: [
            {
              id: 'mp-1',
              matchId: 'match-uuid',
              userId: 'user-1',
              rating: 1216,
              finalPosition: 1,
              payoutCents: BigInt(920),
            },
            {
              id: 'mp-2',
              matchId: 'match-uuid',
              userId: 'user-2',
              rating: 1184,
              finalPosition: 2,
              payoutCents: BigInt(0),
            },
          ],
        }),
      );

      const result: MatchResult = [
        { userId: user2, position: 1, payoutCents: 999 as Money },
        { userId: user1, position: 2, payoutCents: 111 as Money },
      ];

      const match = await service.resolveMatch(matchId, result);
      expect(match.status).toBe(MatchStatus.RESOLVED);
      expect(match.result).toEqual([
        { userId: user1, position: 1, payoutCents: 920 },
        { userId: user2, position: 2, payoutCents: 0 },
      ]);
      // No additional wallet/DB writes
      expect(walletService.collectRake).not.toHaveBeenCalled();
      expect(walletService.awardPrize).not.toHaveBeenCalled();
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('already CANCELLED → throws', async () => {
      prisma.match.findUnique.mockResolvedValue(
        makeMatchRow({ status: MatchStatus.CANCELLED }),
      );

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow(
        /cancelled/i,
      );
      expect(walletService.collectRake).not.toHaveBeenCalled();
    });

    it('no calculator for gameId → throws, no wallet writes', async () => {
      const unknownGame = 'unknown-game' as GameId;
      prisma.match.findUnique.mockResolvedValue(
        makeMatchRow({ gameId: unknownGame }),
      );

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow(
        /PayoutCalculator/,
      );
      expect(walletService.collectRake).not.toHaveBeenCalled();
      expect(walletService.awardPrize).not.toHaveBeenCalled();
    });

    it('invariant violation (calculator returns sum ≠ pool) → throws before wallet writes', async () => {
      // Use a broken calculator that returns wrong amounts
      const brokenCalc: PayoutCalculator = {
        calculate: () => [
          { userId: user1, payoutCents: 999 as Money },
          { userId: user2, payoutCents: 0 as Money },
        ],
      };
      calculators.set(gameId, brokenCalc);

      prisma.match.findUnique.mockResolvedValue(makeMatchRow());

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow(
        /payout sum/i,
      );
      // CRITICAL: rake was NOT collected
      expect(walletService.collectRake).not.toHaveBeenCalled();
      expect(walletService.awardPrize).not.toHaveBeenCalled();
    });

    it('match not found → throws', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
      ];

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow(
        /not found/i,
      );
    });

    it('empty result → throws', async () => {
      prisma.match.findUnique.mockResolvedValue(makeMatchRow());
      await expect(service.resolveMatch(matchId, [])).rejects.toThrow(ValidationError);
    });

    it('non-contiguous positions → throws', async () => {
      prisma.match.findUnique.mockResolvedValue(makeMatchRow());
      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 3, payoutCents: 0 as Money },
      ];
      await expect(service.resolveMatch(matchId, result)).rejects.toThrow(ValidationError);
    });

    it('result containing a player not in the match → throws before money moves', async () => {
      prisma.match.findUnique.mockResolvedValue(makeMatchRow());
      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: 'attacker' as UserId, position: 2, payoutCents: 0 as Money },
      ];

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow(ValidationError);
      expect(walletService.collectRake).not.toHaveBeenCalled();
      expect(walletService.awardPrize).not.toHaveBeenCalled();
    });

    it('duplicate players in result → throws before money moves', async () => {
      prisma.match.findUnique.mockResolvedValue(
        makeMatchRow({
          poolCents: BigInt(1380),
          rakeCents: BigInt(120),
          players: [
            { id: 'mp-1', matchId: 'match-uuid', userId: 'user-1', rating: 1200 },
            { id: 'mp-2', matchId: 'match-uuid', userId: 'user-2', rating: 1200 },
            { id: 'mp-3', matchId: 'match-uuid', userId: 'user-3', rating: 1200 },
          ],
        }),
      );

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
        { userId: user1, position: 3, payoutCents: 0 as Money },
      ];

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow(ValidationError);
      expect(walletService.collectRake).not.toHaveBeenCalled();
      expect(walletService.awardPrize).not.toHaveBeenCalled();
    });

    it('zero rake skips collectRake but still awards prizes', async () => {
      prisma.match.findUnique.mockResolvedValue(
        makeMatchRow({
          entryFeeCents: BigInt(1),
          poolCents: BigInt(2),
          rakeCents: BigInt(0),
        }),
      );

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      const match = await service.resolveMatch(matchId, result);
      expect(match.result).toEqual([
        { userId: user1, position: 1, payoutCents: 2 },
        { userId: user2, position: 2, payoutCents: 0 },
      ]);
      expect(walletService.collectRake).not.toHaveBeenCalled();
      expect(walletService.awardPrize).toHaveBeenCalledWith(user1, matchId, 2, `prize-${matchId}-${user1}`);
    });

    it('invalid payout calculator output → throws before money moves', async () => {
      const brokenCalc: PayoutCalculator = {
        calculate: () => [
          { userId: 'outsider' as UserId, payoutCents: 920 as Money },
        ],
      };
      calculators.set(gameId, brokenCalc);
      prisma.match.findUnique.mockResolvedValue(makeMatchRow());

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow(ValidationError);
      expect(walletService.collectRake).not.toHaveBeenCalled();
      expect(walletService.awardPrize).not.toHaveBeenCalled();
    });

    it('uses prior resolved ratings and updates the current match rows, not the newest resolved row by accident', async () => {
      prisma.match.findUnique.mockResolvedValue(makeMatchRow());
      prisma.matchPlayer.findFirst.mockImplementation(
        async (args: { where: { userId: string; match: { id?: { not?: string } } } }) => {
          if (!args.where.match.id?.not) {
            return { rating: 1200 };
          }

          return args.where.userId === 'user-1' ? { rating: 1400 } : { rating: 1200 };
        },
      );

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      await service.resolveMatch(matchId, result);

      expect(prisma.matchPlayer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            match: expect.objectContaining({
              status: MatchStatus.RESOLVED,
              id: { not: matchId },
            }),
          }),
        }),
      );

      const ratingUpdates = prisma.matchPlayer.updateMany.mock.calls.slice(-2);
      expect(ratingUpdates).toEqual([
        [
          {
            where: { matchId, userId: 'user-1' },
            data: { rating: 1408 },
          },
        ],
        [
          {
            where: { matchId, userId: 'user-2' },
            data: { rating: 1192 },
          },
        ],
      ]);
    });

    it('multi-prize retry reuses deterministic idempotency keys and does not double-award earlier winners', async () => {
      calculators.set(gameId, new BattleRoyaleTopThreeCalculator());
      prisma.match.findUnique.mockResolvedValue(
        makeMatchRow({
          poolCents: BigInt(1840),
          rakeCents: BigInt(160),
          players: [
            { id: 'mp-1', matchId: 'match-uuid', userId: 'user-1', rating: 1200 },
            { id: 'mp-2', matchId: 'match-uuid', userId: 'user-2', rating: 1200 },
            { id: 'mp-3', matchId: 'match-uuid', userId: 'user-3', rating: 1200 },
            { id: 'mp-4', matchId: 'match-uuid', userId: 'user-4', rating: 1200 },
          ],
        }),
      );

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
        { userId: user3, position: 3, payoutCents: 0 as Money },
        { userId: user4, position: 4, payoutCents: 0 as Money },
      ];

      const prizeMutationCounts = new Map<string, number>();
      const seenPrizeKeys = new Set<string>();
      const seenRakeKeys = new Set<string>();
      let failSecondPrizeOnce = true;

      (walletService.collectRake as ReturnType<typeof vi.fn>).mockImplementation(
        async (
          calledMatchId: MatchId,
          _amountCents: Money,
          idempotencyKey?: string,
        ) => {
          expect(calledMatchId).toBe(matchId);
          expect(idempotencyKey).toBe(`rake-${matchId}`);

          if (idempotencyKey && seenRakeKeys.has(idempotencyKey)) {
            return { id: `existing-${idempotencyKey}` };
          }

          if (idempotencyKey) {
            seenRakeKeys.add(idempotencyKey);
          }

          return { id: `new-${idempotencyKey}` };
        },
      );

      (walletService.awardPrize as ReturnType<typeof vi.fn>).mockImplementation(
        async (
          awardedUserId: UserId,
          calledMatchId: MatchId,
          amountCents: Money,
          idempotencyKey?: string,
        ) => {
          expect(calledMatchId).toBe(matchId);
          expect(idempotencyKey).toBe(`prize-${matchId}-${awardedUserId}`);

          if (!idempotencyKey) {
            throw new Error('Missing idempotencyKey');
          }

          if (awardedUserId === user2 && failSecondPrizeOnce) {
            failSecondPrizeOnce = false;
            throw new Error('user2 payout failed');
          }

          if (seenPrizeKeys.has(idempotencyKey)) {
            return { id: `existing-${idempotencyKey}`, amountCents, reference: idempotencyKey };
          }

          seenPrizeKeys.add(idempotencyKey);
          prizeMutationCounts.set(
            idempotencyKey,
            (prizeMutationCounts.get(idempotencyKey) ?? 0) + 1,
          );

          return { id: `new-${idempotencyKey}`, amountCents, reference: idempotencyKey };
        },
      );

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow('user2 payout failed');
      expect(prisma.match.update).not.toHaveBeenCalled();

      const retryMatch = await service.resolveMatch(matchId, result);
      expect(retryMatch.status).toBe(MatchStatus.RESOLVED);
      expect(retryMatch.result).toEqual([
        { userId: user1, position: 1, payoutCents: 1104 },
        { userId: user2, position: 2, payoutCents: 460 },
        { userId: user3, position: 3, payoutCents: 276 },
        { userId: user4, position: 4, payoutCents: 0 },
      ]);

      expect((walletService.awardPrize as ReturnType<typeof vi.fn>).mock.calls).toEqual([
        [user1, matchId, 1104, `prize-${matchId}-${user1}`],
        [user2, matchId, 460, `prize-${matchId}-${user2}`],
        [user1, matchId, 1104, `prize-${matchId}-${user1}`],
        [user2, matchId, 460, `prize-${matchId}-${user2}`],
        [user3, matchId, 276, `prize-${matchId}-${user3}`],
      ]);
      expect(prizeMutationCounts.get(`prize-${matchId}-${user1}`)).toBe(1);
      expect(prizeMutationCounts.get(`prize-${matchId}-${user2}`)).toBe(1);
      expect(prizeMutationCounts.get(`prize-${matchId}-${user3}`)).toBe(1);
      expect(prizeMutationCounts.has(`prize-${matchId}-${user4}`)).toBe(false);
      expect(seenRakeKeys.size).toBe(1);
    });

    it('post-payout persistence failure leaves the match retryable until a later retry succeeds', async () => {
      prisma.match.findUnique.mockResolvedValue(makeMatchRow());

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      prisma.matchPlayer.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.resolveMatch(matchId, result)).rejects.toThrow('DB connection lost');
      expect(prisma.match.update).not.toHaveBeenCalled();
      expect(walletService.awardPrize).toHaveBeenCalledWith(
        user1, matchId, 920, `prize-${matchId}-${user1}`,
      );

      vi.clearAllMocks();
      vi.spyOn(console, 'error').mockImplementation(() => {});

      prisma.match.findUnique.mockResolvedValue(makeMatchRow());
      prisma.matchPlayer.updateMany.mockResolvedValue({ count: 1 });
      prisma.matchPlayer.findFirst.mockResolvedValue(null);
      prisma.match.update.mockImplementation(async (args: { data: Record<string, unknown>; where: Record<string, unknown> }) => ({
        id: args.where.id,
        gameId: gameId as string,
        entryFeeCents: BigInt(500),
        poolCents: BigInt(920),
        rakeCents: BigInt(80),
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: null,
        ...args.data,
      }));

      const existingPrizeTx = { id: 'tx-prize-existing', type: 'PRIZE', amountCents: 920 };
      (walletService.awardPrize as ReturnType<typeof vi.fn>).mockResolvedValue(existingPrizeTx);
      (walletService.collectRake as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tx-rake-existing' });

      const retryMatch = await service.resolveMatch(matchId, result);
      expect(retryMatch.status).toBe(MatchStatus.RESOLVED);
      expect(walletService.awardPrize).toHaveBeenCalledWith(
        user1, matchId, 920, `prize-${matchId}-${user1}`,
      );
      expect(walletService.awardPrize).toHaveBeenCalledTimes(1);
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: matchId },
          data: expect.objectContaining({ status: MatchStatus.RESOLVED }),
        }),
      );
    });

    it('rating update failure is logged and tolerated after payouts succeed', async () => {
      prisma.match.findUnique.mockResolvedValue(makeMatchRow());
      prisma.matchPlayer.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error('ratings failed'));

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      const match = await service.resolveMatch(matchId, result);
      expect(match.status).toBe(MatchStatus.RESOLVED);
      expect(walletService.collectRake).toHaveBeenCalledWith(matchId, 80, `rake-${matchId}`);
      expect(walletService.awardPrize).toHaveBeenCalledWith(user1, matchId, 920, `prize-${matchId}-${user1}`);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to update matchmaking ratings after match resolution',
        expect.objectContaining({
          matchId,
          gameId,
          error: 'ratings failed',
        }),
      );
    });
  });

  /* ================================================================ */
  /*  getRating                                                        */
  /* ================================================================ */

  describe('getRating', () => {
    it('unrated player returns 1200, no DB write', async () => {
      prisma.matchPlayer.findFirst.mockResolvedValue(null);
      const rating = await service.getRating(user1, gameId);
      expect(rating).toEqual({ userId: user1, gameId, elo: 1200 });
      expect(prisma.matchPlayer.create).not.toHaveBeenCalled();
    });

    it('rated player returns stored rating', async () => {
      prisma.matchPlayer.findFirst.mockResolvedValue({ rating: 1350 });
      const rating = await service.getRating(user1, gameId);
      expect(rating.elo).toBe(1350);
    });

    it('queries only resolved matches so newer in-progress rows do not reset the visible rating', async () => {
      prisma.matchPlayer.findFirst.mockImplementation(
        async (args: { where: { match?: { status?: MatchStatus } } }) => {
          if (args.where.match?.status === MatchStatus.RESOLVED) {
            return { rating: 1375 };
          }

          return { rating: 1200 };
        },
      );

      const rating = await service.getRating(user1, gameId);
      expect(rating).toEqual({ userId: user1, gameId, elo: 1375 });
      expect(prisma.matchPlayer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            match: expect.objectContaining({ status: MatchStatus.RESOLVED }),
          }),
        }),
      );
    });
  });
});
