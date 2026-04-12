/**
 * Wallet service contract — manages player balances, deposits, withdrawals,
 * entry fees, and prize payouts using double-entry bookkeeping.
 */

import type { UserId } from '../types/user.js';
import type { Money, Transaction, Wallet } from '../types/wallet.js';
import type { MatchId } from '../types/match.js';

/** Pagination parameters for listing queries. */
export interface PaginationParams {
  /** Number of records to skip. */
  readonly offset: number;
  /** Maximum number of records to return. */
  readonly limit: number;
}

/** A paginated list of results. */
export interface PaginatedResult<T> {
  /** The items in this page. */
  readonly items: readonly T[];
  /** Total number of items across all pages. */
  readonly total: number;
}

/**
 * Contract for the wallet service. All methods that modify balances
 * MUST use database transactions with SERIALIZABLE isolation.
 */
export interface WalletService {
  /**
   * Deposit funds into a user's wallet.
   * Idempotent: if a transaction with the same reference already exists for this user
   * and type, returns the existing transaction without modifying the balance.
   * @param userId - The user receiving the deposit
   * @param amountCents - Amount to deposit in USD cents
   * @param method - Payment method used (e.g. "crypto", "stripe")
   * @param reference - External payment provider reference ID (unique, used for idempotency)
   * @returns The created or existing transaction record
   * @throws ConflictError - Transient concurrency conflict; caller may retry.
   */
  deposit(
    userId: UserId,
    amountCents: Money,
    method: string,
    reference: string,
  ): Promise<Transaction>;

  /**
   * Withdraw funds from a user's wallet.
   * Optionally idempotent via idempotencyKey.
   * @param userId - The user requesting the withdrawal
   * @param amountCents - Amount to withdraw in USD cents
   * @param method - Payment method for the withdrawal
   * @param idempotencyKey - Optional key to prevent duplicate withdrawals (stored as referenceId)
   * @returns The created or existing transaction record
   * @throws ConflictError - Transient concurrency conflict; caller may retry.
   */
  withdraw(
    userId: UserId,
    amountCents: Money,
    method: string,
    idempotencyKey?: string,
  ): Promise<Transaction>;

  /**
   * Deduct an entry fee from a user's wallet when they join a match.
   * @param userId - The player joining the match
   * @param matchId - The match being joined
   * @param amountCents - Entry fee in USD cents
   * @returns The created transaction record
   * @throws ConflictError - Transient concurrency conflict; caller may retry.
   */
  deductEntryFee(
    userId: UserId,
    matchId: MatchId,
    amountCents: Money,
  ): Promise<Transaction>;

  /**
   * Award prize winnings to a user's wallet after a match resolves.
   * @param userId - The winning player
   * @param matchId - The resolved match
   * @param amountCents - Prize amount in USD cents
   * @returns The created transaction record
   * @throws ConflictError - Transient concurrency conflict; caller may retry.
   */
  awardPrize(
    userId: UserId,
    matchId: MatchId,
    amountCents: Money,
  ): Promise<Transaction>;

  /**
   * Record platform rake from a resolved match.
   * Ledger: debit match_pool, credit platform_revenue.
   * Called by matchmaking after a match resolves, before/with prize payouts.
   * Optionally idempotent via idempotencyKey.
   * @param matchId - The resolved match
   * @param rakeCents - Rake amount in USD cents
   * @param idempotencyKey - Optional key to prevent duplicate rake collection (stored as referenceId)
   * @returns The created or existing transaction record
   * @throws ConflictError - Transient concurrency conflict; caller may retry.
   */
  collectRake(
    matchId: MatchId,
    rakeCents: Money,
    idempotencyKey?: string,
  ): Promise<Transaction>;

  /**
   * Get a user's current wallet with balance.
   * @param userId - The user to look up
   * @returns The user's wallet
   */
  getBalance(userId: UserId): Promise<Wallet>;

  /**
   * Get a user's paginated transaction history.
   * @param userId - The user whose history to retrieve
   * @param pagination - Offset and limit for paging
   * @returns Paginated list of transactions
   */
  getTransactionHistory(
    userId: UserId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Transaction>>;
}
