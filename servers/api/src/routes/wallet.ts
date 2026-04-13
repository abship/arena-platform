import { Router } from 'express';
import type { Money } from '@arena/shared';
import type { AppDependencies } from '../types/app-dependencies.js';
import { withRetry } from '../middleware/with-retry.js';
import {
  depositBodySchema,
  transactionHistoryQuerySchema,
} from '../validators/wallet.js';
import { parseWithSchema } from '../validators/parse.js';

/**
 * Create authenticated wallet routes.
 *
 * @param dependencies - Application dependencies
 * @returns An Express router mounted at /wallet
 */
export function createWalletRouter(
  dependencies: Pick<AppDependencies, 'paymentProvider' | 'walletService'>,
): Router {
  const router = Router();

  router.get('/balance', async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('Authenticated user missing from request');
    }

    const balance = await dependencies.walletService.getBalance(userId);
    res.json(balance);
  });

  /**
   * WalletService ConflictError is retryable and the caller is responsible
   * for the retry loop. This route centralizes that guidance via withRetry.
   */
  router.post('/deposit', withRetry(async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('Authenticated user missing from request');
    }

    const body = parseWithSchema(depositBodySchema, req.body);
    const depositResult = await dependencies.paymentProvider.processDeposit(
      userId,
      body.amountCents as Money,
    );

    res.json(depositResult);
  }));

  router.get('/transactions', async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('Authenticated user missing from request');
    }

    const query = parseWithSchema(transactionHistoryQuerySchema, req.query);
    const transactions = await dependencies.walletService.getTransactionHistory(
      userId,
      {
        offset: query.offset,
        limit: query.limit,
      },
    );

    res.json(transactions);
  });

  return router;
}
