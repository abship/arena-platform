/**
 * WalletServiceImpl — the critical money service for Arena.gg.
 *
 * DOUBLE-ENTRY BOOKKEEPING:
 * Every transaction creates both a debit and a credit LedgerEntry.
 * The sum of debitCents must always equal the sum of creditCents per transaction.
 * This invariant is enforced in code before writing to the database.
 *
 * SYSTEM WALLETS:
 * Two "system" wallets serve as double-entry counterparties:
 * - PLATFORM_SUSPENSE: Represents external money entering/leaving the platform.
 *   Deposits debit this wallet; withdrawals credit it.
 * - MATCH_POOL: Represents money held in active matches.
 *   Entry fees credit this wallet; prizes debit it.
 *
 * These are created lazily on first use with synthetic user IDs. Concurrent
 * initialization is safe because User.id and Wallet.userId have unique constraints —
 * the upsert pattern ensures exactly one system wallet per type.
 *
 * CONCURRENCY CONTROL:
 * - Every money-mutating operation runs inside a Prisma interactive transaction
 *   with SERIALIZABLE isolation level.
 * - Wallet.version is used for optimistic locking: reads the current version,
 *   includes it in the WHERE clause on update, increments it, and rejects
 *   (ConflictError) if zero rows were affected.
 *
 * @module
 */

import { prisma, Prisma } from '@arena/database';
import type { PrismaClient } from '@arena/database';
import type {
  WalletService,
  PaginationParams,
  PaginatedResult,
  UserId,
  MatchId,
  Money,
  Transaction as SharedTransaction,
  Wallet as SharedWallet,
  WalletId,
} from '@arena/shared';
import {
  ValidationError,
  NotFoundError,
  InsufficientFundsError,
  ConflictError,
} from '@arena/shared';

/** System user ID for the platform suspense wallet (external money gateway). */
const SYSTEM_PLATFORM_SUSPENSE_USER_ID = 'SYSTEM_PLATFORM_SUSPENSE' as UserId;

/** System user ID for the match pool wallet (money in active matches). */
const SYSTEM_MATCH_POOL_USER_ID = 'SYSTEM_MATCH_POOL' as UserId;

/** Maximum page size for transaction history queries. */
const MAX_PAGE_LIMIT = 100;

/** Default page size when caller does not specify. */
const DEFAULT_PAGE_LIMIT = 50;

/**
 * Prisma interactive transaction client type.
 * Same model accessors as PrismaClient but without connection/transaction management methods.
 */
type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Shape of a ledger entry before insertion. */
interface LedgerEntryInput {
  readonly walletId: string;
  readonly debitCents: bigint;
  readonly creditCents: bigint;
}

/**
 * Convert a Prisma BigInt balance to the branded Money type.
 * Safe for all realistic monetary values (well within Number.MAX_SAFE_INTEGER).
 *
 * @param value - BigInt from Prisma
 * @returns Branded Money value in integer cents
 */
export function bigIntToMoney(value: bigint): Money {
  return Number(value) as Money;
}

/**
 * Convert a branded Money value to BigInt for Prisma storage.
 *
 * @param value - Money amount in integer cents
 * @returns BigInt for Prisma
 */
export function moneyToBigInt(value: Money): bigint {
  return BigInt(value);
}

/**
 * Map a Prisma Transaction record to the shared Transaction interface.
 *
 * @param record - Raw Prisma transaction row
 * @returns Shared Transaction object
 */
export function mapTransaction(record: {
  id: string;
  walletId: string;
  type: string;
  amountCents: bigint;
  status: string;
  matchId: string | null;
  referenceId: string | null;
  createdAt: Date;
}): SharedTransaction {
  return {
    id: record.id,
    walletId: record.walletId as WalletId,
    type: record.type as SharedTransaction['type'],
    amountCents: bigIntToMoney(record.amountCents),
    status: record.status as SharedTransaction['status'],
    matchId: (record.matchId as MatchId | null),
    reference: record.referenceId,
    createdAt: record.createdAt,
  };
}

/**
 * Map a Prisma Wallet record to the shared Wallet interface.
 *
 * @param record - Raw Prisma wallet row
 * @returns Shared Wallet object
 */
export function mapWallet(record: {
  id: string;
  userId: string;
  balanceCents: bigint;
  currency: string;
  version: number;
  createdAt: Date;
}): SharedWallet {
  return {
    id: record.id as WalletId,
    userId: record.userId as UserId,
    balanceCents: bigIntToMoney(record.balanceCents),
    currency: record.currency,
    version: record.version,
    createdAt: record.createdAt,
  };
}

/**
 * Validate and create double-entry ledger entries for a transaction.
 * Enforces the invariant: sum(debitCents) === sum(creditCents).
 *
 * @param tx - Prisma transaction client
 * @param transactionId - The parent transaction ID
 * @param entries - Array of debit/credit entry inputs
 */
async function createBalancedLedgerEntries(
  tx: TxClient,
  transactionId: string,
  entries: readonly LedgerEntryInput[],
): Promise<void> {
  const totalDebits = entries.reduce((sum, e) => sum + e.debitCents, BigInt(0));
  const totalCredits = entries.reduce((sum, e) => sum + e.creditCents, BigInt(0));

  if (totalDebits !== totalCredits) {
    throw new ValidationError(
      `Double-entry invariant violated: debits=${totalDebits} credits=${totalCredits}`,
      { transactionId, totalDebits: Number(totalDebits), totalCredits: Number(totalCredits) },
    );
  }

  await tx.ledgerEntry.createMany({
    data: entries.map((e) => ({
      transactionId,
      walletId: e.walletId,
      debitCents: e.debitCents,
      creditCents: e.creditCents,
    })),
  });
}

/**
 * Update a wallet balance with optimistic locking.
 * Throws ConflictError if the version has changed since the wallet was read.
 *
 * @param tx - Prisma transaction client
 * @param walletId - The wallet to update
 * @param currentVersion - Expected version (read earlier in same transaction)
 * @param newBalanceCents - New balance to set
 */
async function updateWalletWithOptimisticLock(
  tx: TxClient,
  walletId: string,
  currentVersion: number,
  newBalanceCents: bigint,
): Promise<void> {
  const result = await tx.wallet.updateMany({
    where: { id: walletId, version: currentVersion },
    data: {
      balanceCents: newBalanceCents,
      version: currentVersion + 1,
    },
  });

  if (result.count === 0) {
    throw new ConflictError(
      'Wallet was modified by another transaction (version mismatch)',
      { walletId, expectedVersion: currentVersion },
    );
  }
}

/**
 * Implementation of the WalletService interface using Prisma with
 * serializable transactions, optimistic locking, and double-entry bookkeeping.
 */
export class WalletServiceImpl implements WalletService {
  private platformSuspenseWalletId: string | null = null;
  private matchPoolWalletId: string | null = null;

  /**
   * Ensure a system wallet exists, creating the system user and wallet if needed.
   * Uses upsert for the user and findUnique+create for the wallet.
   * Cached after first successful lookup/creation.
   */
  private async ensureSystemWallet(
    tx: TxClient,
    systemUserId: string,
    cachedId: string | null,
  ): Promise<string> {
    if (cachedId) {
      return cachedId;
    }

    const existing = await tx.wallet.findUnique({
      where: { userId: systemUserId },
    });
    if (existing) {
      return existing.id;
    }

    await tx.user.upsert({
      where: { id: systemUserId },
      create: {
        id: systemUserId,
        email: `${systemUserId.toLowerCase()}@system.arena.gg`,
        username: systemUserId,
        country: 'SYSTEM',
      },
      update: {},
    });

    const wallet = await tx.wallet.create({
      data: {
        userId: systemUserId,
        balanceCents: BigInt(0),
        currency: 'USD',
      },
    });

    return wallet.id;
  }

  private async getPlatformSuspenseWalletId(tx: TxClient): Promise<string> {
    const id = await this.ensureSystemWallet(
      tx,
      SYSTEM_PLATFORM_SUSPENSE_USER_ID,
      this.platformSuspenseWalletId,
    );
    this.platformSuspenseWalletId = id;
    return id;
  }

  private async getMatchPoolWalletId(tx: TxClient): Promise<string> {
    const id = await this.ensureSystemWallet(
      tx,
      SYSTEM_MATCH_POOL_USER_ID,
      this.matchPoolWalletId,
    );
    this.matchPoolWalletId = id;
    return id;
  }

  private validatePositiveAmount(amountCents: Money, operation: string): void {
    if (amountCents <= 0) {
      throw new ValidationError(
        `Amount must be positive for ${operation}`,
        { amountCents, operation },
      );
    }
  }

  /**
   * Deposit funds into a user's wallet.
   * Ledger: debit platform_suspense, credit user_wallet.
   *
   * @param userId - The user receiving the deposit
   * @param amountCents - Amount to deposit in USD cents (must be positive)
   * @param method - Payment method used (e.g. "crypto", "stripe")
   * @param reference - External payment provider reference ID
   * @returns The created transaction record
   */
  async deposit(
    userId: UserId,
    amountCents: Money,
    method: string,
    reference: string,
  ): Promise<SharedTransaction> {
    this.validatePositiveAmount(amountCents, 'deposit');

    const amountBigInt = moneyToBigInt(amountCents);

    console.log(JSON.stringify({
      operation: 'deposit', phase: 'start', userId, amountCents, method,
    }));

    const result = await prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) {
          throw new NotFoundError('Wallet not found', { userId });
        }

        const suspenseWalletId = await this.getPlatformSuspenseWalletId(tx);

        const txRecord = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            userId,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            amountCents: amountBigInt,
            referenceId: reference,
            description: `Deposit via ${method}`,
          },
        });

        await createBalancedLedgerEntries(tx, txRecord.id, [
          { walletId: suspenseWalletId, debitCents: amountBigInt, creditCents: BigInt(0) },
          { walletId: wallet.id, debitCents: BigInt(0), creditCents: amountBigInt },
        ]);

        const newBalance = wallet.balanceCents + amountBigInt;
        await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, newBalance);

        return mapTransaction(txRecord);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    console.log(JSON.stringify({
      operation: 'deposit', phase: 'complete', userId, amountCents, transactionId: result.id,
    }));

    return result;
  }

  /**
   * Withdraw funds from a user's wallet.
   * Ledger: debit user_wallet, credit platform_suspense.
   *
   * @param userId - The user requesting the withdrawal
   * @param amountCents - Amount to withdraw in USD cents (must be positive)
   * @param method - Payment method for the withdrawal
   * @returns The created transaction record
   * @throws InsufficientFundsError if balance < amount
   */
  async withdraw(
    userId: UserId,
    amountCents: Money,
    method: string,
  ): Promise<SharedTransaction> {
    this.validatePositiveAmount(amountCents, 'withdraw');

    const amountBigInt = moneyToBigInt(amountCents);

    console.log(JSON.stringify({
      operation: 'withdraw', phase: 'start', userId, amountCents, method,
    }));

    const result = await prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) {
          throw new NotFoundError('Wallet not found', { userId });
        }

        if (wallet.balanceCents < amountBigInt) {
          console.error(JSON.stringify({
            operation: 'withdraw', error: 'INSUFFICIENT_FUNDS',
            userId, amountCents, available: Number(wallet.balanceCents),
          }));
          throw new InsufficientFundsError(
            'Insufficient funds for withdrawal',
            { userId, requested: amountCents, available: Number(wallet.balanceCents) },
          );
        }

        const suspenseWalletId = await this.getPlatformSuspenseWalletId(tx);

        const txRecord = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            userId,
            type: 'WITHDRAWAL',
            status: 'COMPLETED',
            amountCents: amountBigInt,
            description: `Withdrawal via ${method}`,
          },
        });

        await createBalancedLedgerEntries(tx, txRecord.id, [
          { walletId: wallet.id, debitCents: amountBigInt, creditCents: BigInt(0) },
          { walletId: suspenseWalletId, debitCents: BigInt(0), creditCents: amountBigInt },
        ]);

        const newBalance = wallet.balanceCents - amountBigInt;
        await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, newBalance);

        return mapTransaction(txRecord);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    console.log(JSON.stringify({
      operation: 'withdraw', phase: 'complete', userId, amountCents, transactionId: result.id,
    }));

    return result;
  }

  /**
   * Deduct an entry fee from a user's wallet when they join a match.
   * Ledger: debit user_wallet, credit match_pool.
   *
   * @param userId - The player joining the match
   * @param matchId - The match being joined
   * @param amountCents - Entry fee in USD cents (must be positive)
   * @returns The created transaction record
   * @throws InsufficientFundsError if balance < fee
   */
  async deductEntryFee(
    userId: UserId,
    matchId: MatchId,
    amountCents: Money,
  ): Promise<SharedTransaction> {
    this.validatePositiveAmount(amountCents, 'deductEntryFee');

    const amountBigInt = moneyToBigInt(amountCents);

    console.log(JSON.stringify({
      operation: 'deductEntryFee', phase: 'start', userId, matchId, amountCents,
    }));

    const result = await prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) {
          throw new NotFoundError('Wallet not found', { userId });
        }

        if (wallet.balanceCents < amountBigInt) {
          console.error(JSON.stringify({
            operation: 'deductEntryFee', error: 'INSUFFICIENT_FUNDS',
            userId, matchId, amountCents, available: Number(wallet.balanceCents),
          }));
          throw new InsufficientFundsError(
            'Insufficient funds for entry fee',
            { userId, matchId, requested: amountCents, available: Number(wallet.balanceCents) },
          );
        }

        const matchPoolWalletId = await this.getMatchPoolWalletId(tx);

        const txRecord = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            userId,
            type: 'ENTRY_FEE',
            status: 'COMPLETED',
            amountCents: amountBigInt,
            matchId,
          },
        });

        await createBalancedLedgerEntries(tx, txRecord.id, [
          { walletId: wallet.id, debitCents: amountBigInt, creditCents: BigInt(0) },
          { walletId: matchPoolWalletId, debitCents: BigInt(0), creditCents: amountBigInt },
        ]);

        const newBalance = wallet.balanceCents - amountBigInt;
        await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, newBalance);

        return mapTransaction(txRecord);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    console.log(JSON.stringify({
      operation: 'deductEntryFee', phase: 'complete', userId, matchId, amountCents,
      transactionId: result.id,
    }));

    return result;
  }

  /**
   * Award prize winnings to a user's wallet after a match resolves.
   * Ledger: debit match_pool, credit user_wallet.
   *
   * @param userId - The winning player
   * @param matchId - The resolved match
   * @param amountCents - Prize amount in USD cents (must be positive)
   * @returns The created transaction record
   */
  async awardPrize(
    userId: UserId,
    matchId: MatchId,
    amountCents: Money,
  ): Promise<SharedTransaction> {
    this.validatePositiveAmount(amountCents, 'awardPrize');

    const amountBigInt = moneyToBigInt(amountCents);

    console.log(JSON.stringify({
      operation: 'awardPrize', phase: 'start', userId, matchId, amountCents,
    }));

    const result = await prisma.$transaction(
      async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet) {
          throw new NotFoundError('Wallet not found', { userId });
        }

        const matchPoolWalletId = await this.getMatchPoolWalletId(tx);

        const txRecord = await tx.transaction.create({
          data: {
            walletId: wallet.id,
            userId,
            type: 'PRIZE',
            status: 'COMPLETED',
            amountCents: amountBigInt,
            matchId,
          },
        });

        await createBalancedLedgerEntries(tx, txRecord.id, [
          { walletId: matchPoolWalletId, debitCents: amountBigInt, creditCents: BigInt(0) },
          { walletId: wallet.id, debitCents: BigInt(0), creditCents: amountBigInt },
        ]);

        const newBalance = wallet.balanceCents + amountBigInt;
        await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, newBalance);

        return mapTransaction(txRecord);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    console.log(JSON.stringify({
      operation: 'awardPrize', phase: 'complete', userId, matchId, amountCents,
      transactionId: result.id,
    }));

    return result;
  }

  /**
   * Get a user's current wallet with balance.
   *
   * @param userId - The user to look up
   * @returns The user's wallet
   * @throws NotFoundError if the wallet does not exist
   */
  async getBalance(userId: UserId): Promise<SharedWallet> {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new NotFoundError('Wallet not found', { userId });
    }
    return mapWallet(wallet);
  }

  /**
   * Get a user's paginated transaction history, ordered by createdAt descending.
   *
   * @param userId - The user whose history to retrieve
   * @param pagination - Offset and limit for paging (limit capped at 100, default 50)
   * @returns Paginated list of transactions
   * @throws NotFoundError if the wallet does not exist
   */
  async getTransactionHistory(
    userId: UserId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SharedTransaction>> {
    const limit = Math.min(pagination.limit || DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const offset = pagination.offset || 0;

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) {
      throw new NotFoundError('Wallet not found', { userId });
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      items: transactions.map(mapTransaction),
      total,
    };
  }
}
