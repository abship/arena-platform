import { ValidationError } from '@arena/shared';

/**
 * Create a route-level invalid-state error while staying within the shared
 * error set currently exported by the monorepo.
 *
 * @param message - User-facing error message
 * @param context - Structured error context
 * @returns A ValidationError tagged as InvalidStateError for HTTP mapping
 */
export function createInvalidStateError(
  message: string,
  context?: Record<string, unknown>,
): ValidationError {
  const error = new ValidationError(message, context);
  error.name = 'InvalidStateError';
  return error;
}

/**
 * Check whether an unknown error should be treated as an invalid-state error.
 *
 * @param error - The thrown value
 * @returns True when the error is tagged as InvalidStateError
 */
export function isInvalidStateError(error: unknown): error is ValidationError {
  return error instanceof ValidationError && error.name === 'InvalidStateError';
}
