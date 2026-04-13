/**
 * Wallet provisioning for new user signups and system wallet initialization.
 *
 * @module
 */

import { prisma, Prisma } from '@arena/database';
import type { UserId, Wallet as SharedWallet } from '@arena/shared';
import { NEW_USER_FAKE_BALANCE_CENTS } from '@arena/shared';
import { moneyToBigInt, mapWallet } from './wallet-service.js';

/** System user ID for the platform suspense wallet (external money gateway). */
export const SYSTEM_PLATFORM_SUSPENSE_USER_ID = 'SYSTEM_PLATFORM_SUSPENSE';

/** System user ID for the match pool wallet (money in active matches). */
export const SYSTEM_MATCH_POOL_USER_ID = 'SYSTEM_MATCH_POOL';

/** System user ID for the platform revenue wallet (accumulated rake). */
export const SYSTEM_PLATFORM_REVENUE_USER_ID = 'SYSTEM_PLATFORM_REVENUE';

/** Return type from provisionSystemWallets(). */
export interface SystemWalletIds {
  readonly platformSuspenseWalletId: string;
  readonly matchPoolWalletId: string;
  readonly platformRevenueWalletId: string;
}

const SYSTEM_WALLET_DEFS = [
  { userId: SYSTEM_PLATFORM_SUSPENSE_USER_ID, key: 'platformSuspenseWalletId' as const },
  { userId: SYSTEM_MATCH_POOL_USER_ID, key: 'matchPoolWalletId' as const },
  { userId: SYSTEM_PLATFORM_REVENUE_USER_ID, key: 'platformRevenueWalletId' as const },
] as const;

const SYSTEM_PASSWORD_HASH =
  '$2b$12$xejvjsLKoQG83ZdZYV.CFeSP7Uk7QRiXJRPSIL50Y/guGesKgAdgO';

/**
 * Idempotently create all three system users and wallets required for double-entry
 * bookkeeping. Uses upsert to handle concurrent calls safely.
 *
 * Must be called OUTSIDE any money-operation transaction — typically at startup
 * via WalletServiceImpl.create(), or from the seed script.
 *
 * @returns The wallet IDs for platform_suspense, match_pool, and platform_revenue
 */
export async function provisionSystemWallets(): Promise<SystemWalletIds> {
  const result: Record<string, string> = {};

  for (const def of SYSTEM_WALLET_DEFS) {
    await prisma.user.upsert({
      where: { id: def.userId },
      create: {
        id: def.userId,
        email: `${def.userId.toLowerCase()}@system.arena.gg`,
        passwordHash: SYSTEM_PASSWORD_HASH,
        username: def.userId,
        country: 'SYSTEM',
      },
      update: {},
    });

    const wallet = await prisma.wallet.upsert({
      where: { userId: def.userId },
      create: {
        userId: def.userId,
        balanceCents: BigInt(0),
        currency: 'USD',
      },
      update: {},
    });

    result[def.key] = wallet.id;
  }

  return result as unknown as SystemWalletIds;
}

/**
 * Create a wallet for a new user with the starting fake balance.
 * Idempotent — if the wallet already exists, returns it unchanged.
 *
 * @param userId - The user to provision a wallet for (must already exist in the users table)
 * @returns The user's wallet (existing or newly created)
 */
export async function provisionWalletForUser(userId: UserId): Promise<SharedWallet> {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) {
    return mapWallet(existing);
  }

  try {
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        balanceCents: moneyToBigInt(NEW_USER_FAKE_BALANCE_CENTS),
        currency: 'USD',
      },
    });
    return mapWallet(wallet);
  } catch (error: unknown) {
    // Handle race condition: another call created the wallet between our check and create.
    // P2002 = unique constraint violation on Wallet.userId.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (wallet) {
        return mapWallet(wallet);
      }
    }
    throw error;
  }
}
