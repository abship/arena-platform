/**
 * WalletServiceImpl — the critical money service for Arena.gg.
 *
 * DOUBLE-ENTRY BOOKKEEPING:
 * Every transaction creates both a debit and a credit LedgerEntry.
 * The sum of debitCents must always equal the sum of creditCents per transaction.
 * This invariant is enforced in code before writing to the database.
 *
 * SYSTEM WALLETS (pre-provisioned via WalletServiceImpl.create()):
 * - PLATFORM_SUSPENSE: External money gateway. Deposits debit it; withdrawals credit it.
 * - MATCH_POOL: Money in active matches. Entry fees credit it; prizes/rake debit it.
 * - PLATFORM_REVENUE: Accumulated rake. collectRake credits it.
 *
 * System wallets are provisioned once at startup via provisionSystemWallets(),
 * called by the static factory method create(). No system-wallet provisioning
 * code runs inside hot-path money transactions.
 *
 * DOUBLE-SIDED POSTING:
 * Both the user wallet AND the corresponding system wallet have their balanceCents
 * updated in every money operation. This ensures system wallet balances are accurate
 * and prevents paying out more than was collected.
 *
 * CONCURRENCY CONTROL:
 * - Every money-mutating operation runs inside a Prisma interactive transaction
 *   with SERIALIZABLE isolation level.
 * - Wallet.version is used for optimistic locking on both user and system wallets.
 *
 * IDEMPOTENCY:
 * - deposit() checks Transaction.referenceId (unique) before creating a new record.
 * - withdraw() accepts optional idempotencyKey stored as referenceId.
 *
 * ERROR MAPPING:
 * - Prisma errors are mapped to typed AppError subclasses via prisma-error-mapper.
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
import { mapPrismaError } from './prisma-error-mapper.js';

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

/** Configuration for WalletServiceImpl constructor. */
export interface WalletServiceConfig {
  readonly platformSuspenseWalletId: string;
  readonly matchPoolWalletId: string;
  readonly platformRevenueWalletId: string;
}

/**
 * Implementation of the WalletService interface using Prisma with
 * serializable transactions, optimistic locking, double-entry bookkeeping,
 * double-sided system wallet posting, and idempotency via unique referenceId.
 */
export class WalletServiceImpl implements WalletService {
  private readonly platformSuspenseWalletId: string;
  private readonly matchPoolWalletId: string;
  private readonly platformRevenueWalletId: string;

  /**
   * Construct with pre-provisioned system wallet IDs.
   * Prefer WalletServiceImpl.create() unless you already know the IDs.
   *
   * @param config - System wallet IDs from provisionSystemWallets()
   */
  constructor(config: WalletServiceConfig) {
    this.platformSuspenseWalletId = config.platformSuspenseWalletId;
    this.matchPoolWalletId = config.matchPoolWalletId;
    this.platformRevenueWalletId = config.platformRevenueWalletId;
  }

  /**
   * Factory: provisions system wallets in a standalone transaction, then returns
   * a configured WalletServiceImpl. No system-wallet provisioning runs inside
   * hot-path money transactions.
   *
   * @returns A ready-to-use WalletServiceImpl
   */
  static async create(): Promise<WalletServiceImpl> {
    // Dynamic import to avoid circular dependency (provision-wallet.ts imports from wallet-service.ts)
    const { provisionSystemWallets } = await import('./provision-wallet.js');
    const walletIds = await provisionSystemWallets();
    return new WalletServiceImpl(walletIds);
  }

  private validatePositiveAmount(amountCents: Money, operation: string): void {
    if (!Number.isInteger(amountCents)) {
      throw new ValidationError(
        `Amount must be an integer of cents for ${operation}`,
        { amountCents, operation, reason: 'must be an integer of cents' },
      );
    }
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
   * Idempotent: if a transaction with the same reference already exists, returns it.
   *
   * @param userId - The user receiving the deposit
   * @param amountCents - Amount to deposit in USD cents (must be positive integer)
   * @param method - Payment method used (e.g. "crypto", "stripe")
   * @param reference - External payment provider reference ID (unique, used for idempotency)
   * @returns The created (or existing) transaction record
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

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Idempotency: return existing transaction if reference was already processed
          const existing = await tx.transaction.findUnique({ where: { referenceId: reference } });
          if (existing) {
            return mapTransaction(existing);
          }

          const wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) {
            throw new NotFoundError('Wallet not found', { userId });
          }

          const suspenseWallet = await tx.wallet.findUnique({ where: { id: this.platformSuspenseWalletId } });
          if (!suspenseWallet) {
            throw new NotFoundError('Platform suspense wallet not found', { walletId: this.platformSuspenseWalletId });
          }

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
            { walletId: suspenseWallet.id, debitCents: amountBigInt, creditCents: BigInt(0) },
            { walletId: wallet.id, debitCents: BigInt(0), creditCents: amountBigInt },
          ]);

          // Update user wallet (credit)
          await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, wallet.balanceCents + amountBigInt);

          // Update system wallet (debit — suspense goes negative as money enters platform)
          await updateWalletWithOptimisticLock(tx, suspenseWallet.id, suspenseWallet.version, suspenseWallet.balanceCents - amountBigInt);

          return mapTransaction(txRecord);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      console.log(JSON.stringify({
        operation: 'deposit', phase: 'complete', userId, amountCents, transactionId: result.id,
      }));

      return result;
    } catch (error: unknown) {
      const mapped = mapPrismaError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }

  /**
   * Withdraw funds from a user's wallet.
   * Ledger: debit user_wallet, credit platform_suspense.
   * Optionally idempotent via idempotencyKey.
   *
   * @param userId - The user requesting the withdrawal
   * @param amountCents - Amount to withdraw in USD cents (must be positive integer)
   * @param method - Payment method for the withdrawal
   * @param idempotencyKey - Optional key to prevent duplicate withdrawals
   * @returns The created (or existing) transaction record
   * @throws InsufficientFundsError if balance < amount
   */
  async withdraw(
    userId: UserId,
    amountCents: Money,
    method: string,
    idempotencyKey?: string,
  ): Promise<SharedTransaction> {
    this.validatePositiveAmount(amountCents, 'withdraw');

    const amountBigInt = moneyToBigInt(amountCents);

    console.log(JSON.stringify({
      operation: 'withdraw', phase: 'start', userId, amountCents, method,
    }));

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Idempotency: if key provided, check for existing withdrawal
          if (idempotencyKey) {
            const existing = await tx.transaction.findUnique({ where: { referenceId: idempotencyKey } });
            if (existing) {
              return mapTransaction(existing);
            }
          }

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

          const suspenseWallet = await tx.wallet.findUnique({ where: { id: this.platformSuspenseWalletId } });
          if (!suspenseWallet) {
            throw new NotFoundError('Platform suspense wallet not found', { walletId: this.platformSuspenseWalletId });
          }

          const txRecord = await tx.transaction.create({
            data: {
              walletId: wallet.id,
              userId,
              type: 'WITHDRAWAL',
              status: 'COMPLETED',
              amountCents: amountBigInt,
              referenceId: idempotencyKey ?? null,
              description: `Withdrawal via ${method}`,
            },
          });

          await createBalancedLedgerEntries(tx, txRecord.id, [
            { walletId: wallet.id, debitCents: amountBigInt, creditCents: BigInt(0) },
            { walletId: suspenseWallet.id, debitCents: BigInt(0), creditCents: amountBigInt },
          ]);

          // Update user wallet (debit)
          await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, wallet.balanceCents - amountBigInt);

          // Update system wallet (credit — money leaves platform)
          await updateWalletWithOptimisticLock(tx, suspenseWallet.id, suspenseWallet.version, suspenseWallet.balanceCents + amountBigInt);

          return mapTransaction(txRecord);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      console.log(JSON.stringify({
        operation: 'withdraw', phase: 'complete', userId, amountCents, transactionId: result.id,
      }));

      return result;
    } catch (error: unknown) {
      const mapped = mapPrismaError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }

  /**
   * Deduct an entry fee from a user's wallet when they join a match.
   * Ledger: debit user_wallet, credit match_pool.
   *
   * @param userId - The player joining the match
   * @param matchId - The match being joined
   * @param amountCents - Entry fee in USD cents (must be positive integer)
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

    try {
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

          const matchPoolWallet = await tx.wallet.findUnique({ where: { id: this.matchPoolWalletId } });
          if (!matchPoolWallet) {
            throw new NotFoundError('Match pool wallet not found', { walletId: this.matchPoolWalletId });
          }

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
            { walletId: matchPoolWallet.id, debitCents: BigInt(0), creditCents: amountBigInt },
          ]);

          // Update user wallet (debit)
          await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, wallet.balanceCents - amountBigInt);

          // Update system wallet (credit — money enters match pool)
          await updateWalletWithOptimisticLock(tx, matchPoolWallet.id, matchPoolWallet.version, matchPoolWallet.balanceCents + amountBigInt);

          return mapTransaction(txRecord);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      console.log(JSON.stringify({
        operation: 'deductEntryFee', phase: 'complete', userId, matchId, amountCents,
        transactionId: result.id,
      }));

      return result;
    } catch (error: unknown) {
      const mapped = mapPrismaError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }

  /**
   * Award prize winnings to a user's wallet after a match resolves.
   * Ledger: debit match_pool, credit user_wallet.
   *
   * @param userId - The winning player
   * @param matchId - The resolved match
   * @param amountCents - Prize amount in USD cents (must be positive integer)
   * @returns The created transaction record
   * @throws InsufficientFundsError if match_pool balance < prize amount
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

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) {
            throw new NotFoundError('Wallet not found', { userId });
          }

          const matchPoolWallet = await tx.wallet.findUnique({ where: { id: this.matchPoolWalletId } });
          if (!matchPoolWallet) {
            throw new NotFoundError('Match pool wallet not found', { walletId: this.matchPoolWalletId });
          }

          // Check match pool has sufficient funds
          const newMatchPoolBalance = matchPoolWallet.balanceCents - amountBigInt;
          if (newMatchPoolBalance < BigInt(0)) {
            throw new InsufficientFundsError(
              'Match pool has insufficient funds for prize payout',
              { matchPoolBalance: Number(matchPoolWallet.balanceCents), requested: amountCents, matchId },
            );
          }

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
            { walletId: matchPoolWallet.id, debitCents: amountBigInt, creditCents: BigInt(0) },
            { walletId: wallet.id, debitCents: BigInt(0), creditCents: amountBigInt },
          ]);

          // Update user wallet (credit)
          await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, wallet.balanceCents + amountBigInt);

          // Update system wallet (debit)
          await updateWalletWithOptimisticLock(tx, matchPoolWallet.id, matchPoolWallet.version, newMatchPoolBalance);

          return mapTransaction(txRecord);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      console.log(JSON.stringify({
        operation: 'awardPrize', phase: 'complete', userId, matchId, amountCents,
        transactionId: result.id,
      }));

      return result;
    } catch (error: unknown) {
      const mapped = mapPrismaError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }

  /**
   * Record platform rake from a resolved match.
   * Ledger: debit match_pool, credit platform_revenue.
   * Does not compute rake — the caller passes the computed amount.
   *
   * @param matchId - The resolved match
   * @param rakeCents - Rake amount in USD cents (must be positive integer)
   * @returns The created transaction record
   * @throws InsufficientFundsError if match_pool balance < rake amount
   */
  async collectRake(
    matchId: MatchId,
    rakeCents: Money,
  ): Promise<SharedTransaction> {
    this.validatePositiveAmount(rakeCents, 'collectRake');

    const rakeBigInt = moneyToBigInt(rakeCents);

    console.log(JSON.stringify({
      operation: 'collectRake', phase: 'start', matchId, rakeCents,
    }));

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const matchPoolWallet = await tx.wallet.findUnique({ where: { id: this.matchPoolWalletId } });
          if (!matchPoolWallet) {
            throw new NotFoundError('Match pool wallet not found', { walletId: this.matchPoolWalletId });
          }

          const revenueWallet = await tx.wallet.findUnique({ where: { id: this.platformRevenueWalletId } });
          if (!revenueWallet) {
            throw new NotFoundError('Platform revenue wallet not found', { walletId: this.platformRevenueWalletId });
          }

          // Check match pool has sufficient funds
          const newMatchPoolBalance = matchPoolWallet.balanceCents - rakeBigInt;
          if (newMatchPoolBalance < BigInt(0)) {
            throw new InsufficientFundsError(
              'Match pool has insufficient funds for rake collection',
              { matchPoolBalance: Number(matchPoolWallet.balanceCents), requested: rakeCents, matchId },
            );
          }

          const txRecord = await tx.transaction.create({
            data: {
              walletId: matchPoolWallet.id,
              userId: matchPoolWallet.userId,
              type: 'RAKE',
              status: 'COMPLETED',
              amountCents: rakeBigInt,
              matchId,
            },
          });

          await createBalancedLedgerEntries(tx, txRecord.id, [
            { walletId: matchPoolWallet.id, debitCents: rakeBigInt, creditCents: BigInt(0) },
            { walletId: revenueWallet.id, debitCents: BigInt(0), creditCents: rakeBigInt },
          ]);

          // Update match pool (debit)
          await updateWalletWithOptimisticLock(tx, matchPoolWallet.id, matchPoolWallet.version, newMatchPoolBalance);

          // Update revenue (credit)
          await updateWalletWithOptimisticLock(tx, revenueWallet.id, revenueWallet.version, revenueWallet.balanceCents + rakeBigInt);

          return mapTransaction(txRecord);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      console.log(JSON.stringify({
        operation: 'collectRake', phase: 'complete', matchId, rakeCents,
        transactionId: result.id,
      }));

      return result;
    } catch (error: unknown) {
      const mapped = mapPrismaError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }

  /**
   * Get a user's current wallet with balance.
   *
   * @param userId - The user to look up
   * @returns The user's wallet
   * @throws NotFoundError if the wallet does not exist
   */
  async getBalance(userId: UserId): Promise<SharedWallet> {
    try {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        throw new NotFoundError('Wallet not found', { userId });
      }
      return mapWallet(wallet);
    } catch (error: unknown) {
      const mapped = mapPrismaError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }

  /**
   * Get a user's paginated transaction history, ordered by createdAt descending.
   *
   * @param userId - The user whose history to retrieve
   * @param pagination - Offset and limit for paging (limit capped at 100, default 50)
   * @returns Paginated list of transactions
   * @throws NotFoundError if the wallet does not exist
   * @throws ValidationError if pagination values are invalid
   */
  async getTransactionHistory(
    userId: UserId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<SharedTransaction>> {
    if (pagination.limit !== undefined && (pagination.limit < 0 || !Number.isInteger(pagination.limit))) {
      throw new ValidationError('Pagination limit must be a non-negative integer', {
        limit: pagination.limit,
      });
    }
    if (pagination.offset !== undefined && (pagination.offset < 0 || !Number.isInteger(pagination.offset))) {
      throw new ValidationError('Pagination offset must be a non-negative integer', {
        offset: pagination.offset,
      });
    }

    const limit = Math.min(pagination.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const offset = pagination.offset ?? 0;

    try {
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
    } catch (error: unknown) {
      const mapped = mapPrismaError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }
}
