/**
 * Factory for constructing the active GeoService based on configuration.
 *
 * Today only "fake" is supported. Future additions:
 * - 'maxmind': Add a new case branch when MaxMind GeoLite2 account is
 *   signed up. Single switch-case addition, no refactor needed.
 * - GeoComply: Will be a separate package (fundamentally different shape —
 *   signed device assertions with client SDK, not IP lookup).
 */

import type { GeoService } from '@arena/shared';
import { FakeGeoProvider } from './fake-geo-provider.js';
import type { FakeGeoConfig } from './fake-geo-provider.js';

/** Configuration for the geo service factory. */
export interface GeoServiceConfig {
  /** Provider name. Defaults to 'fake' (reads GEO_PROVIDER env var). */
  readonly provider?: string;
  /** Configuration passed to FakeGeoProvider when provider is 'fake'. */
  readonly fakeConfig?: FakeGeoConfig;
}

/**
 * Create a GeoService based on the given config.
 *
 * @param config - Provider selection and dependencies
 * @returns A configured GeoService instance
 * @throws Error if the requested provider is not supported
 */
export function createGeoService(config?: GeoServiceConfig): GeoService {
  const provider = config?.provider ?? process.env['GEO_PROVIDER'] ?? 'fake';

  switch (provider) {
    case 'fake':
      return new FakeGeoProvider(config?.fakeConfig);
    // Future: case 'maxmind': return new MaxMindProvider(config?.maxmindConfig);
    default:
      throw new Error(
        `GEO_PROVIDER='${provider}' not supported. Supported providers: 'fake'. ` +
        'MaxMind integration deferred pending account signup; ' +
        'GeoComply planned as separate package post-beta.',
      );
  }
}
