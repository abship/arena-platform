import { ValidationError } from '@arena/shared';
import type { ZodType } from 'zod';

/**
 * Parse request input with Zod and raise a shared ValidationError on failure.
 *
 * @param schema - The Zod schema to parse with
 * @param input - The request input to validate
 * @returns The parsed input
 */
export function parseWithSchema<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError('Invalid request', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  return result.data;
}
