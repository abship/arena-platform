/**
 * RulesSource — injectable jurisdiction rules lookup.
 *
 * Decouples jurisdiction policy from location lookup so the same
 * GeoService can be wired with different rule sets (e.g. test-only
 * overrides, staging relaxations, per-license rule tables).
 */

import type { CountryCode, JurisdictionRules, RegionCode } from '@arena/shared';
import { GameTier } from '@arena/shared';

/**
 * A function that returns jurisdiction rules for a given country/region,
 * or null when no rule exists for the location (unknown territory).
 */
export type RulesSource = (
  countryCode: CountryCode,
  regionCode?: RegionCode,
) => JurisdictionRules | null;

/** US states where real-money skill gaming is blocked. */
const US_BLOCKED_STATES: ReadonlySet<string> = new Set([
  'AZ', 'AR', 'CT', 'DE', 'IA', 'LA', 'MT', 'SC', 'SD', 'TN', 'VT',
]);

/** Rules for allowed US states (Tier 1 + Tier 2, crypto + stripe). */
const US_ALLOWED_RULES: JurisdictionRules = {
  realMoneyEnabled: true,
  minAge: 18,
  allowedTiers: [GameTier.TIER_1, GameTier.TIER_2],
  allowedPaymentMethods: ['crypto', 'stripe'],
  requiresLicense: false,
};

/** Rules for blocked US states. */
const US_BLOCKED_RULES: JurisdictionRules = {
  realMoneyEnabled: false,
  minAge: 18,
  allowedTiers: [],
  allowedPaymentMethods: [],
  requiresLicense: true,
};

/** Rules for GB (no UKGC license yet). */
const GB_RULES: JurisdictionRules = {
  realMoneyEnabled: false,
  minAge: 18,
  allowedTiers: [],
  allowedPaymentMethods: [],
  requiresLicense: true,
};

/**
 * Default in-memory rules source.
 *
 * - US allowed states: realMoneyEnabled, Tier 1 + Tier 2, crypto + stripe
 * - US blocked states (AZ, AR, CT, DE, IA, LA, MT, SC, SD, TN, VT): blocked
 * - GB: blocked (no UKGC license)
 * - Unknown country: returns null (caller decides)
 */
export const DEFAULT_RULES_SOURCE: RulesSource = (
  countryCode: CountryCode,
  regionCode?: RegionCode,
): JurisdictionRules | null => {
  if (countryCode === ('US' as CountryCode)) {
    if (regionCode && US_BLOCKED_STATES.has(regionCode as string)) {
      return US_BLOCKED_RULES;
    }
    return US_ALLOWED_RULES;
  }

  if (countryCode === ('GB' as CountryCode)) {
    return GB_RULES;
  }

  return null;
};
