/**
 * Payment provider contract — plugin interface for deposit/withdrawal
 * backends (fake, Solana, Stripe, PayPal).
 */

import type { UserId } from '../types/user.js';
import type { Money } from '../types/wallet.js';

/** The result of a successful deposit. */
export interface DepositResult {
  /** Whether the deposit was successful. */
  readonly success: boolean;
  /** Payment provider's transaction/reference ID. */
  readonly reference: string;
  /** Amount deposited in USD cents. */
  readonly amountCents: Money;
}

/** The result of a successful withdrawal. */
export interface WithdrawalResult {
  /** Whether the withdrawal was successful. */
  readonly success: boolean;
  /** Payment provider's transaction/reference ID. */
  readonly reference: string;
  /** Amount withdrawn in USD cents. */
  readonly amountCents: Money;
}

/**
 * Contract for payment provider plugins. Each provider (fake, Solana, Stripe, PayPal)
 * implements this interface.
 */
export interface PaymentProvider {
  /**
   * Process a deposit from a user.
   * @param userId - The user making the deposit
   * @param amountCents - Amount to deposit in USD cents
   * @returns The deposit result with reference ID
   */
  processDeposit(
    userId: UserId,
    amountCents: Money,
  ): Promise<DepositResult>;

  /**
   * Process a withdrawal to a user.
   * @param userId - The user receiving the withdrawal
   * @param amountCents - Amount to withdraw in USD cents
   * @returns The withdrawal result with reference ID
   */
  processWithdrawal(
    userId: UserId,
    amountCents: Money,
  ): Promise<WithdrawalResult>;

  /**
   * Get or generate a deposit address/URL for a user (e.g. a Solana wallet address).
   * @param userId - The user to generate an address for
   * @returns The deposit address or URL string
   */
  getDepositAddress(userId: UserId): Promise<string>;
}
