/**
 * Wallet provisioning for new user signups.
 * Creates a wallet with the starting fake balance ($100.00).
 *
 * @module
 */

import { prisma, Prisma } from '@arena/database';
import type { UserId, Wallet as SharedWallet } from '@arena/shared';
import { NEW_USER_FAKE_BALANCE_CENTS } from '@arena/shared';
import { moneyToBigInt, mapWallet } from './wallet-service.js';

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
