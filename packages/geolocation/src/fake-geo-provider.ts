/**
 * Fake geolocation provider for Phase 1 (dev/test).
 *
 * Implements the GeoService interface entirely in-memory with no network
 * calls, no filesystem access, and no persistence. State lives in the
 * provider instance only — intentional for dev/test use.
 *
 * All locations are determined by constructor config:
 * - `ipOverrides` map specific IPs to specific GeoLocations
 * - `defaultLocation` is returned when no override matches
 * - `rulesSource` controls jurisdiction rule lookups
 */

import type { CountryCode, JurisdictionRules, RegionCode } from '@arena/shared';
import type { GeoLocation, GeoService } from '@arena/shared';
import type { RulesSource } from './rules-source.js';
import { DEFAULT_RULES_SOURCE } from './rules-source.js';

/** Configuration for FakeGeoProvider behavior. */
export interface FakeGeoConfig {
  /** Injectable rules lookup. Defaults to DEFAULT_RULES_SOURCE. */
  readonly rulesSource?: RulesSource;
  /** Map of IP addresses to forced GeoLocations for tests/dev. */
  readonly ipOverrides?: Map<string, GeoLocation>;
  /** Location returned when no override matches. Defaults to US/CA (San Francisco). */
  readonly defaultLocation?: GeoLocation;
}

/** Default location: San Francisco, California. */
const SF_LOCATION: GeoLocation = {
  countryCode: 'US' as CountryCode,
  regionCode: 'CA' as RegionCode,
  latitude: 37.7749,
  longitude: -122.4194,
};

/**
 * FakeGeoProvider — in-memory geolocation for dev and test.
 *
 * No network, no persistence. Configurable via constructor:
 * - `rulesSource` for jurisdiction rules
 * - `ipOverrides` for deterministic IP → location mapping
 * - `defaultLocation` for the fallback location
 */
export class FakeGeoProvider implements GeoService {
  private readonly rulesSource: RulesSource;
  private readonly ipOverrides: Map<string, GeoLocation>;
  private readonly defaultLocation: GeoLocation;

  constructor(config?: FakeGeoConfig) {
    this.rulesSource = config?.rulesSource ?? DEFAULT_RULES_SOURCE;
    this.ipOverrides = config?.ipOverrides ?? new Map();
    this.defaultLocation = config?.defaultLocation ?? SF_LOCATION;
  }

  /**
   * Resolve a player's geographic location.
   *
   * Resolution order:
   * 1. If gpsCoords provided: return defaultLocation's country/region with provided lat/lng
   * 2. If ipAddress is in ipOverrides: return that override
   * 3. Otherwise: return defaultLocation
   *
   * @param ipAddress - The player's IP address
   * @param gpsCoords - Optional GPS coordinates
   * @returns The resolved location
   */
  async getLocation(
    ipAddress: string,
    gpsCoords?: { latitude: number; longitude: number },
  ): Promise<GeoLocation> {
    if (gpsCoords) {
      return {
        countryCode: this.defaultLocation.countryCode,
        regionCode: this.defaultLocation.regionCode,
        latitude: gpsCoords.latitude,
        longitude: gpsCoords.longitude,
      };
    }

    const override = this.ipOverrides.get(ipAddress);
    if (override) {
      return override;
    }

    return this.defaultLocation;
  }

  /**
   * Check whether real-money gaming is permitted at a location.
   *
   * Looks up rules via rulesSource. If no rules exist for the location
   * (null return), defaults to false (fail-safe: unknown = blocked).
   *
   * @param location - The resolved geographic location
   * @returns True if real-money play is allowed
   */
  async checkJurisdiction(location: GeoLocation): Promise<boolean> {
    const rules = this.rulesSource(
      location.countryCode,
      location.regionCode ?? undefined,
    );
    if (!rules) {
      return false;
    }
    return rules.realMoneyEnabled;
  }

  /**
   * Get the full jurisdiction rules for a location.
   *
   * Unlike checkJurisdiction, this throws when no rules exist — callers
   * asking for rules expect them to exist or want a loud failure so bugs
   * surface immediately.
   *
   * @param countryCode - ISO 3166-1 alpha-2 country code
   * @param regionCode - Optional region/state code
   * @returns The jurisdiction rules
   * @throws Error if no rules exist for the given country/region
   */
  async getRules(
    countryCode: CountryCode,
    regionCode?: RegionCode,
  ): Promise<JurisdictionRules> {
    const rules = this.rulesSource(countryCode, regionCode);
    if (!rules) {
      const location = regionCode ? `${countryCode}/${regionCode}` : countryCode;
      throw new Error(
        `No jurisdiction rules found for "${location}". ` +
        'Add rules to the RulesSource or use a different provider.',
      );
    }
    return rules;
  }
}
