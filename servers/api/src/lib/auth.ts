import bcrypt from 'bcrypt';
import jwt, { JsonWebTokenError } from 'jsonwebtoken';
import type { UserId } from '@arena/shared';

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN = '7d';

let configuredJwtSecret: string | null = null;

/**
 * Configure the JWT secret used by auth helpers.
 *
 * @param jwtSecret - HMAC secret for signing and verifying JWTs
 */
export function configureAuth(jwtSecret: string): void {
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  configuredJwtSecret = jwtSecret;
}

function getJwtSecret(): string {
  const jwtSecret = configuredJwtSecret ?? process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  return jwtSecret;
}

/**
 * Sign a stateless auth token for a user.
 *
 * @param userId - The authenticated user ID
 * @returns A JWT valid for 7 days
 */
export function signToken(userId: UserId): string {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT and extract the authenticated user ID.
 *
 * @param token - Bearer token without the prefix
 * @returns The authenticated user ID
 */
export function verifyToken(token: string): UserId {
  const payload = jwt.verify(token, getJwtSecret());

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload['userId'] !== 'string'
  ) {
    throw new JsonWebTokenError('Invalid token payload');
  }

  return payload['userId'] as UserId;
}

/**
 * Hash a plain-text password using bcrypt.
 *
 * @param plainTextPassword - The user's plain-text password
 * @returns The bcrypt password hash
 */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, BCRYPT_ROUNDS);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 *
 * @param plainTextPassword - The candidate plain-text password
 * @param passwordHash - The stored bcrypt hash
 * @returns True when the password matches the hash
 */
export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plainTextPassword, passwordHash);
  } catch {
    return false;
  }
}
