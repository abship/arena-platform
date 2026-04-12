import { describe, expect, it } from 'vitest';
import type { CountryCode, GeoLocation, JurisdictionRules, RegionCode } from '@arena/shared';
import { GameTier } from '@arena/shared';
import { FakeGeoProvider } from '../fake-geo-provider.js';
import { createGeoService } from '../geo-service-factory.js';
import type { RulesSource } from '../rules-source.js';

describe('FakeGeoProvider', () => {
  describe('getLocation', () => {
    it('returns defaultLocation when no override matches', async () => {
      const provider = new FakeGeoProvider();
      const location = await provider.getLocation('1.2.3.4');

      expect(location.countryCode).toBe('US');
      expect(location.regionCode).toBe('CA');
      expect(location.latitude).toBe(37.7749);
      expect(location.longitude).toBe(-122.4194);
    });

    it('returns ipOverride when IP matches', async () => {
      const gbLocation: GeoLocation = {
        countryCode: 'GB' as CountryCode,
        regionCode: null,
        latitude: 51.5074,
        longitude: -0.1278,
      };
      const provider = new FakeGeoProvider({
        ipOverrides: new Map([['10.0.0.1', gbLocation]]),
      });

      const location = await provider.getLocation('10.0.0.1');
      expect(location).toEqual(gbLocation);
    });

    it('overrides lat/lng with gpsCoords but keeps default country/region', async () => {
      const provider = new FakeGeoProvider();
      const location = await provider.getLocation('1.2.3.4', {
        latitude: 40.7128,
        longitude: -74.006,
      });

      expect(location.countryCode).toBe('US');
      expect(location.regionCode).toBe('CA');
      expect(location.latitude).toBe(40.7128);
      expect(location.longitude).toBe(-74.006);
    });
  });

  describe('checkJurisdiction', () => {
    it('returns true for allowed US state (CA)', async () => {
      const provider = new FakeGeoProvider();
      const location: GeoLocation = {
        countryCode: 'US' as CountryCode,
        regionCode: 'CA' as RegionCode,
        latitude: null,
        longitude: null,
      };

      expect(await provider.checkJurisdiction(location)).toBe(true);
    });

    it('returns false for blocked US state (AZ)', async () => {
      const provider = new FakeGeoProvider();
      const location: GeoLocation = {
        countryCode: 'US' as CountryCode,
        regionCode: 'AZ' as RegionCode,
        latitude: null,
        longitude: null,
      };

      expect(await provider.checkJurisdiction(location)).toBe(false);
    });

    it('returns false for country not in rules (XX)', async () => {
      const provider = new FakeGeoProvider();
      const location: GeoLocation = {
        countryCode: 'XX' as CountryCode,
        regionCode: null,
        latitude: null,
        longitude: null,
      };

      expect(await provider.checkJurisdiction(location)).toBe(false);
    });

    it('returns false for GB (no UKGC license)', async () => {
      const provider = new FakeGeoProvider();
      const location: GeoLocation = {
        countryCode: 'GB' as CountryCode,
        regionCode: null,
        latitude: null,
        longitude: null,
      };

      expect(await provider.checkJurisdiction(location)).toBe(false);
    });
  });

  describe('getRules', () => {
    it('returns rules for US/CA with Tier 1 and Tier 2', async () => {
      const provider = new FakeGeoProvider();
      const rules = await provider.getRules(
        'US' as CountryCode,
        'CA' as RegionCode,
      );

      expect(rules.realMoneyEnabled).toBe(true);
      expect(rules.minAge).toBe(18);
      expect(rules.allowedTiers).toContain(GameTier.TIER_1);
      expect(rules.allowedTiers).toContain(GameTier.TIER_2);
      expect(rules.allowedTiers).toHaveLength(2);
      expect(rules.allowedPaymentMethods).toContain('crypto');
      expect(rules.allowedPaymentMethods).toContain('stripe');
      expect(rules.requiresLicense).toBe(false);
    });

    it('returns blocked rules for US/AZ', async () => {
      const provider = new FakeGeoProvider();
      const rules = await provider.getRules(
        'US' as CountryCode,
        'AZ' as RegionCode,
      );

      expect(rules.realMoneyEnabled).toBe(false);
      expect(rules.allowedTiers).toHaveLength(0);
      expect(rules.allowedPaymentMethods).toHaveLength(0);
      expect(rules.requiresLicense).toBe(true);
    });

    it('throws for country/region with no rule', async () => {
      const provider = new FakeGeoProvider();

      await expect(
        provider.getRules('XX' as CountryCode),
      ).rejects.toThrow('No jurisdiction rules found for "XX"');
    });
  });

  describe('custom rulesSource', () => {
    it('uses injected rulesSource instead of default', async () => {
      const customRules: JurisdictionRules = {
        realMoneyEnabled: true,
        minAge: 21,
        allowedTiers: [GameTier.TIER_1],
        allowedPaymentMethods: ['crypto'],
        requiresLicense: false,
      };

      const customSource: RulesSource = (countryCode) => {
        if (countryCode === ('JP' as CountryCode)) return customRules;
        return null;
      };

      const provider = new FakeGeoProvider({ rulesSource: customSource });
      const location: GeoLocation = {
        countryCode: 'JP' as CountryCode,
        regionCode: null,
        latitude: null,
        longitude: null,
      };

      expect(await provider.checkJurisdiction(location)).toBe(true);
      const rules = await provider.getRules('JP' as CountryCode);
      expect(rules.minAge).toBe(21);
    });
  });
});

describe('createGeoService (factory)', () => {
  it('returns FakeGeoProvider by default', () => {
    const service = createGeoService();
    expect(service).toBeInstanceOf(FakeGeoProvider);
  });

  it('returns FakeGeoProvider when provider is "fake"', () => {
    const service = createGeoService({ provider: 'fake' });
    expect(service).toBeInstanceOf(FakeGeoProvider);
  });

  it('throws for "maxmind" with supportive error message', () => {
    expect(() => createGeoService({ provider: 'maxmind' })).toThrow(
      'MaxMind integration deferred',
    );
  });

  it('throws for "geocomply" with supportive error message', () => {
    expect(() => createGeoService({ provider: 'geocomply' })).toThrow(
      'GeoComply planned as separate package post-beta',
    );
  });

  it('throws for unknown provider', () => {
    expect(() => createGeoService({ provider: 'unknown' })).toThrow(
      "GEO_PROVIDER='unknown' not supported",
    );
  });
});
