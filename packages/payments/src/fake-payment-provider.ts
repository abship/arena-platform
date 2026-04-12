/**
 * Fake payment provider for Phase 1 (fake money).
 *
 * Implements the PaymentProvider interface by delegating all balance mutations
 * to the WalletService. No network calls, no filesystem, no state beyond what
 * the wallet owns. Real providers (BitPay, Helius, etc.) will replace this
 * post-beta via the PaymentProviderFactory env-var gate.
 */

import { randomUUID } from 'node:crypto';
import type { PaymentProvider, DepositResult, WithdrawalResult } from '@arena/shared';
import type { WalletService } from '@arena/shared';
import type { UserId, Money } from '@arena/shared';

/**
 * FakePaymentProvider — deposits and withdrawals backed entirely by the
 * WalletService with no real payment gateway interaction.
 */
export class FakePaymentProvider implements PaymentProvider {
  private readonly walletService: WalletService;

  /** @param walletService - Injected wallet service for balance mutations. */
  constructor(walletService: WalletService) {
    this.walletService = walletService;
  }

  /**
   * Process a fake deposit. Generates a unique reference and calls
   * walletService.deposit to credit the user's balance.
   *
   * Real providers return their own gateway reference (e.g. BitPay invoice ID).
   * If walletService.deposit throws (e.g. ConflictError), the error propagates
   * — no swallowing.
   *
   * @param userId - The user making the deposit
   * @param amountCents - Amount to deposit in USD cents
   * @returns The deposit result with a unique reference
   */
  async processDeposit(userId: UserId, amountCents: Money): Promise<DepositResult> {
    const reference = `fake-deposit-${userId}-${Date.now()}-${randomUUID()}`;
    await this.walletService.deposit(userId, amountCents, 'fake-payment-provider', reference);
    return { success: true, reference, amountCents };
  }

  /**
   * Process a fake withdrawal. Generates a unique reference and calls
   * walletService.withdraw to debit the user's balance.
   *
   * If walletService.withdraw throws, the error propagates — no swallowing.
   *
   * @param userId - The user receiving the withdrawal
   * @param amountCents - Amount to withdraw in USD cents
   * @returns The withdrawal result with a unique reference
   */
  async processWithdrawal(userId: UserId, amountCents: Money): Promise<WithdrawalResult> {
    const reference = `fake-withdrawal-${userId}-${Date.now()}-${randomUUID()}`;
    await this.walletService.withdraw(userId, amountCents, 'fake-payment-provider', reference);
    return { success: true, reference, amountCents };
  }

  /**
   * Return a deterministic, stable deposit address for a user.
   *
   * Real providers (e.g. Helius for Solana) return stable per-user wallet
   * addresses. The fake mirrors this by returning the same string for the
   * same userId across calls.
   *
   * @param userId - The user to generate an address for
   * @returns A deterministic fake address string
   */
  async getDepositAddress(userId: UserId): Promise<string> {
    return `fake-address-${userId}`;
  }
}
