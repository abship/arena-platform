import { Router } from 'express';
import type { AppDependencies } from '../types/app-dependencies.js';

/**
 * Create public game catalog routes.
 *
 * @param dependencies - Application dependencies
 * @returns An Express router mounted at /games
 */
export function createGamesRouter(
  dependencies: Pick<AppDependencies, 'prisma'>,
): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const games = await dependencies.prisma.game.findMany({
      where: { isEnabled: true },
      orderBy: { name: 'asc' },
    });

    res.json({ games });
  });

  return router;
}
