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
 *
 * Double-entry invariant tests verify that ledgerEntry.createMany calls always
 * receive entries where sum(debitCents) === sum(creditCents).
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
/*  Mock setup — vi.hoisted ensures these exist before vi.mock runs   */
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
    id: 'wallet-1',
    userId: 'user-1',
    balanceCents: BigInt(10_000),
    currency: 'USD',
    version: 1,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    ...overrides,
  };
}

function makeTxRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    walletId: 'wallet-1',
    userId: 'user-1',
    type: 'DEPOSIT',
    status: 'COMPLETED',
    amountCents: BigInt(1000),
    matchId: null,
    referenceId: null,
    description: null,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    ...overrides,
  };
}

/**
 * Configure wallet.findUnique to return the right wallet based on userId or id.
 * System wallets looked up by id, user wallets by userId.
 */
function setupWalletFindUnique(
  userWallet: ReturnType<typeof makeUserWallet> | null,
  systemOverrides?: {
    suspenseBalance?: bigint;
    matchPoolBalance?: bigint;
    revenueBalance?: bigint;
  },
) {
  mocks.wallet.findUnique.mockImplementation(
    async (args: { where: { userId?: string; id?: string }; select?: unknown }) => {
      if (args.where.id === SYSTEM_WALLET_IDS.platformSuspenseWalletId) {
        return { ...SYSTEM_SUSPENSE_WALLET, balanceCents: systemOverrides?.suspenseBalance ?? BigInt(0) };
      }
      if (args.where.id === SYSTEM_WALLET_IDS.matchPoolWalletId) {
        return { ...SYSTEM_MATCH_POOL_WALLET, balanceCents: systemOverrides?.matchPoolBalance ?? BigInt(0) };
      }
      if (args.where.id === SYSTEM_WALLET_IDS.platformRevenueWalletId) {
        return { ...SYSTEM_REVENUE_WALLET, balanceCents: systemOverrides?.revenueBalance ?? BigInt(0) };
      }
      return userWallet;
    },
  );
}

/** Extract ledger entries from createMany and verify double-entry invariant. */
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
      async (fn: (tx: typeof mocks.prisma) => Promise<unknown>, _options?: unknown) => {
        return fn(mocks.prisma);
      },
    );

    mocks.wallet.updateMany.mockResolvedValue({ count: 1 });
    mocks.ledgerEntry.createMany.mockResolvedValue({ count: 2 });
    mocks.transaction.findUnique.mockResolvedValue(null); // default: no duplicate
  });

  /* ================================================================ */
  /*  HAPPY PATH TESTS                                                */
  /* ================================================================ */

  describe('deposit', () => {
    it('credits wallet and creates correct ledger entries with double-sided posting', async () => {
      const userWallet = makeUserWallet({ balanceCents: BigInt(5000), version: 3 });
      setupWalletFindUnique(userWallet);
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ amountCents: BigInt(1000), referenceId: 'ref-1', description: 'Deposit via crypto' }),
      );

      const result = await service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-1');

      expect(result.id).toBe('tx-1');
      expect(result.type).toBe('DEPOSIT');
      expect(result.amountCents).toBe(1000);
      expect(result.reference).toBe('ref-1');

      // Two updateMany calls: user wallet + system wallet
      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      // User wallet: 5000 + 1000 = 6000, version 3 → 4
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'wallet-1', version: 3 },
        data: { balanceCents: BigInt(6000), version: 4 },
      });
      // System wallet (suspense): 0 - 1000 = -1000, version 0 → 1
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-suspense-wallet', version: 0 },
        data: { balanceCents: BigInt(-1000), version: 1 },
      });

      expect(mocks.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: 'Serializable' },
      );

      const { totalDebits } = assertLedgerBalanced();
      expect(totalDebits).toBe(BigInt(1000));
    });
  });

  describe('withdraw', () => {
    it('debits wallet and creates correct ledger entries with double-sided posting', async () => {
      const userWallet = makeUserWallet({ balanceCents: BigInt(5000), version: 2 });
      setupWalletFindUnique(userWallet, { suspenseBalance: BigInt(-5000) });
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'WITHDRAWAL', amountCents: BigInt(2000) }),
      );

      const result = await service.withdraw('user-1' as UserId, 2000 as Money, 'crypto');

      expect(result.type).toBe('WITHDRAWAL');
      expect(result.amountCents).toBe(2000);

      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      // User: 5000 - 2000 = 3000
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'wallet-1', version: 2 },
        data: { balanceCents: BigInt(3000), version: 3 },
      });
      // Suspense: -5000 + 2000 = -3000
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-suspense-wallet', version: 0 },
        data: { balanceCents: BigInt(-3000), version: 1 },
      });

      assertLedgerBalanced();
    });
  });

  describe('deductEntryFee', () => {
    it('debits wallet and marks transaction with matchId, credits match_pool', async () => {
      const userWallet = makeUserWallet({ balanceCents: BigInt(5000), version: 1 });
      setupWalletFindUnique(userWallet);
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'ENTRY_FEE', amountCents: BigInt(500), matchId: 'match-1' }),
      );

      const result = await service.deductEntryFee(
        'user-1' as UserId, 'match-1' as MatchId, 500 as Money,
      );

      expect(result.type).toBe('ENTRY_FEE');
      expect(result.matchId).toBe('match-1');

      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      // User: 5000 - 500 = 4500
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'wallet-1', version: 1 },
        data: { balanceCents: BigInt(4500), version: 2 },
      });
      // Match pool: 0 + 500 = 500
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-match-pool-wallet', version: 0 },
        data: { balanceCents: BigInt(500), version: 1 },
      });

      assertLedgerBalanced();
    });
  });

  describe('awardPrize', () => {
    it('credits wallet from match_pool with double-sided posting', async () => {
      const userWallet = makeUserWallet({ balanceCents: BigInt(5000), version: 5 });
      setupWalletFindUnique(userWallet, { matchPoolBalance: BigInt(10000) });
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'PRIZE', amountCents: BigInt(3000), matchId: 'match-2' }),
      );

      const result = await service.awardPrize(
        'user-1' as UserId, 'match-2' as MatchId, 3000 as Money,
      );

      expect(result.type).toBe('PRIZE');
      expect(result.matchId).toBe('match-2');

      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      // User: 5000 + 3000 = 8000
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'wallet-1', version: 5 },
        data: { balanceCents: BigInt(8000), version: 6 },
      });
      // Match pool: 10000 - 3000 = 7000
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-match-pool-wallet', version: 0 },
        data: { balanceCents: BigInt(7000), version: 1 },
      });

      assertLedgerBalanced();
    });

    it('throws InsufficientFundsError when match_pool has insufficient funds', async () => {
      setupWalletFindUnique(makeUserWallet(), { matchPoolBalance: BigInt(100) });

      await expect(
        service.awardPrize('user-1' as UserId, 'match-5' as MatchId, 5000 as Money),
      ).rejects.toThrow(InsufficientFundsError);
    });
  });

  describe('collectRake', () => {
    it('creates RAKE transaction moving money from match_pool to platform_revenue', async () => {
      setupWalletFindUnique(null, { matchPoolBalance: BigInt(5000), revenueBalance: BigInt(200) });
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({
          id: 'rake-tx-1',
          walletId: 'sys-match-pool-wallet',
          userId: 'SYSTEM_MATCH_POOL',
          type: 'RAKE',
          amountCents: BigInt(800),
          matchId: 'match-10',
        }),
      );

      const result = await service.collectRake('match-10' as MatchId, 800 as Money);

      expect(result.id).toBe('rake-tx-1');
      expect(result.type).toBe('RAKE');
      expect(result.amountCents).toBe(800);
      expect(result.matchId).toBe('match-10');

      // Verify transaction created with match_pool as wallet
      expect(mocks.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: 'sys-match-pool-wallet',
            type: 'RAKE',
            matchId: 'match-10',
          }),
        }),
      );

      expect(mocks.wallet.updateMany).toHaveBeenCalledTimes(2);
      // Match pool: 5000 - 800 = 4200
      expect(mocks.wallet.updateMany.mock.calls[0]![0]).toEqual({
        where: { id: 'sys-match-pool-wallet', version: 0 },
        data: { balanceCents: BigInt(4200), version: 1 },
      });
      // Revenue: 200 + 800 = 1000
      expect(mocks.wallet.updateMany.mock.calls[1]![0]).toEqual({
        where: { id: 'sys-revenue-wallet', version: 0 },
        data: { balanceCents: BigInt(1000), version: 1 },
      });

      // Verify balanced ledger
      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('sys-match-pool-wallet');
      expect(entries[0]!.debitCents).toBe(BigInt(800));
      expect(entries[1]!.walletId).toBe('sys-revenue-wallet');
      expect(entries[1]!.creditCents).toBe(BigInt(800));
    });

    it('throws InsufficientFundsError when match_pool balance < rake', async () => {
      setupWalletFindUnique(null, { matchPoolBalance: BigInt(50) });

      await expect(
        service.collectRake('match-11' as MatchId, 800 as Money),
      ).rejects.toThrow(InsufficientFundsError);
    });
  });

  describe('getBalance', () => {
    it('returns current balance as shared Wallet type', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(7777) }));

      const wallet = await service.getBalance('user-1' as UserId);

      expect(wallet.userId).toBe('user-1');
      expect(wallet.balanceCents).toBe(7777);
      expect(wallet.currency).toBe('USD');
    });
  });

  describe('getTransactionHistory', () => {
    it('returns transactions in descending createdAt order with pagination', async () => {
      setupWalletFindUnique(makeUserWallet());

      const tx1 = makeTxRecord({ id: 'tx-1', createdAt: new Date('2026-04-01') });
      const tx2 = makeTxRecord({ id: 'tx-2', createdAt: new Date('2026-04-02') });
      mocks.transaction.findMany.mockResolvedValue([tx2, tx1]);
      mocks.transaction.count.mockResolvedValue(2);

      const result = await service.getTransactionHistory(
        'user-1' as UserId, { offset: 0, limit: 50 },
      );

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.id).toBe('tx-2');
      expect(result.items[1]!.id).toBe('tx-1');
      expect(result.total).toBe(2);

      expect(mocks.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 50, skip: 0 }),
      );
    });

    it('caps limit at 100', async () => {
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findMany.mockResolvedValue([]);
      mocks.transaction.count.mockResolvedValue(0);

      await service.getTransactionHistory('user-1' as UserId, { offset: 0, limit: 500 });

      expect(mocks.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  /* ================================================================ */
  /*  IDEMPOTENCY TESTS                                               */
  /* ================================================================ */

  describe('idempotency', () => {
    it('deposit with duplicate reference returns existing transaction without crediting wallet twice', async () => {
      const existingTx = makeTxRecord({ id: 'existing-tx', referenceId: 'dup-ref' });
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(existingTx);

      const result = await service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'dup-ref');

      expect(result.id).toBe('existing-tx');
      // No transaction created, no balance update
      expect(mocks.transaction.create).not.toHaveBeenCalled();
      expect(mocks.wallet.updateMany).not.toHaveBeenCalled();
      expect(mocks.ledgerEntry.createMany).not.toHaveBeenCalled();
    });

    it('withdraw with duplicate idempotencyKey returns existing transaction without debiting wallet twice', async () => {
      const existingTx = makeTxRecord({ id: 'existing-wd', type: 'WITHDRAWAL', referenceId: 'wd-key-1' });
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(existingTx);

      const result = await service.withdraw('user-1' as UserId, 500 as Money, 'crypto', 'wd-key-1');

      expect(result.id).toBe('existing-wd');
      expect(mocks.transaction.create).not.toHaveBeenCalled();
      expect(mocks.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('withdraw without idempotencyKey creates a new transaction each time', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000) }));
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'WITHDRAWAL', amountCents: BigInt(100) }),
      );

      await service.withdraw('user-1' as UserId, 100 as Money, 'crypto');

      // No idempotency check should occur (findUnique not called for referenceId)
      expect(mocks.transaction.findUnique).not.toHaveBeenCalled();
      // Transaction was created normally
      expect(mocks.transaction.create).toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  ERROR PATH TESTS                                                */
  /* ================================================================ */

  describe('error paths', () => {
    it('deposit with zero amount throws ValidationError', async () => {
      await expect(
        service.deposit('user-1' as UserId, 0 as Money, 'crypto', 'ref'),
      ).rejects.toThrow(ValidationError);
      expect(mocks.$transaction).not.toHaveBeenCalled();
    });

    it('deposit with negative amount throws ValidationError', async () => {
      await expect(
        service.deposit('user-1' as UserId, -100 as Money, 'crypto', 'ref'),
      ).rejects.toThrow(ValidationError);
    });

    it('withdraw with zero amount throws ValidationError', async () => {
      await expect(
        service.withdraw('user-1' as UserId, 0 as Money, 'crypto'),
      ).rejects.toThrow(ValidationError);
    });

    it('withdraw with negative amount throws ValidationError', async () => {
      await expect(
        service.withdraw('user-1' as UserId, -50 as Money, 'crypto'),
      ).rejects.toThrow(ValidationError);
    });

    it('withdraw throws InsufficientFundsError when balance < amount', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(500) }));

      await expect(
        service.withdraw('user-1' as UserId, 1000 as Money, 'crypto'),
      ).rejects.toThrow(InsufficientFundsError);

      expect(mocks.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('deductEntryFee throws InsufficientFundsError when balance < fee', async () => {
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(100) }));

      await expect(
        service.deductEntryFee('user-1' as UserId, 'match-1' as MatchId, 500 as Money),
      ).rejects.toThrow(InsufficientFundsError);

      expect(mocks.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('getBalance throws NotFoundError for nonexistent wallet', async () => {
      setupWalletFindUnique(null);

      await expect(
        service.getBalance('nonexistent' as UserId),
      ).rejects.toThrow(NotFoundError);
    });

    it('getTransactionHistory throws NotFoundError for nonexistent wallet', async () => {
      setupWalletFindUnique(null);

      await expect(
        service.getTransactionHistory('nonexistent' as UserId, { offset: 0, limit: 10 }),
      ).rejects.toThrow(NotFoundError);
    });

    it('ValidationError is thrown for non-integer amounts', async () => {
      await expect(
        service.deposit('user-1' as UserId, 10.5 as Money, 'crypto', 'ref'),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.withdraw('user-1' as UserId, 1.99 as Money, 'crypto'),
      ).rejects.toThrow(ValidationError);
    });

    it('ValidationError is thrown for negative pagination values', async () => {
      await expect(
        service.getTransactionHistory('user-1' as UserId, { offset: -1, limit: 10 }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.getTransactionHistory('user-1' as UserId, { offset: 0, limit: -5 }),
      ).rejects.toThrow(ValidationError);
    });

    it('ValidationError is thrown for non-integer pagination values', async () => {
      await expect(
        service.getTransactionHistory('user-1' as UserId, { offset: 0, limit: 1.5 }),
      ).rejects.toThrow(ValidationError);
    });
  });

  /* ================================================================ */
  /*  PRISMA ERROR MAPPING TESTS                                      */
  /* ================================================================ */

  describe('Prisma error mapping', () => {
    it('ConflictError is thrown when Prisma raises P2002 (unique violation)', async () => {
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(null);
      mocks.transaction.create.mockRejectedValue(
        new mocks.MockPrismaError('Unique constraint', { code: 'P2002', meta: { target: ['referenceId'] } }),
      );

      await expect(
        service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-dup'),
      ).rejects.toThrow(ConflictError);
    });

    it('ConflictError is thrown when Prisma raises P2034 (serialization failure)', async () => {
      mocks.$transaction.mockRejectedValueOnce(
        new mocks.MockPrismaError('Serialization failure', { code: 'P2034' }),
      );

      await expect(
        service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-serial'),
      ).rejects.toThrow(ConflictError);
    });

    it('NotFoundError is thrown when Prisma raises P2025 (record not found)', async () => {
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.findUnique.mockResolvedValue(null);
      mocks.transaction.create.mockRejectedValue(
        new mocks.MockPrismaError('Record not found', { code: 'P2025' }),
      );

      await expect(
        service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-missing'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  /* ================================================================ */
  /*  OPTIMISTIC LOCKING TEST                                         */
  /* ================================================================ */

  describe('optimistic locking', () => {
    it('throws ConflictError when wallet version has changed (zero rows updated)', async () => {
      setupWalletFindUnique(makeUserWallet({ version: 5 }));
      mocks.transaction.create.mockResolvedValue(makeTxRecord());
      mocks.wallet.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deposit('user-1' as UserId, 1000 as Money, 'crypto', 'ref-1'),
      ).rejects.toThrow(ConflictError);
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
        const conflictError = error as ConflictError;
        expect(conflictError.context).toEqual(
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
      const amount = BigInt(2500);
      setupWalletFindUnique(makeUserWallet());
      mocks.transaction.create.mockResolvedValue(makeTxRecord({ amountCents: amount }));

      await service.deposit('user-1' as UserId, 2500 as Money, 'stripe', 'ref-3');

      const { entries } = assertLedgerBalanced();
      expect(entries).toHaveLength(2);
      expect(entries[0]!.walletId).toBe('sys-suspense-wallet');
      expect(entries[0]!.debitCents).toBe(amount);
      expect(entries[1]!.walletId).toBe('wallet-1');
      expect(entries[1]!.creditCents).toBe(amount);
    });

    it('withdraw: debit user_wallet equals credit platform_suspense', async () => {
      const amount = BigInt(1500);
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000) }));
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'WITHDRAWAL', amountCents: amount }),
      );

      await service.withdraw('user-1' as UserId, 1500 as Money, 'crypto');

      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('wallet-1');
      expect(entries[0]!.debitCents).toBe(amount);
      expect(entries[1]!.walletId).toBe('sys-suspense-wallet');
      expect(entries[1]!.creditCents).toBe(amount);
    });

    it('deductEntryFee: debit user_wallet equals credit match_pool', async () => {
      const amount = BigInt(200);
      setupWalletFindUnique(makeUserWallet({ balanceCents: BigInt(5000) }));
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'ENTRY_FEE', amountCents: amount, matchId: 'match-3' }),
      );

      await service.deductEntryFee('user-1' as UserId, 'match-3' as MatchId, 200 as Money);

      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('wallet-1');
      expect(entries[0]!.debitCents).toBe(amount);
      expect(entries[1]!.walletId).toBe('sys-match-pool-wallet');
      expect(entries[1]!.creditCents).toBe(amount);
    });

    it('awardPrize: debit match_pool equals credit user_wallet', async () => {
      const amount = BigInt(5000);
      setupWalletFindUnique(makeUserWallet(), { matchPoolBalance: BigInt(10000) });
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'PRIZE', amountCents: amount, matchId: 'match-4' }),
      );

      await service.awardPrize('user-1' as UserId, 'match-4' as MatchId, 5000 as Money);

      const { entries } = assertLedgerBalanced();
      expect(entries[0]!.walletId).toBe('sys-match-pool-wallet');
      expect(entries[0]!.debitCents).toBe(amount);
      expect(entries[1]!.walletId).toBe('wallet-1');
      expect(entries[1]!.creditCents).toBe(amount);
    });
  });

  /* ================================================================ */
  /*  RACE CONDITION TESTS (skipped — require real database)          */
  /* ================================================================ */

  describe('race conditions (require real PostgreSQL with SERIALIZABLE isolation)', () => {
    it.skip('two concurrent deposits to the same wallet: both succeed, final balance = sum', () => {
      /**
       * WITH REAL DB:
       * 1. Create a user wallet with balance 0.
       * 2. Launch two deposit(userId, 1000) calls concurrently via Promise.all.
       * 3. Both should succeed (SERIALIZABLE will serialize them, no lost updates).
       * 4. Final balance should be exactly 2000.
       * 5. There should be exactly 2 Transaction records and 4 LedgerEntry records.
       */
    });

    it.skip('two concurrent withdrawals that together exceed balance: exactly one succeeds', () => {
      /**
       * WITH REAL DB:
       * 1. Create a user wallet with balance 1500.
       * 2. Launch two withdraw(userId, 1000) calls concurrently via Promise.all.
       * 3. Exactly one should succeed, the other should throw InsufficientFundsError
       *    (or ConflictError if version mismatch triggers retry).
       * 4. Final balance should be exactly 500.
       */
    });

    it.skip('two concurrent deductEntryFee calls racing for the last dollar: exactly one wins', () => {
      /**
       * WITH REAL DB:
       * 1. Create a user wallet with balance 500.
       * 2. Launch two deductEntryFee(userId, matchA, 500) and
       *    deductEntryFee(userId, matchB, 500) concurrently.
       * 3. Exactly one should succeed, the other should throw InsufficientFundsError.
       * 4. Final balance should be exactly 0.
       */
    });
  });
});
