import { z } from 'zod';

const amountCentsSchema = z.number().int().positive().max(100_000_000);

/** Request body schema for POST /wallet/deposit. */
export const depositBodySchema = z.object({
  amountCents: amountCentsSchema,
});

/** Query schema for GET /wallet/transactions. */
export const transactionHistoryQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(0).max(100).default(20),
});
