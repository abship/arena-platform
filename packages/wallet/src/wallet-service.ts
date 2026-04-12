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
 * DOUBLE-SIDED POSTING:
 * Both the user wallet AND the corresponding system wallet have their balanceCents
 * updated in every money operation.
 *
 * CONCURRENCY CONTROL:
 * - Every money-mutating operation runs inside a Prisma interactive transaction
 *   with SERIALIZABLE isolation level.
 * - Wallet.version is used for optimistic locking on both user and system wallets.
 *
 * IDEMPOTENCY:
 * - deposit() checks Transaction.referenceId (unique) before creating a new record.
 *   Validates userId + type match on existing record; handles P2002 race recovery.
 * - withdraw() accepts optional idempotencyKey; same validation + race recovery.
 * - collectRake() accepts optional idempotencyKey; same pattern.
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
      { transactionId, totalDebits: String(totalDebits), totalCredits: String(totalCredits) },
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

/**
 * Validate that an existing transaction matches the expected caller for idempotent operations.
 * Throws ConflictError if userId or type doesn't match, preventing cross-user reference reuse.
 */
function validateIdempotentMatch(
  existing: { userId: string; type: string },
  expectedUserId: string,
  expectedType: string,
  referenceId: string,
): void {
  if (existing.userId !== expectedUserId || existing.type !== expectedType) {
    throw new ConflictError(
      'Reference ID belongs to a different request',
      { referenceId, reason: 'reference_used_by_different_request' },
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
    if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents)) {
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
   * Idempotent via unique referenceId with userId+type validation and P2002 race recovery.
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
          // Idempotency check: return existing if reference already processed
          const existing = await tx.transaction.findUnique({ where: { referenceId: reference } });
          if (existing) {
            validateIdempotentMatch(existing, userId, 'DEPOSIT', reference);
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

          // Create with P2002 race recovery for concurrent duplicate references
          let txRecord;
          try {
            txRecord = await tx.transaction.create({
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
          } catch (createError: unknown) {
            if (
              createError instanceof Prisma.PrismaClientKnownRequestError &&
              createError.code === 'P2002'
            ) {
              const raceWinner = await tx.transaction.findUnique({ where: { referenceId: reference } });
              if (raceWinner) {
                validateIdempotentMatch(raceWinner, userId, 'DEPOSIT', reference);
                return mapTransaction(raceWinner);
              }
            }
            throw createError;
          }

          await createBalancedLedgerEntries(tx, txRecord.id, [
            { walletId: suspenseWallet.id, debitCents: amountBigInt, creditCents: BigInt(0) },
            { walletId: wallet.id, debitCents: BigInt(0), creditCents: amountBigInt },
          ]);

          await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, wallet.balanceCents + amountBigInt);
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
   * Optionally idempotent via idempotencyKey with userId+type validation and P2002 race recovery.
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
          // Idempotency check when key provided
          if (idempotencyKey) {
            const existing = await tx.transaction.findUnique({ where: { referenceId: idempotencyKey } });
            if (existing) {
              validateIdempotentMatch(existing, userId, 'WITHDRAWAL', idempotencyKey);
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

          // Create with P2002 race recovery when idempotencyKey is set
          let txRecord;
          try {
            txRecord = await tx.transaction.create({
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
          } catch (createError: unknown) {
            if (
              idempotencyKey &&
              createError instanceof Prisma.PrismaClientKnownRequestError &&
              createError.code === 'P2002'
            ) {
              const raceWinner = await tx.transaction.findUnique({ where: { referenceId: idempotencyKey } });
              if (raceWinner) {
                validateIdempotentMatch(raceWinner, userId, 'WITHDRAWAL', idempotencyKey);
                return mapTransaction(raceWinner);
              }
            }
            throw createError;
          }

          await createBalancedLedgerEntries(tx, txRecord.id, [
            { walletId: wallet.id, debitCents: amountBigInt, creditCents: BigInt(0) },
            { walletId: suspenseWallet.id, debitCents: BigInt(0), creditCents: amountBigInt },
          ]);

          await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, wallet.balanceCents - amountBigInt);
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

          await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, wallet.balanceCents - amountBigInt);
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

          await updateWalletWithOptimisticLock(tx, wallet.id, wallet.version, wallet.balanceCents + amountBigInt);
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
   * Optionally idempotent via idempotencyKey with matchId validation and P2002 race recovery.
   */
  async collectRake(
    matchId: MatchId,
    rakeCents: Money,
    idempotencyKey?: string,
  ): Promise<SharedTransaction> {
    this.validatePositiveAmount(rakeCents, 'collectRake');

    const rakeBigInt = moneyToBigInt(rakeCents);

    console.log(JSON.stringify({
      operation: 'collectRake', phase: 'start', matchId, rakeCents,
    }));

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Idempotency check when key provided
          if (idempotencyKey) {
            const existing = await tx.transaction.findUnique({ where: { referenceId: idempotencyKey } });
            if (existing) {
              if (existing.type !== 'RAKE' || existing.matchId !== matchId) {
                throw new ConflictError(
                  'Reference ID belongs to a different request',
                  { referenceId: idempotencyKey, reason: 'reference_used_by_different_request' },
                );
              }
              return mapTransaction(existing);
            }
          }

          const matchPoolWallet = await tx.wallet.findUnique({ where: { id: this.matchPoolWalletId } });
          if (!matchPoolWallet) {
            throw new NotFoundError('Match pool wallet not found', { walletId: this.matchPoolWalletId });
          }

          const revenueWallet = await tx.wallet.findUnique({ where: { id: this.platformRevenueWalletId } });
          if (!revenueWallet) {
            throw new NotFoundError('Platform revenue wallet not found', { walletId: this.platformRevenueWalletId });
          }

          const newMatchPoolBalance = matchPoolWallet.balanceCents - rakeBigInt;
          if (newMatchPoolBalance < BigInt(0)) {
            throw new InsufficientFundsError(
              'Match pool has insufficient funds for rake collection',
              { matchPoolBalance: Number(matchPoolWallet.balanceCents), requested: rakeCents, matchId },
            );
          }

          let txRecord;
          try {
            txRecord = await tx.transaction.create({
              data: {
                walletId: matchPoolWallet.id,
                userId: matchPoolWallet.userId,
                type: 'RAKE',
                status: 'COMPLETED',
                amountCents: rakeBigInt,
                matchId,
                referenceId: idempotencyKey ?? null,
              },
            });
          } catch (createError: unknown) {
            if (
              idempotencyKey &&
              createError instanceof Prisma.PrismaClientKnownRequestError &&
              createError.code === 'P2002'
            ) {
              const raceWinner = await tx.transaction.findUnique({ where: { referenceId: idempotencyKey } });
              if (raceWinner) {
                if (raceWinner.type !== 'RAKE' || raceWinner.matchId !== matchId) {
                  throw new ConflictError(
                    'Reference ID belongs to a different request',
                    { referenceId: idempotencyKey, reason: 'reference_used_by_different_request' },
                  );
                }
                return mapTransaction(raceWinner);
              }
            }
            throw createError;
          }

          await createBalancedLedgerEntries(tx, txRecord.id, [
            { walletId: matchPoolWallet.id, debitCents: rakeBigInt, creditCents: BigInt(0) },
            { walletId: revenueWallet.id, debitCents: BigInt(0), creditCents: rakeBigInt },
          ]);

          await updateWalletWithOptimisticLock(tx, matchPoolWallet.id, matchPoolWallet.version, newMatchPoolBalance);
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
