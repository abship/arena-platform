/**
 * Factory for constructing the active PaymentProvider based on configuration.
 *
 * Today only "fake" is supported. Post-beta, real providers (BitPay, Helius,
 * Coinbase Commerce, NOWPayments, Paysafe) get added as new case branches.
 */

import type { PaymentProvider } from '@arena/shared';
import type { WalletService } from '@arena/shared';
import { FakePaymentProvider } from './fake-payment-provider.js';

/** Configuration for the payment provider factory. */
export interface PaymentProviderConfig {
  /** Provider name. Defaults to 'fake' (reads PAYMENT_PROVIDER env var). */
  readonly provider?: string;
  /** WalletService instance to inject into providers that need it. */
  readonly walletService: WalletService;
}

/**
 * Create a PaymentProvider based on the given config.
 *
 * @param config - Provider selection and dependencies
 * @returns A configured PaymentProvider instance
 * @throws Error if the requested provider is not supported
 */
export function createPaymentProvider(config: PaymentProviderConfig): PaymentProvider {
  const provider = config.provider ?? process.env['PAYMENT_PROVIDER'] ?? 'fake';

  switch (provider) {
    case 'fake':
      return new FakePaymentProvider(config.walletService);
    default:
      throw new Error(
        `Unknown payment provider "${provider}". Supported providers: fake`,
      );
  }
}
