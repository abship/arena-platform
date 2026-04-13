import { Router } from 'express';
import { parseWithSchema } from '../validators/parse.js';
import {
  kycWebhookParamsSchema,
  paymentWebhookParamsSchema,
} from '../validators/webhooks.js';

/**
 * Create future-facing webhook stub routes for payment and KYC providers.
 *
 * @returns An Express router mounted at /webhooks
 */
export function createWebhooksRouter(): Router {
  const router = Router();

  router.post('/payments/:provider', (req, res) => {
    const params = parseWithSchema(paymentWebhookParamsSchema, req.params);
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      message: `Payment webhook for provider "${params.provider}" is not implemented`,
    });
  });

  router.post('/kyc/:provider', (req, res) => {
    const params = parseWithSchema(kycWebhookParamsSchema, req.params);
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      message: `KYC webhook for provider "${params.provider}" is not implemented`,
    });
  });

  return router;
}
