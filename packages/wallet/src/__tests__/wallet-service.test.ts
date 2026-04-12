/**
 * Wallet service tests — packages/wallet.
 *
 * APPROACH: Uses vitest mocks for the Prisma client. prisma.$transaction is mocked
 * to execute its callback synchronously with the mock client, allowing verification
 * of all Prisma calls, arguments, and business logic without a real database.
 *
 * Race condition tests that require truly concurrent database operations are marked
 * with .skip and include comments describing what they would verify against a real
 * PostgreSQL instance with SERIALIZABLE isolation.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { UserId, Money, MatchId } from '@arena/shared';
import {
  ValidationError,
  InsufficientFundsError,
  NotFoundError,
  ConflictError,
} from '@arena/shared';

/* ------------------------------------------------------------------ */
/*  Mock setup                                                         */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => {
  class MockPrismaError extends Error {
    code: string;
    meta?: Record<string, unknown>;
    constructor(message: string, opts: { code: string; meta?: Record<string, unknown> }) {
      super(message);
      this.code = opts.code;
      this.meta = opts.meta;
    }
  }

  const wallet = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  };
  const transaction = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  };
  const ledgerEntry = {
    createMany: vi.fn(),
  };
  const user = {
    upsert: vi.fn(),
  };
  const $transaction = vi.fn();

  return {
    prisma: { wallet, transaction, ledgerEntry, user, $transaction },
    wallet,
    transaction,
    ledgerEntry,
    user,
    $transaction,
    MockPrismaError,
  };
});

vi.mock('@arena/database', () => ({
  prisma: mocks.prisma,
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: 'Serializable',
    },
    PrismaClientKnownRequestError: mocks.MockPrismaError,
  },
}));

import { WalletServiceImpl } from '../wallet-service.js';

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const SYSTEM_WALLET_IDS = {
  platformSuspenseWalletId: 'sys-suspense-wallet',
  matchPoolWalletId: 'sys-match-pool-wallet',
  platformRevenueWalletId: 'sys-revenue-wallet',
};

const SYSTEM_SUSPENSE_WALLET = {
  id: 'sys-suspense-wallet',
  userId: 'SYSTEM_PLATFORM_SUSPENSE',
  balanceCents: BigInt(0),
  currency: 'USD',
  version: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const SYSTEM_MATCH_POOL_WALLET = {
  id: 'sys-match-pool-wallet',
  userId: 'SYSTEM_MATCH_POOL',
  balanceCents: BigInt(0),
  currency: 'USD',
  version: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const SYSTEM_REVENUE_WALLET = {
  id: 'sys-revenue-wallet',
  userId: 'SYSTEM_PLATFORM_REVENUE',
  balanceCents: BigInt(0),
  currency: 'USD',
  version: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function makeUserWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wallet-1', userId: 'user-1', balanceCents: BigInt(10_000),
    currency: 'USD', version: 1, createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01'),
    ...overrides,
  };
}

function makeTxRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1', walletId: 'wallet-1', userId: 'user-1', type: 'DEPOSIT', status: 'COMPLETED',
    amountCents: BigInt(1000), matchId: null, referenceId: null, description: null,
    createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-04-01'),
    ...overrides,
  };
}

function setupWalletFindUnique(
  userWallet: ReturnType<typeof makeUserWallet> | null,
  systemOverrides?: { suspenseBalance?: bigint; matchPoolBalance?: bigint; revenueBalance?: bigint },
) {
  mocks.wallet.findUnique.mockImplementation(
    async (args: { where: { userId?: string; id?: string }; select?: unknown }) => {
      if (args.where.id === SYSTEM_WALLET_IDS.platformSuspenseWalletId)
        return { ...SYSTEM_SUSPENSE_WALLET, balanceCents: systemOverrides?.suspenseBalance ?? BigInt(0) };
      if (args.where.id === SYSTEM_WALLET_IDS.matchPoolWalletId)
        return { ...SYSTEM_MATCH_POOL_WALLET, balanceCents: systemOverrides?.matchPoolBalance ?? BigInt(0) };
      if (args.where.id === SYSTEM_WALLET_IDS.platformRevenueWalletId)
        return { ...SYSTEM_REVENUE_WALLET, balanceCents: systemOverrides?.revenueBalance ?? BigInt(0) };
      return userWallet;
    },
  );
}

function assertLedgerBalanced(callIndex = 0) {
  const call = mocks.ledgerEntry.createMany.mock.calls[callIndex];
  expect(call).toBeDefined();
  const entries = (call as [{ data: Array<{ debitCents: bigint; creditCents: bigint; walletId: string }> }])[0].data;
  const totalDebits = entries.reduce((s: bigint, e: { debitCents: bigint }) => s + e.debitCents, BigInt(0));
  const totalCredits = entries.reduce((s: bigint, e: { creditCents: bigint }) => s + e.creditCents, BigInt(0));
  expect(totalDebits).toBe(totalCredits);
  return { totalDebits, totalCredits, entries };
}

/* ------------------------------------------------------------------ */
/*  Test suite                                                         */
/* ------------------------------------------------------------------ */

describe('WalletServiceImpl', () => {
  let service: WalletServiceImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    service = new WalletServiceImpl(SYSTEM_WALLET_IDS);

    mocks.$transaction.mockImplementation(
      async (fn: (tx: typeof mocks.prisma) => Promise<unknown>, _options?: unknown) => fn(mocks.prisma),
    );
    mocks.wallet.updateMany.mockResolvedValue({ count: 1 });
    mocks.ledgerEntry.createMany.mockResolvedValue({ count: 2 });
    mocks.transaction.findUnique.mockResolvedValue(null);
  });

  /* ================================================================ */
  /*  HAPPY PATH TESTS                                                */
  /* ================================================================ */

  describe('deposit', () => {
    it('credits wallet and creates correct ledger entries with double-sided posting', async () => {
      const userWallet = makeUserWallet({ balanceCents: BigInt(5000), version: 3 });
      setupWalletFindUnique(userWallet);
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ amountCents: BigInt(1000), referenceId: 'ref-1' }),
      );

      const result = await service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-1');

      expect(result.id).toBe('tx-1');
      expect(result.type).toBe('DEPOSIT');
      expect(result.amountCents).toBe(1000);
      expect(result.reference).toBe('ref-1');

      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'wallet-1', version: 3 },
        data: { balanceCents: BigInt(6000), version: 4 },
      });
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-suspense-wallet', version: 0 },
        data: { balanceCents: BigInt(-1000), version: 1 },
      });

      expect(mocks.$transaction).toHaveBeenCalledWith(
        expect.any(Function), { isolationLevel: 'Serializable' },
      );
      const { totalDebits } = assertLedgerBalanced();
      expect(totalDebits).toBe(BigInt(1000));
    });
  });

  describe('withdraw', () => {
    it('debits wallet and creates correct ledger entries with double-sided posting', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000), version: 2 }), { suspenseBalance: BigInt(-5000) });
      mocks.transaction.create.mockResolvedValue(makeTxRecord({ type: 'WITHDRAWAL', amountCents: BigInt(2000) }));

      const result = await service.withdraw('user-1' as UserId, 2000 as Money, 'crypto');

      expect(result.type).toBe('WITHDRAWAL');
      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'wallet-1', version: 2 }, data: { balanceCents: BigInt(3000), version: 3 },
      });
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-suspense-wallet', version: 0 }, data: { balanceCents: BigInt(-3000), version: 1 },
      });
      assertLedgerBalanced();
    });
  });

  describe('deductEntryFee', () => {
    it('debits wallet and marks transaction with matchId, credits match_pool', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000), version: 1 }));
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'ENTRY_FEE', amountCents: BigInt(500), matchId: 'match-1' }),
      );

      const result = await service.deductEntryFee('user-1' as UserId, 'match-1' as MatchId, 500 as Money);

      expect(result.type).toBe('ENTRY_FEE');
      expect(result.matchId).toBe('match-1');
      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'wallet-1', version: 1 }, data: { balanceCents: BigInt(4500), version: 2 },
      });
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-match-pool-wallet', version: 0 }, data: { balanceCents: BigInt(500), version: 1 },
      });
      assertLedgerBalanced();
    });
  });

  describe('awardPrize', () => {
    it('credits wallet from match_pool with double-sided posting', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000), version: 5 }), { matchPoolBalance: BigInt(10000) });
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'PRIZE', amountCents: BigInt(3000), matchId: 'match-2' }),
      );

      const result = await service.awardPrize('user-1' as UserId, 'match-2' as MatchId, 3000 as Money);

      expect(result.type).toBe('PRIZE');
      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'wallet-1', version: 5 }, data: { balanceCents: BigInt(8000), version: 6 },
      });
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-match-pool-wallet', version: 0 }, data: { balanceCents: BigInt(7000), version: 1 },
      });
      assertLedgerBalanced();
    });

    it('throws InsufficientFundsError when match_pool has insufficient funds', async () => {
      setupWalletFindUnique(makeUserWallet(), { matchPoolBalance: BigInt(100) });
      await expect(service.awardPrize('user-1' as UserId, 'match-5' as MatchId, 5000 as Money)).rejects.toThrow(InsufficientFundsError);
    });
  });

  describe('collectRake', () => {
    it('creates RAKE transaction moving money from match_pool to platform_revenue', async () => {
      setupWalletFindUnique(null, { matchPoolBalance: BigInt(5000), revenueBalance: BigInt(200) });
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ id: 'rake-tx-1', walletId: 'sys-match-pool-wallet', userId: 'SYSTEM_MATCH_POOL', type: 'RAKE', amountCents: BigInt(800), matchId: 'match-10' }),
      );

      const result = await service.collectRake('match-10' as MatchId, 800 as Money);

      expect(result.id).toBe('rake-tx-1');
      expect(result.type).toBe('RAKE');
      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'sys-match-pool-wallet', version: 0 }, data: { balanceCents: BigInt(4200), version: 1 },
      });
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-revenue-wallet', version: 0 }, data: { balanceCents: BigInt(1000), version: 1 },
      });
      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('sys-match-pool-wallet');
      expect(entries[1]!.walletId).toBe('sys-revenue-wallet');
    });

    it('throws InsufficientFundsError when match_pool balance < rake', async () => {
      setupWalletFindUnique(null, { matchPoolBalance: BigInt(50) });
      await expect(service.collectRake('match-11' as MatchId, 800 as Money)).rejects.toThrow(InsufficientFundsError);
    });
  });

  describe('getBalance', () => {
    it('returns current balance as shared Wallet type', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(7777) }));
      const wallet = await service.getBalance('user-1' as UserId);
      expect(wallet.userId).toBe('user-1');
      expect(wallet.balanceCents).toBe(7777);
    });
  });

  describe('getTransactionHistory', () => {
    it('returns transactions in descending createdAt order with pagination', async () => {
      setupWalletFindUnique(makeUserWallet());
      const tx1 = makeTxRecord({ id: 'tx-1', createdAt: new Date('2026-04-01') });
      const tx2 = makeTxRecord({ id: 'tx-2', createdAt: new Date('2026-04-02') });
      mocks.transaction.findMany.mockResolvedValue([tx2, tx1]);
      mocks.transaction.count.mockResolvedValue(2);

      const result = await service.getTransactionHistory('user-1' as UserId, { offset: 0, limit: 50 });
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.id).toBe('tx-2');
      expect(result.total).toBe(2);
    });

    it('caps limit at 100', async () => {
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findMany.mockResolvedValue([]);
      mocks.transaction.count.mockResolvedValue(0);
      await service.getTransactionHistory('user-1' as UserId, { offset: 0, limit: 500 });
      expect(mocks.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    });
  });

  /* ================================================================ */
  /*  IDEMPOTENCY TESTS                                               */
  /* ================================================================ */

  describe('idempotency', () => {
    it('deposit with duplicate reference returns existing transaction without crediting wallet twice', async () => {
      const existingTx = makeTxRecord({ id: 'existing-tx', referenceId: 'dup-ref', type: 'DEPOSIT', userId: 'user-1' });
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(existingTx);

      const result = await service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'dup-ref');
      expect(result.id).toBe('existing-tx');
      expect(mocks.transaction.create).not.toHaveBeenCalled();
      expect(mocks.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('withdraw with duplicate idempotencyKey returns existing transaction without debiting wallet twice', async () => {
      const existingTx = makeTxRecord({ id: 'existing-wd', type: 'WITHDRAWAL', userId: 'user-1', referenceId: 'wd-key-1' });
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(existingTx);

      const result = await service.withdraw('user-1' as UserId, 500 as Money, 'crypto', 'wd-key-1');
      expect(result.id).toBe('existing-wd');
      expect(mocks.transaction.create).not.toHaveBeenCalled();
    });

    it('withdraw without idempotencyKey creates a new transaction each time', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000) }));
      mocks.transaction.create.mockResolvedValue(makeTxRecord({ type: 'WITHDRAWAL', amountCents: BigInt(100) }));

      await service.withdraw('user-1' as UserId, 100 as Money, 'crypto');
      expect(mocks.transaction.findUnique).not.toHaveBeenCalled();
      expect(mocks.transaction.create).toHaveBeenCalled();
    });

    it('collectRake with duplicate idempotencyKey returns existing transaction without double-collecting', async () => {
      const existingRake = makeTxRecord({
        id: 'rake-existing', type: 'RAKE', walletId: 'sys-match-pool-wallet',
        userId: 'SYSTEM_MATCH_POOL', matchId: 'match-20', referenceId: 'rake-key-1',
      });
      setupWalletFindUnique(null, { matchPoolBalance: BigInt(5000) });
      mocks.transaction.findUnique.mockResolvedValue(existingRake);

      const result = await service.collectRake('match-20' as MatchId, 500 as Money, 'rake-key-1');
      expect(result.id).toBe('rake-existing');
      expect(mocks.transaction.create).not.toHaveBeenCalled();
      expect(mocks.wallet.updateMany).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  IDEMPOTENCY MISMATCH TESTS (Fix A)                              */
  /* ================================================================ */

  describe('idempotency mismatch protection', () => {
    it('deposit throws ConflictError when referenceId belongs to a different user', async () => {
      const otherUserTx = makeTxRecord({ userId: 'other-user', type: 'DEPOSIT', referenceId: 'ref-stolen' });
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(otherUserTx);

      await expect(
        service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-stolen'),
      ).rejects.toThrow(ConflictError);
    });

    it('deposit throws ConflictError when referenceId was used by a withdrawal (type mismatch)', async () => {
      const withdrawalTx = makeTxRecord({ userId: 'user-1', type: 'WITHDRAWAL', referenceId: 'ref-type-clash' });
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(withdrawalTx);

      await expect(
        service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-type-clash'),
      ).rejects.toThrow(ConflictError);
    });

    it('withdraw throws ConflictError when idempotencyKey belongs to a different user', async () => {
      const otherUserTx = makeTxRecord({ userId: 'other-user', type: 'WITHDRAWAL', referenceId: 'wd-stolen' });
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000) }));
      mocks.transaction.findUnique.mockResolvedValue(otherUserTx);

      await expect(
        service.withdraw('user-1' as UserId, 500 as Money, 'crypto', 'wd-stolen'),
      ).rejects.toThrow(ConflictError);
    });
  });

  /* ================================================================ */
  /*  P2002 RACE RECOVERY TESTS (Fix B)                               */
  /* ================================================================ */

  describe('P2002 race recovery', () => {
    it('deposit handles P2002 on referenceId by re-reading and returning the existing matching transaction', async () => {
      const raceWinner = makeTxRecord({ id: 'race-winner', userId: 'user-1', type: 'DEPOSIT', referenceId: 'race-ref' });
      setupWalletFindUnique(makeUserWallet());
      // First findUnique (idempotency check) returns null; second (race recovery) returns the winner
      mocks.transaction.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(raceWinner);
      mocks.transaction.create.mockRejectedValue(
        new mocks.MockPrismaError('Unique constraint', { code: 'P2002', meta: { target: ['referenceId'] } }),
      );

      const result = await service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'race-ref');
      expect(result.id).toBe('race-winner');
      // No balance updates — the loser returns the winner's transaction
      expect(mocks.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('deposit with P2002 on referenceId for different user throws ConflictError, not generic', async () => {
      const otherUserWinner = makeTxRecord({ id: 'other-winner', userId: 'other-user', type: 'DEPOSIT', referenceId: 'race-ref-2' });
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(otherUserWinner);
      mocks.transaction.create.mockRejectedValue(
        new mocks.MockPrismaError('Unique constraint', { code: 'P2002', meta: { target: ['referenceId'] } }),
      );

      // Verify it's our specific ConflictError with reason, not the generic P2002 mapping
      try {
        await service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'race-ref-2');
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).context).toEqual(
          expect.objectContaining({ reason: 'reference_used_by_different_request' }),
        );
      }
    });
  });

  /* ================================================================ */
  /*  ERROR PATH TESTS                                                */
  /* ================================================================ */

  describe('error paths', () => {
    it('deposit with zero amount throws ValidationError', async () => {
      await expect(service.deposit('user-1' as UserId, 0 as Money, 'crypto', 'ref')).rejects.toThrow(ValidationError);
      expect(mocks.$transaction).not.toHaveBeenCalled();
    });

    it('deposit with negative amount throws ValidationError', async () => {
      await expect(service.deposit('user-1' as UserId, -100 as Money, 'crypto', 'ref')).rejects.toThrow(ValidationError);
    });

    it('withdraw with zero amount throws ValidationError', async () => {
      await expect(service.withdraw('user-1' as UserId, 0 as Money, 'crypto')).rejects.toThrow(ValidationError);
    });

    it('withdraw with negative amount throws ValidationError', async () => {
      await expect(service.withdraw('user-1' as UserId, -50 as Money, 'crypto')).rejects.toThrow(ValidationError);
    });

    it('withdraw throws InsufficientFundsError when balance < amount', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(500) }));
      await expect(service.withdraw('user-1' as UserId, 1000 as Money, 'crypto')).rejects.toThrow(InsufficientFundsError);
      expect(mocks.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('deductEntryFee throws InsufficientFundsError when balance < fee', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(100) }));
      await expect(service.deductEntryFee('user-1' as UserId, 'match-1' as MatchId, 500 as Money)).rejects.toThrow(InsufficientFundsError);
    });

    it('getBalance throws NotFoundError for nonexistent wallet', async () => {
      setupWalletFindUnique(null);
      await expect(service.getBalance('nonexistent' as UserId)).rejects.toThrow(NotFoundError);
    });

    it('getTransactionHistory throws NotFoundError for nonexistent wallet', async () => {
      setupWalletFindUnique(null);
      await expect(service.getTransactionHistory('nonexistent' as UserId, { offset: 0, limit: 10 })).rejects.toThrow(NotFoundError);
    });

    it('ValidationError is thrown for non-integer amounts', async () => {
      await expect(service.deposit('user-1' as UserId, 10.5 as Money, 'crypto', 'ref')).rejects.toThrow(ValidationError);
      await expect(service.withdraw('user-1' as UserId, 1.99 as Money, 'crypto')).rejects.toThrow(ValidationError);
    });

    it('ValidationError is thrown for NaN and Infinity amounts', async () => {
      await expect(service.deposit('user-1' as UserId, NaN as Money, 'crypto', 'ref')).rejects.toThrow(ValidationError);
      await expect(service.deposit('user-1' as UserId, Infinity as Money, 'crypto', 'ref2')).rejects.toThrow(ValidationError);
    });

    it('ValidationError is thrown for negative pagination values', async () => {
      await expect(service.getTransactionHistory('user-1' as UserId, { offset: -1, limit: 10 })).rejects.toThrow(ValidationError);
      await expect(service.getTransactionHistory('user-1' as UserId, { offset: 0, limit: -5 })).rejects.toThrow(ValidationError);
    });

    it('ValidationError is thrown for non-integer pagination values', async () => {
      await expect(service.getTransactionHistory('user-1' as UserId, { offset: 0, limit: 1.5 })).rejects.toThrow(ValidationError);
    });
  });

  /* ================================================================ */
  /*  PRISMA ERROR MAPPING TESTS                                      */
  /* ================================================================ */

  describe('Prisma error mapping', () => {
    it('ConflictError is thrown when Prisma raises P2034 (serialization failure)', async () => {
      mocks.$transaction.mockRejectedValueOnce(new mocks.MockPrismaError('Serialization failure', { code: 'P2034' }));
      await expect(service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-serial')).rejects.toThrow(ConflictError);
    });

    it('NotFoundError is thrown when Prisma raises P2025 (record not found)', async () => {
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(null);
      mocks.transaction.create.mockRejectedValue(new mocks.MockPrismaError('Record not found', { code: 'P2025' }));
      await expect(service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-missing')).rejects.toThrow(NotFoundError);
    });
  });

  /* ================================================================ */
  /*  OPTIMISTIC LOCKING TESTS                                        */
  /* ================================================================ */

  describe('optimistic locking', () => {
    it('throws ConflictError when wallet version has changed (zero rows updated)', async () => {
      setupWalletFindUnique(makeUserWallet({ version: 5 }));
      mocks.transaction.create.mockResolvedValue(makeTxRecord());
      mocks.wallet.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-1')).rejects.toThrow(ConflictError);
    });

    it('ConflictError includes walletId and expected version in context', async () => {
      setupWalletFindUnique(makeUserWallet({ version: 7 }));
      mocks.transaction.create.mockResolvedValue(makeTxRecord());
      mocks.wallet.updateMany.mockResolvedValue({ count: 0 });

      try {
        await service.deposit('user-1' as UserId, 500 as Money, 'crypto', 'ref-2');
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).context).toEqual(
          expect.objectContaining({ walletId: 'wallet-1', expectedVersion: 7 }),
        );
      }
    });
  });

  /* ================================================================ */
  /*  DOUBLE-ENTRY INVARIANT TESTS                                    */
  /* ================================================================ */

  describe('double-entry invariant', () => {
    it('deposit: debit platform_suspense equals credit user_wallet', async () => {
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.create.mockResolvedValue(makeTxRecord({ amountCents: BigInt(2500) }));
      await service.deposit('user-1' as UserId, 2500 as Money, 'stripe', 'ref-3');
      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('sys-suspense-wallet');
      expect(entries[1]!.walletId).toBe('wallet-1');
    });

    it('withdraw: debit user_wallet equals credit platform_suspense', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000) }));
      mocks.transaction.create.mockResolvedValue(makeTxRecord({ type: 'WITHDRAWAL', amountCents: BigInt(1500) }));
      await service.withdraw('user-1' as UserId, 1500 as Money, 'crypto');
      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('wallet-1');
      expect(entries[1]!.walletId).toBe('sys-suspense-wallet');
    });

    it('deductEntryFee: debit user_wallet equals credit match_pool', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000) }));
      mocks.transaction.create.mockResolvedValue(makeTxRecord({ type: 'ENTRY_FEE', amountCents: BigInt(200), matchId: 'match-3' }));
      await service.deductEntryFee('user-1' as UserId, 'match-3' as MatchId, 200 as Money);
      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('wallet-1');
      expect(entries[1]!.walletId).toBe('sys-match-pool-wallet');
    });

    it('awardPrize: debit match_pool equals credit user_wallet', async () => {
      setupWalletFindUnique(makeUserWallet(), { matchPoolBalance: BigInt(10000) });
      mocks.transaction.create.mockResolvedValue(makeTxRecord({ type: 'PRIZE', amountCents: BigInt(5000), matchId: 'match-4' }));
      await service.awardPrize('user-1' as UserId, 'match-4' as MatchId, 5000 as Money);
      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('sys-match-pool-wallet');
      expect(entries[1]!.walletId).toBe('wallet-1');
    });
  });

  /* ================================================================ */
  /*  RACE CONDITION TESTS (skipped — require real database)          */
  /* ================================================================ */

  describe('race conditions (require real PostgreSQL with SERIALIZABLE isolation)', () => {
    it.skip('two concurrent deposits to the same wallet: both succeed, final balance = sum', () => {
      /** WITH REAL DB: balance starts 0, two deposit(1000) → final balance 2000. */
    });
    it.skip('two concurrent withdrawals that together exceed balance: exactly one succeeds', () => {
      /** WITH REAL DB: balance 1500, two withdraw(1000) �� one succeeds, other InsufficientFundsError. */
    });
    it.skip('two concurrent deductEntryFee calls racing for the last dollar: exactly one wins', () => {
      /** WITH REAL DB: balance 500, two deductEntryFee(500) → one succeeds, other InsufficientFundsError. */
    });
  });
});
