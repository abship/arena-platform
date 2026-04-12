/**
 * KYC service contract — identity verification, age checks,
 * and verification level management.
 */

import type { UserId } from '../types/user.js';
import type { VerificationLevel } from '../types/user.js';

/** The result of an identity verification attempt. */
export interface VerificationResult {
  /** Whether verification succeeded. */
  readonly success: boolean;
  /** The verification level achieved (or current level if failed). */
  readonly level: VerificationLevel;
  /** Human-readable reason if verification failed. */
  readonly reason: string | null;
}

/**
 * Contract for the KYC service. Manages the verification pyramid
 * from Level 0 (anonymous) through Level 4 (enhanced due diligence).
 */
export interface KYCService {
  /**
   * Submit identity documents for verification at the next level.
   * @param userId - The user being verified
   * @param documents - Key-value map of document data (e.g. name, DOB, ID image URL)
   * @returns The verification result
   */
  verifyIdentity(
    userId: UserId,
    documents: Record<string, string>,
  ): Promise<VerificationResult>;

  /**
   * Check whether a user meets the minimum age requirement.
   * @param userId - The user to check
   * @param minimumAge - The required minimum age in years
   * @returns True if the user meets the age requirement
   */
  checkAge(userId: UserId, minimumAge: number): Promise<boolean>;

  /**
   * Get a user's current KYC verification level.
   * @param userId - The user to look up
   * @returns The user's current verification level
   */
  getVerificationLevel(userId: UserId): Promise<VerificationLevel>;
}
