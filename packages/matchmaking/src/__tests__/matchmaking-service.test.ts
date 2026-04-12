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
import { MatchStatus, ValidationError } from '@arena/shared';
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
      const match = await service.createMatch(gameId, [user1, user2], fee500);
      expect(match.status).toBe(MatchStatus.IN_PROGRESS);
      expect(match.gameId).toBe(gameId);
      expect(walletService.deductEntryFee).toHaveBeenCalledTimes(2);
      expect(prisma.match.create).toHaveBeenCalledTimes(1);
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
      // Match cancelled
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
      expect(walletService.collectRake).toHaveBeenCalledWith(matchId, 80, `rake-${matchId}`);
      expect(walletService.awardPrize).toHaveBeenCalledWith(user1, matchId, 920);
      // 2nd place gets 0, so awardPrize not called for them
      expect(walletService.awardPrize).toHaveBeenCalledTimes(1);
    });

    it('idempotent: second call on RESOLVED match is no-op', async () => {
      prisma.match.findUnique.mockResolvedValue(
        makeMatchRow({ status: MatchStatus.RESOLVED, resolvedAt: new Date() }),
      );

      const result: MatchResult = [
        { userId: user1, position: 1, payoutCents: 0 as Money },
        { userId: user2, position: 2, payoutCents: 0 as Money },
      ];

      const match = await service.resolveMatch(matchId, result);
      expect(match.status).toBe(MatchStatus.RESOLVED);
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
  });
});
