import 'express-async-errors';
import cors from 'cors';
import express, { type Express } from 'express';
import { configureAuth } from './lib/auth.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { createAuthRouter } from './routes/auth.js';
import { createGamesRouter } from './routes/games.js';
import { createHealthRouter } from './routes/health.js';
import { createKYCRouter } from './routes/kyc.js';
import { createMatchmakingRouter } from './routes/matchmaking.js';
import { createUsersRouter } from './routes/users.js';
import { createWalletRouter } from './routes/wallet.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import type { AppDependencies } from './types/app-dependencies.js';

/**
 * Create the Arena API Express application with injected runtime dependencies.
 *
 * @param dependencies - Application dependencies
 * @returns A configured Express app
 */
export function createApp(dependencies: AppDependencies): Express {
  configureAuth(dependencies.jwtSecret);

  const app = express();
  app.set('trust proxy', true);
  app.set('json replacer', (_key: string, value: unknown) => (
    typeof value === 'bigint' ? value.toString() : value
  ));

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(requestContextMiddleware);

  app.use('/health', createHealthRouter());
  app.use('/auth', createAuthRouter(dependencies));
  app.use('/games', createGamesRouter(dependencies));
  app.use('/webhooks', createWebhooksRouter());

  app.use('/users', authMiddleware, createUsersRouter(dependencies));
  app.use('/wallet', authMiddleware, createWalletRouter(dependencies));
  app.use('/kyc', authMiddleware, createKYCRouter(dependencies));
  app.use('/matchmaking', authMiddleware, createMatchmakingRouter(dependencies));

  app.use((_req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Route not found',
    });
  });

  app.use(errorHandler);

  return app;
}
