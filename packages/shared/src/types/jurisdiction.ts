/**
 * Jurisdiction and geolocation types for the Arena.gg platform.
 */

import type { GameTier } from './game.js';

/** ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "DE"). */
export type CountryCode = string & { readonly __brand: 'CountryCode' };

/** Region/state/province code within a country (e.g. "CA" for California). */
export type RegionCode = string & { readonly __brand: 'RegionCode' };

/** Supported payment method identifiers. */
export type PaymentMethod = 'crypto' | 'stripe' | 'paypal';

/** Rules governing real-money gaming for a specific jurisdiction. */
export interface JurisdictionRules {
  /** Whether real-money play is allowed in this jurisdiction. */
  readonly realMoneyEnabled: boolean;
  /** Minimum age required to play for real money. */
  readonly minAge: number;
  /** Which game tiers are permitted. */
  readonly allowedTiers: readonly GameTier[];
  /** Which payment methods are available. */
  readonly allowedPaymentMethods: readonly PaymentMethod[];
  /** Whether a gambling license is required to operate. */
  readonly requiresLicense: boolean;
}
