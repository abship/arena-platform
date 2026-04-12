import { describe, it, expect } from 'vitest';
import type { UserId } from '@arena/shared';
import { VerificationLevel } from '@arena/shared';
import { FakeKYCProvider } from '../fake-kyc-provider.js';
import { createKYCService } from '../kyc-service-factory.js';

const USER_A = 'user-aaa' as UserId;
const USER_B = 'user-bbb' as UserId;

const VALID_DOCS: Record<string, string> = {
  name: 'Alice Smith',
  dateOfBirth: '2000-06-15',
};

describe('FakeKYCProvider', () => {
  describe('verifyIdentity', () => {
    it('happy path: returns success with default autoApproveToLevel (LEVEL_2)', async () => {
      const provider = new FakeKYCProvider();
      const result = await provider.verifyIdentity(USER_A, VALID_DOCS);

      expect(result.success).toBe(true);
      expect(result.level).toBe(VerificationLevel.LEVEL_2);
      expect(result.reason).toBeNull();
    });

    it('sets verification level retrievable via getVerificationLevel', async () => {
      const provider = new FakeKYCProvider();
      await provider.verifyIdentity(USER_A, VALID_DOCS);

      const level = await provider.getVerificationLevel(USER_A);
      expect(level).toBe(VerificationLevel.LEVEL_2);
    });

    it('rejects user in rejectUserIds set', async () => {
      const provider = new FakeKYCProvider({
        rejectUserIds: new Set([USER_A]),
      });

      const result = await provider.verifyIdentity(USER_A, VALID_DOCS);

      expect(result.success).toBe(false);
      expect(result.level).toBe(VerificationLevel.LEVEL_0);
      expect(result.reason).toBe('fake-kyc: user in rejection set');

      // State unchanged
      const level = await provider.getVerificationLevel(USER_A);
      expect(level).toBe(VerificationLevel.LEVEL_0);
    });

    it('fails when "name" is missing', async () => {
      const provider = new FakeKYCProvider();
      const result = await provider.verifyIdentity(USER_A, { dateOfBirth: '2000-01-01' });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('fake-kyc: missing required documents');

      const level = await provider.getVerificationLevel(USER_A);
      expect(level).toBe(VerificationLevel.LEVEL_0);
    });

    it('fails when "dateOfBirth" is missing', async () => {
      const provider = new FakeKYCProvider();
      const result = await provider.verifyIdentity(USER_A, { name: 'Alice' });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('fake-kyc: missing required documents');

      const level = await provider.getVerificationLevel(USER_A);
      expect(level).toBe(VerificationLevel.LEVEL_0);
    });

    it('respects custom autoApproveToLevel', async () => {
      const provider = new FakeKYCProvider({
        autoApproveToLevel: VerificationLevel.LEVEL_1,
      });
      const result = await provider.verifyIdentity(USER_A, VALID_DOCS);

      expect(result.success).toBe(true);
      expect(result.level).toBe(VerificationLevel.LEVEL_1);
    });
  });

  describe('checkAge', () => {
    it('returns false for never-verified user', async () => {
      const provider = new FakeKYCProvider();
      const result = await provider.checkAge(USER_A, 18);
      expect(result).toBe(false);
    });

    it('returns true when user is old enough', async () => {
      const provider = new FakeKYCProvider();
      const twentyFiveYearsAgo = new Date();
      twentyFiveYearsAgo.setFullYear(twentyFiveYearsAgo.getFullYear() - 25);
      const dob = twentyFiveYearsAgo.toISOString().slice(0, 10);

      await provider.verifyIdentity(USER_A, { name: 'Alice', dateOfBirth: dob });
      const result = await provider.checkAge(USER_A, 18);
      expect(result).toBe(true);
    });

    it('returns false when user is too young', async () => {
      const provider = new FakeKYCProvider();
      const sixteenYearsAgo = new Date();
      sixteenYearsAgo.setFullYear(sixteenYearsAgo.getFullYear() - 16);
      const dob = sixteenYearsAgo.toISOString().slice(0, 10);

      await provider.verifyIdentity(USER_A, { name: 'Bob', dateOfBirth: dob });
      const result = await provider.checkAge(USER_A, 18);
      expect(result).toBe(false);
    });

    it('returns true on exact birthday (edge case)', async () => {
      const provider = new FakeKYCProvider();
      const exactlyEighteen = new Date();
      exactlyEighteen.setFullYear(exactlyEighteen.getFullYear() - 18);
      const dob = exactlyEighteen.toISOString().slice(0, 10);

      await provider.verifyIdentity(USER_A, { name: 'Charlie', dateOfBirth: dob });
      const result = await provider.checkAge(USER_A, 18);
      expect(result).toBe(true);
    });
  });

  describe('getVerificationLevel', () => {
    it('returns LEVEL_0 for never-verified user', async () => {
      const provider = new FakeKYCProvider();
      const level = await provider.getVerificationLevel(USER_A);
      expect(level).toBe(VerificationLevel.LEVEL_0);
    });

    it('returns the level set by verifyIdentity', async () => {
      const provider = new FakeKYCProvider({
        autoApproveToLevel: VerificationLevel.LEVEL_3,
      });
      await provider.verifyIdentity(USER_A, VALID_DOCS);

      const level = await provider.getVerificationLevel(USER_A);
      expect(level).toBe(VerificationLevel.LEVEL_3);
    });

    it('tracks users independently', async () => {
      const provider = new FakeKYCProvider();
      await provider.verifyIdentity(USER_A, VALID_DOCS);

      expect(await provider.getVerificationLevel(USER_A)).toBe(VerificationLevel.LEVEL_2);
      expect(await provider.getVerificationLevel(USER_B)).toBe(VerificationLevel.LEVEL_0);
    });
  });
});

describe('KYCServiceFactory', () => {
  it('returns FakeKYCProvider by default', () => {
    const service = createKYCService();
    expect(service).toBeInstanceOf(FakeKYCProvider);
  });

  it('returns FakeKYCProvider when provider is explicitly "fake"', () => {
    const service = createKYCService({ provider: 'fake' });
    expect(service).toBeInstanceOf(FakeKYCProvider);
  });

  it('throws for unknown provider names', () => {
    expect(() => createKYCService({ provider: 'jumio' })).toThrow(
      /Unknown KYC provider "jumio"/,
    );
  });

  it('passes fakeConfig through to FakeKYCProvider', async () => {
    const service = createKYCService({
      fakeConfig: { autoApproveToLevel: VerificationLevel.LEVEL_1 },
    });

    const result = await service.verifyIdentity(USER_A, VALID_DOCS);
    expect(result.level).toBe(VerificationLevel.LEVEL_1);
  });
});
