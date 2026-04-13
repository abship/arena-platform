/**
 * Test helper: create a User + Wallet via Prisma directly.
 * Mirrors /auth/register's logic without HTTP overhead.
 */

import { randomUUID } from 'node:crypto';
import { hash } from 'bcrypt';
import { prisma } from '@arena/database';
import type { UserId } from '@arena/shared';
import { NEW_USER_FAKE_BALANCE_CENTS } from '@arena/shared';

interface SignupOptions {
  readonly country?: string;
  readonly region?: string;
  readonly dateOfBirth?: Date;
}

interface SignupResult {
  readonly userId: UserId;
  readonly email: string;
  readonly walletId: string;
}

/**
 * Register a test user with a wallet provisioned at $100.00 fake balance.
 *
 * @param options - Optional country/region/dateOfBirth overrides
 * @returns The created user's ID, email, and wallet ID
 */
export async function signup(options?: SignupOptions): Promise<SignupResult> {
  const uniqueId = randomUUID();
  const email = `test-${uniqueId}@integration.arena.gg`;
  const username = `test-${uniqueId}`;
  const passwordHash = await hash('test-password-123', 12);

  const thirtyYearsAgo = new Date();
  thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      username,
      country: options?.country ?? 'US',
      region: options?.region ?? 'CA',
      dateOfBirth: options?.dateOfBirth ?? thirtyYearsAgo,
    },
  });

  const wallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      balanceCents: BigInt(NEW_USER_FAKE_BALANCE_CENTS),
      currency: 'USD',
    },
  });

  return {
    userId: user.id as UserId,
    email,
    walletId: wallet.id,
  };
}
