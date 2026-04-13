import { Router } from 'express';
import { NotFoundError } from '@arena/shared';
import type { AppDependencies } from '../types/app-dependencies.js';

/**
 * Create authenticated user profile routes.
 *
 * @param dependencies - Application dependencies
 * @returns An Express router mounted at /users
 */
export function createUsersRouter(
  dependencies: Pick<AppDependencies, 'prisma'>,
): Router {
  const router = Router();

  router.get('/me', async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('Authenticated user missing from request');
    }

    const user = await dependencies.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        verificationLevel: true,
        country: true,
        region: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found', { userId });
    }

    res.json({
      userId: user.id,
      email: user.email,
      username: user.username,
      verificationLevel: user.verificationLevel,
      country: user.country,
      region: user.region,
      createdAt: user.createdAt,
    });
  });

  return router;
}
