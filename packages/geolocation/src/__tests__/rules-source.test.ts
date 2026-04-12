import { describe, expect, it } from 'vitest';
import type { CountryCode, RegionCode } from '@arena/shared';
import { GameTier } from '@arena/shared';
import { DEFAULT_RULES_SOURCE } from '../rules-source.js';

describe('DEFAULT_RULES_SOURCE', () => {
  describe('US allowed states', () => {
    it('returns correct shape for US/CA', () => {
      const rules = DEFAULT_RULES_SOURCE(
        'US' as CountryCode,
        'CA' as RegionCode,
      );

      expect(rules).not.toBeNull();
      expect(rules!.realMoneyEnabled).toBe(true);
      expect(rules!.minAge).toBe(18);
      expect(rules!.allowedTiers).toContain(GameTier.TIER_1);
      expect(rules!.allowedTiers).toContain(GameTier.TIER_2);
      expect(rules!.allowedTiers).toHaveLength(2);
      expect(rules!.allowedPaymentMethods).toContain('crypto');
      expect(rules!.allowedPaymentMethods).toContain('stripe');
      expect(rules!.requiresLicense).toBe(false);
    });

    it('returns allowed rules for US with no region', () => {
      const rules = DEFAULT_RULES_SOURCE('US' as CountryCode);

      expect(rules).not.toBeNull();
      expect(rules!.realMoneyEnabled).toBe(true);
    });
  });

  describe('US blocked states', () => {
    const blockedStates = ['AZ', 'AR', 'CT', 'DE', 'IA', 'LA', 'MT', 'SC', 'SD', 'TN', 'VT'];

    for (const state of blockedStates) {
      it(`returns blocked rules for US/${state}`, () => {
        const rules = DEFAULT_RULES_SOURCE(
          'US' as CountryCode,
          state as RegionCode,
        );

        expect(rules).not.toBeNull();
        expect(rules!.realMoneyEnabled).toBe(false);
        expect(rules!.minAge).toBe(18);
        expect(rules!.allowedTiers).toHaveLength(0);
        expect(rules!.allowedPaymentMethods).toHaveLength(0);
        expect(rules!.requiresLicense).toBe(true);
      });
    }
  });

  describe('GB', () => {
    it('returns blocked rules (no UKGC license)', () => {
      const rules = DEFAULT_RULES_SOURCE('GB' as CountryCode);

      expect(rules).not.toBeNull();
      expect(rules!.realMoneyEnabled).toBe(false);
      expect(rules!.allowedTiers).toHaveLength(0);
      expect(rules!.allowedPaymentMethods).toHaveLength(0);
      expect(rules!.requiresLicense).toBe(true);
    });
  });

  describe('unknown country', () => {
    it('returns null for XX', () => {
      const rules = DEFAULT_RULES_SOURCE('XX' as CountryCode);
      expect(rules).toBeNull();
    });
  });
});
