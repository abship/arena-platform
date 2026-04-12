/**
 * Maps Prisma-specific errors to typed AppError subclasses.
 * Prevents raw Prisma errors from leaking to callers.
 *
 * @module
 */

import { Prisma } from '@arena/database';
import type { AppError } from '@arena/shared';
import { ConflictError, NotFoundError } from '@arena/shared';

/**
 * Attempt to map a Prisma error to an AppError.
 * Returns undefined if the error is not a recognized Prisma error.
 *
 * @param error - The caught error
 * @returns A mapped AppError, or undefined if not a known Prisma error
 */
export function mapPrismaError(error: unknown): AppError | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = error.meta?.['target'];
        return new ConflictError('Unique constraint violation', {
          constraint: target ?? 'unknown',
        });
      }
      case 'P2025':
        return new NotFoundError('Record not found');
      case 'P2034':
        return new ConflictError('Transaction serialization failure', {
          reason: 'serialization_failure',
        });
    }
  }
  return undefined;
}
