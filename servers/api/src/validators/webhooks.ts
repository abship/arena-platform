import { z } from 'zod';

/** Params schema for future payment webhook routes. */
export const paymentWebhookParamsSchema = z.object({
  provider: z.string().trim().min(1),
});

/** Params schema for future KYC webhook routes. */
export const kycWebhookParamsSchema = z.object({
  provider: z.string().trim().min(1),
});
