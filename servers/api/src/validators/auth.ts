import { z } from 'zod';

const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());

/** Request body schema for POST /auth/register. */
export const registerBodySchema = z.object({
  email: emailSchema,
  username: z.string().trim().min(3).max(30),
  password: z.string().min(8),
});

/** Request body schema for POST /auth/login. */
export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
