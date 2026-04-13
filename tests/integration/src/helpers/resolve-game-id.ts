/**
 * Test helper: resolve a game slug to its seeded Game.id (cuid).
 */

import { prisma } from '@arena/database';
import type { GameId } from '@arena/shared';

/**
 * Look up a seeded game by slug and return its database ID.
 *
 * @param slug - The game slug (e.g. 'tetris-duel')
 * @returns The Game.id as a branded GameId
 * @throws Error if the game slug is not found (seed may not have run)
 */
export async function resolveGameId(slug: string): Promise<GameId> {
  const game = await prisma.game.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!game) {
    throw new Error(
      `Game slug "${slug}" not found. Did the seed run? ` +
      'Check that global-setup.ts executed successfully.',
    );
  }

  return game.id as GameId;
}
