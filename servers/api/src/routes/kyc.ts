import { Router } from 'express';
import type { AppDependencies } from '../types/app-dependencies.js';
import { verifyBodySchema } from '../validators/kyc.js';
import { parseWithSchema } from '../validators/parse.js';

/**
 * Create authenticated KYC routes.
 *
 * @param dependencies - Application dependencies
 * @returns An Express router mounted at /kyc
 */
export function createKYCRouter(
  dependencies: Pick<AppDependencies, 'kycService'>,
): Router {
  const router = Router();

  /**
   * When Jumio ships, this synchronous fake-provider path will need to switch
   * to a webhook-driven pending flow instead of returning an immediate decision.
   */
  router.post('/verify', async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('Authenticated user missing from request');
    }

    const body = parseWithSchema(verifyBodySchema, req.body);
    const verificationResult = await dependencies.kycService.verifyIdentity(
      userId,
      body.documents,
    );

    res.json(verificationResult);
  });

  router.get('/status', async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Error('Authenticated user missing from request');
    }

    const level = await dependencies.kycService.getVerificationLevel(userId);
    res.json({ level });
  });

  return router;
}
