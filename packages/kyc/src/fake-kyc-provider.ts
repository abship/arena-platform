/**
 * Fake KYC provider for Phase 1 (dev/test).
 *
 * Implements the KYCService interface with in-memory per-user state.
 * No network calls, no filesystem. State lives in the provider instance
 * only and resets when the instance is garbage-collected — this is
 * intentional for dev/test use.
 *
 * Real providers (Jumio) return async-pending flows with webhooks;
 * the fake short-circuits synchronously for test simplicity. The API
 * layer treats both provider types identically via the KYCService interface.
 */

import type { KYCService, VerificationResult } from '@arena/shared';
import type { UserId } from '@arena/shared';
import { VerificationLevel } from '@arena/shared';

/** Internal record stored per user in the in-memory map. */
interface UserRecord {
  readonly level: VerificationLevel;
  readonly dateOfBirth: string | null;
}

/** Configuration for FakeKYCProvider behavior. */
export interface FakeKYCConfig {
  /**
   * Level to approve up to when verifyIdentity is called.
   * Default: VerificationLevel.LEVEL_2 (standard verified).
   */
  readonly autoApproveToLevel?: VerificationLevel;
  /**
   * Users whose verifyIdentity calls return success: false.
   * Useful for testing rejection flows downstream.
   */
  readonly rejectUserIds?: Set<UserId>;
}

/**
 * FakeKYCProvider — in-memory identity verification for dev and test.
 *
 * Configurable via constructor:
 * - `autoApproveToLevel` controls the level granted on successful verification.
 * - `rejectUserIds` simulates rejection for specific users.
 */
export class FakeKYCProvider implements KYCService {
  private readonly users = new Map<UserId, UserRecord>();
  private readonly autoApproveToLevel: VerificationLevel;
  private readonly rejectUserIds: Set<UserId>;

  constructor(config?: FakeKYCConfig) {
    this.autoApproveToLevel = config?.autoApproveToLevel ?? VerificationLevel.LEVEL_2;
    this.rejectUserIds = config?.rejectUserIds ?? new Set();
  }

  /**
   * Submit identity documents for verification.
   *
   * The fake expects documents to contain at minimum "name" and "dateOfBirth"
   * (ISO YYYY-MM-DD format). Real Jumio uses a completely different document
   * payload (photo ID images, selfie, liveness data).
   *
   * @param userId - The user being verified
   * @param documents - Key-value map; must include "name" and "dateOfBirth"
   * @returns The verification result
   */
  async verifyIdentity(
    userId: UserId,
    documents: Record<string, string>,
  ): Promise<VerificationResult> {
    const currentLevel = this.users.get(userId)?.level ?? VerificationLevel.LEVEL_0;

    if (this.rejectUserIds.has(userId)) {
      return { success: false, level: currentLevel, reason: 'fake-kyc: user in rejection set' };
    }

    if (!documents['name']) {
      return { success: false, level: currentLevel, reason: 'fake-kyc: missing required documents' };
    }

    if (!documents['dateOfBirth']) {
      return { success: false, level: currentLevel, reason: 'fake-kyc: missing required documents' };
    }

    this.users.set(userId, {
      level: this.autoApproveToLevel,
      dateOfBirth: documents['dateOfBirth'],
    });

    return { success: true, level: this.autoApproveToLevel, reason: null };
  }

  /**
   * Check whether a user meets the minimum age requirement.
   *
   * Requires that verifyIdentity has been called for this user with a
   * "dateOfBirth" document. If the user has never been verified, returns false.
   *
   * @param userId - The user to check
   * @param minimumAge - Required minimum age in years
   * @returns True if the user meets the age requirement
   */
  async checkAge(userId: UserId, minimumAge: number): Promise<boolean> {
    const record = this.users.get(userId);
    if (!record || !record.dateOfBirth) {
      return false;
    }

    const dob = new Date(record.dateOfBirth);
    const today = new Date();

    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    return age >= minimumAge;
  }

  /**
   * Get a user's current KYC verification level.
   *
   * Returns LEVEL_0 if the user has never been verified.
   *
   * @param userId - The user to look up
   * @returns The user's current verification level
   */
  async getVerificationLevel(userId: UserId): Promise<VerificationLevel> {
    return this.users.get(userId)?.level ?? VerificationLevel.LEVEL_0;
  }
}
