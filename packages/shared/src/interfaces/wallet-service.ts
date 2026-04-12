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
   * @param userId - The user receiving the deposit
   * @param amountCents - Amount to deposit in USD cents
   * @param method - Payment method used (e.g. "crypto", "stripe")
   * @param reference - External payment provider reference ID
   * @returns The created transaction record
   */
  deposit(
    userId: UserId,
    amountCents: Money,
    method: string,
    reference: string,
  ): Promise<Transaction>;

  /**
   * Withdraw funds from a user's wallet.
   * @param userId - The user requesting the withdrawal
   * @param amountCents - Amount to withdraw in USD cents
   * @param method - Payment method for the withdrawal
   * @returns The created transaction record
   */
  withdraw(
    userId: UserId,
    amountCents: Money,
    method: string,
  ): Promise<Transaction>;

  /**
   * Deduct an entry fee from a user's wallet when they join a match.
   * @param userId - The player joining the match
   * @param matchId - The match being joined
   * @param amountCents - Entry fee in USD cents
   * @returns The created transaction record
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
   */
  awardPrize(
    userId: UserId,
    matchId: MatchId,
    amountCents: Money,
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
