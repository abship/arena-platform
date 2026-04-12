/**
 * User domain types for the Arena.gg platform.
 */

/** Branded string type for user IDs, ensuring type safety across service boundaries. */
export type UserId = string & { readonly __brand: 'UserId' };

/**
 * KYC verification levels matching the verification pyramid.
 *
 * - LEVEL_0: Anonymous browsing, no account
 * - LEVEL_1: Email only, free play with Fun Coins
 * - LEVEL_2: Name + DOB + address + last 4 SSN, database check, small deposits up to $50-100
 * - LEVEL_3: Photo ID + selfie + liveness check via Sumsub, larger deposits up to $2000
 * - LEVEL_4: Enhanced due diligence, source of funds, unlimited deposits
 */
export enum VerificationLevel {
  LEVEL_0 = 0,
  LEVEL_1 = 1,
  LEVEL_2 = 2,
  LEVEL_3 = 3,
  LEVEL_4 = 4,
}

/** A platform user account. */
export interface User {
  /** Unique user identifier. */
  readonly id: UserId;
  /** User's email address. */
  readonly email: string;
  /** Display name chosen by the user. */
  readonly username: string;
  /** Current KYC verification level. */
  readonly verificationLevel: VerificationLevel;
  /** When the account was created. */
  readonly createdAt: Date;
}
