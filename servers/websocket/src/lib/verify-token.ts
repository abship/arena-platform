import jwt, { JsonWebTokenError } from 'jsonwebtoken';
import type { UserId } from '@arena/shared';

export interface VerifiedToken {
  readonly userId: UserId;
}

/**
 * Verify a JWT and extract the authenticated user ID.
 *
 * KEEP IN SYNC WITH servers/api/src/lib/auth.ts until shared @arena/auth package is extracted.
 *
 * @param token - Bearer token without the prefix
 * @param jwtSecret - HMAC secret used by the API server
 * @returns The authenticated user ID wrapped for socket data assignment
 */
export function verifyToken(token: string, jwtSecret: string): VerifiedToken {
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const payload = jwt.verify(token, jwtSecret);

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload['userId'] !== 'string'
  ) {
    throw new JsonWebTokenError('Invalid token payload');
  }

  return { userId: payload['userId'] as UserId };
}
