/**
 * Factory for constructing the active KYCService based on configuration.
 *
 * Today only "fake" is supported. Post-beta, real providers (Jumio)
 * get added as new case branches.
 */

import type { KYCService } from '@arena/shared';
import { FakeKYCProvider } from './fake-kyc-provider.js';
import type { FakeKYCConfig } from './fake-kyc-provider.js';

/** Configuration for the KYC service factory. */
export interface KYCServiceConfig {
  /** Provider name. Defaults to 'fake' (reads KYC_PROVIDER env var). */
  readonly provider?: string;
  /** Configuration passed to FakeKYCProvider when provider is 'fake'. */
  readonly fakeConfig?: FakeKYCConfig;
}

/**
 * Create a KYCService based on the given config.
 *
 * @param config - Provider selection and dependencies
 * @returns A configured KYCService instance
 * @throws Error if the requested provider is not supported
 */
export function createKYCService(config?: KYCServiceConfig): KYCService {
  const provider = config?.provider ?? process.env['KYC_PROVIDER'] ?? 'fake';

  switch (provider) {
    case 'fake':
      return new FakeKYCProvider(config?.fakeConfig);
    default:
      throw new Error(
        `Unknown KYC provider "${provider}". Supported providers: fake`,
      );
  }
}
