/**
 * Geolocation service contract — IP/GPS location lookup,
 * jurisdiction checking, and rules retrieval.
 */

import type { CountryCode, JurisdictionRules, RegionCode } from '../types/jurisdiction.js';

/** A resolved geographic location. */
export interface GeoLocation {
  /** ISO 3166-1 alpha-2 country code. */
  readonly countryCode: CountryCode;
  /** Region/state/province code within the country. */
  readonly regionCode: RegionCode | null;
  /** Latitude (null if only IP-based). */
  readonly latitude: number | null;
  /** Longitude (null if only IP-based). */
  readonly longitude: number | null;
}

/**
 * Contract for the geolocation service. Determines player location
 * and enforces jurisdiction-based rules.
 */
export interface GeoService {
  /**
   * Resolve a player's geographic location from their IP address and optional GPS coordinates.
   * @param ipAddress - The player's IP address
   * @param gpsCoords - Optional GPS coordinates { latitude, longitude }
   * @returns The resolved location
   */
  getLocation(
    ipAddress: string,
    gpsCoords?: { latitude: number; longitude: number },
  ): Promise<GeoLocation>;

  /**
   * Check whether real-money gaming is permitted at a location.
   * @param location - The resolved geographic location
   * @returns True if real-money play is allowed
   */
  checkJurisdiction(location: GeoLocation): Promise<boolean>;

  /**
   * Get the full jurisdiction rules for a location.
   * @param countryCode - ISO 3166-1 alpha-2 country code
   * @param regionCode - Optional region/state code for country-specific rules
   * @returns The jurisdiction rules for that location
   */
  getRules(
    countryCode: CountryCode,
    regionCode?: RegionCode,
  ): Promise<JurisdictionRules>;
}
