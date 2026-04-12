/**
 * Wallet service tests — packages/wallet.
 *
 * APPROACH: Uses vitest mocks for the Prisma client. prisma.$transaction is mocked
 * to execute its callback synchronously with the mock client, allowing verification
 * of all Prisma calls, arguments, and business logic without a real database.
 *
 * Race condition tests that require truly concurrent database operations are marked
 * with .skip and include comments describing what they would verify against a real
 * PostgreSQL instance with SERIALIZABLE isolation. Mocked prisma cannot simulate
 * true concurrency or serialization conflicts.
 *
 * Double-entry invariant tests verify that the ledgerEntry.createMany calls always
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
  const wallet = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  };
  const transaction = {
    findMany: vi.fn(),
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
  };
});

vi.mock('@arena/database', () => ({
  prisma: mocks.prisma,
  Prisma: {
    TransactionIsolationLevel: {
      Serializable: 'Serializable',
    },
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

// Import after mock is established
import { WalletServiceImpl } from '../wallet-service.js';

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const SYSTEM_PLATFORM_SUSPENSE_USER_ID = 'SYSTEM_PLATFORM_SUSPENSE';
const SYSTEM_MATCH_POOL_USER_ID = 'SYSTEM_MATCH_POOL';

const SYSTEM_SUSPENSE_WALLET = {
  id: 'sys-suspense-wallet',
  userId: SYSTEM_PLATFORM_SUSPENSE_USER_ID,
  balanceCents: BigInt(0),
  currency: 'USD',
  version: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const SYSTEM_MATCH_POOL_WALLET = {
  id: 'sys-match-pool-wallet',
  userId: SYSTEM_MATCH_POOL_USER_ID,
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
    balanceCents: BigInt(10_000), // $100.00
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
 * Configure wallet.findUnique to return the right wallet based on userId.
 * System wallets are always available; the user wallet can be customized per test.
 */
function setupWalletFindUnique(userWallet: ReturnType<typeof makeUserWallet> | null) {
  mocks.wallet.findUnique.mockImplementation(
    async (args: { where: { userId?: string }; select?: unknown }) => {
      const userId = args.where.userId;
      if (userId === SYSTEM_PLATFORM_SUSPENSE_USER_ID) return SYSTEM_SUSPENSE_WALLET;
      if (userId === SYSTEM_MATCH_POOL_USER_ID) return SYSTEM_MATCH_POOL_WALLET;
      return userWallet;
    },
  );
}

/** Extract ledger entries from the createMany mock call and verify double-entry invariant. */
function assertLedgerBalanced(callIndex = 0) {
  const call = mocks.ledgerEntry.createMany.mock.calls[callIndex];
  expect(call).toBeDefined();
  const entries = (call as [{ data: Array<{ debitCents: bigint; creditCents: bigint }> }])[0].data;
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

    // Fresh instance per test (resets cached system wallet IDs)
    service = new WalletServiceImpl();

    // Default: $transaction executes callback with mock prisma as tx client
    mocks.$transaction.mockImplementation(
      async (fn: (tx: typeof mocks.prisma) => Promise<unknown>, _options?: unknown) => {
        return fn(mocks.prisma);
      },
    );

    // Default: optimistic lock succeeds
    mocks.wallet.updateMany.mockResolvedValue({ count: 1 });

    // Default: ledger creation succeeds
    mocks.ledgerEntry.createMany.mockResolvedValue({ count: 2 });

    // Default: user upsert succeeds (for system wallets)
    mocks.user.upsert.mockResolvedValue({});
  });

  /* ================================================================ */
  /*  HAPPY PATH TESTS                                                */
  /* ================================================================ */

  describe('deposit', () => {
    it('credits wallet and creates correct ledger entries', async () => {
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

      // Verify optimistic lock: balance 5000 + 1000 = 6000, version 3 → 4
      expect(mocks.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'wallet-1', version: 3 },
        data: { balanceCents: BigInt(6000), version: 4 },
      });

      // Verify serializable isolation
      expect(mocks.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: 'Serializable' },
      );

      // Verify double-entry invariant
      const { totalDebits } = assertLedgerBalanced();
      expect(totalDebits).toBe(BigInt(1000));
    });
  });

  describe('withdraw', () => {
    it('debits wallet and creates correct ledger entries', async () => {
      const userWallet = makeUserWallet({ balanceCents: BigInt(5000), version: 2 });
      setupWalletFindUnique(userWallet);
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'WITHDRAWAL', amountCents: BigInt(2000) }),
      );

      const result = await service.withdraw('user-1' as UserId, 2000 as Money, 'crypto');

      expect(result.type).toBe('WITHDRAWAL');
      expect(result.amountCents).toBe(2000);

      // Balance 5000 - 2000 = 3000, version 2 → 3
      expect(mocks.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'wallet-1', version: 2 },
        data: { balanceCents: BigInt(3000), version: 3 },
      });

      assertLedgerBalanced();
    });
  });

  describe('deductEntryFee', () => {
    it('debits wallet and marks transaction with matchId', async () => {
      const userWallet = makeUserWallet({ balanceCents: BigInt(5000), version: 1 });
      setupWalletFindUnique(userWallet);
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'ENTRY_FEE', amountCents: BigInt(500), matchId: 'match-1' }),
      );

      const result = await service.deductEntryFee(
        'user-1' as UserId,
        'match-1' as MatchId,
        500 as Money,
      );

      expect(result.type).toBe('ENTRY_FEE');
      expect(result.matchId).toBe('match-1');
      expect(result.amountCents).toBe(500);

      // Verify matchId was passed to transaction creation
      expect(mocks.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ matchId: 'match-1', type: 'ENTRY_FEE' }),
        }),
      );

      // Balance 5000 - 500 = 4500
      expect(mocks.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'wallet-1', version: 1 },
        data: { balanceCents: BigInt(4500), version: 2 },
      });

      assertLedgerBalanced();
    });
  });

  describe('awardPrize', () => {
    it('credits wallet and marks transaction with matchId', async () => {
      const userWallet = makeUserWallet({ balanceCents: BigInt(5000), version: 5 });
      setupWalletFindUnique(userWallet);
      mocks.transaction.create.mockResolvedValue(
        makeTxRecord({ type: 'PRIZE', amountCents: BigInt(3000), matchId: 'match-2' }),
      );

      const result = await service.awardPrize(
        'user-1' as UserId,
        'match-2' as MatchId,
        3000 as Money,
      );

      expect(result.type).toBe('PRIZE');
      expect(result.matchId).toBe('match-2');
      expect(result.amountCents).toBe(3000);

      // Balance 5000 + 3000 = 8000, version 5 → 6
      expect(mocks.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'wallet-1', version: 5 },
        data: { balanceCents: BigInt(8000), version: 6 },
      });

      assertLedgerBalanced();
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
      mocks.transaction.findMany.mockResolvedValue([tx2, tx1]); // desc order
      mocks.transaction.count.mockResolvedValue(2);

      const result = await service.getTransactionHistory(
        'user-1' as UserId,
        { offset: 0, limit: 50 },
      );

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.id).toBe('tx-2');
      expect(result.items[1]!.id).toBe('tx-1');
      expect(result.total).toBe(2);

      // Verify ordering parameter
      expect(mocks.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          take: 50,
          skip: 0,
        }),
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
  /*  ERROR PATH TESTS                                                */
  /* ================================================================ */

  describe('error paths', () => {
    it('deposit with zero amount throws ValidationError', async () => {
      await expect(
        service.deposit('user-1' as UserId, 0 as Money, 'crypto', 'ref'),
      ).rejects.toThrow(ValidationError);

      // No database calls should have been made
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

      // No balance update should have occurred
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
  });

  /* ================================================================ */
  /*  OPTIMISTIC LOCKING TEST                                         */
  /* ================================================================ */

  describe('optimistic locking', () => {
    it('throws ConflictError when wallet version has changed (zero rows updated)', async () => {
      setupWalletFindUnique(makeUserWallet({ version: 5 }));
      mocks.transaction.create.mockResolvedValue(makeTxRecord());

      // Simulate version mismatch: updateMany returns 0 affected rows
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

      // First entry: debit platform_suspense
      expect(entries[0]!.walletId).toBe('sys-suspense-wallet');
      expect(entries[0]!.debitCents).toBe(amount);
      expect(entries[0]!.creditCents).toBe(BigInt(0));

      // Second entry: credit user wallet
      expect(entries[1]!.walletId).toBe('wallet-1');
      expect(entries[1]!.debitCents).toBe(BigInt(0));
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
      // Debit user wallet, credit suspense
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
      setupWalletFindUnique(makeUserWallet());
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
       *
       * The SERIALIZABLE isolation ensures one transaction completes before the
       * other reads the wallet, preventing lost updates. If optimistic locking
       * detects a version mismatch, the caller retries.
       */
    });

    it.skip('two concurrent withdrawals that together exceed balance: exactly one succeeds', () => {
      /**
       * WITH REAL DB:
       * 1. Create a user wallet with balance 1500.
       * 2. Launch two withdraw(userId, 1000) calls concurrently via Promise.all.
       * 3. Exactly one should succeed, the other should throw InsufficientFundsError
       *    (or ConflictError if version mismatch triggers retry, which then sees
       *    insufficient funds).
       * 4. Final balance should be exactly 500.
       * 5. There should be exactly 1 Transaction record.
       *
       * SERIALIZABLE isolation prevents both from reading 1500 and both succeeding.
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
       *
       * Same serialization guarantee as the withdrawal test above.
       */
    });
  });
});
