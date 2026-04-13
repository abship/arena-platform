import { z } from 'zod';

/** Request body schema for POST /kyc/verify. */
export const verifyBodySchema = z.object({
  documents: z.record(z.string(), z.string()),
});
