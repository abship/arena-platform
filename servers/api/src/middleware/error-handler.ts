import type { NextFunction, Request, Response } from 'express';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@arena/shared';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { isInvalidStateError } from '../lib/errors.js';

interface ErrorBody {
  readonly error: string;
  readonly message?: string;
  readonly context?: Record<string, unknown>;
}

function sanitizeContextValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeContextValue(entry));
  }

  if (value && typeof value === 'object') {
    const sanitizedContext: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (/password|token|authorization/i.test(key)) {
        continue;
      }

      sanitizedContext[key] = sanitizeContextValue(nestedValue);
    }

    return sanitizedContext;
  }

  return value;
}

function sanitizeContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  return sanitizeContextValue(context) as Record<string, unknown>;
}

function writeError(
  res: Response,
  statusCode: number,
  body: ErrorBody,
  retryAfterSeconds?: number,
): void {
  if (retryAfterSeconds !== undefined) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }

  res.status(statusCode).json(body);
}

/**
 * Final Express error middleware for mapping typed service errors to API responses.
 *
 * @param error - The thrown value
 * @param req - Express request
 * @param res - Express response
 * @param _next - Unused next function
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const context = error instanceof AppError ? sanitizeContext(error.context) : undefined;

  console.error(JSON.stringify({
    action: `${req.method} ${req.originalUrl}`,
    userId: req.user?.userId,
    message: error instanceof Error ? error.message : String(error),
    context,
    stack: error instanceof Error ? error.stack : undefined,
  }));

  if (error instanceof JsonWebTokenError || error instanceof TokenExpiredError) {
    writeError(res, 401, { error: 'UNAUTHORIZED' });
    return;
  }

  if (isInvalidStateError(error)) {
    writeError(res, 409, {
      error: 'INVALID_STATE',
      message: error.message,
      context,
    });
    return;
  }

  if (error instanceof ConflictError) {
    writeError(res, 409, {
      error: 'CONFLICT',
      message: error.message,
      context,
    }, 1);
    return;
  }

  if (error instanceof NotFoundError) {
    writeError(res, 404, {
      error: 'NOT_FOUND',
      message: error.message,
      context,
    });
    return;
  }

  if (error instanceof ValidationError) {
    writeError(res, 400, {
      error: 'VALIDATION_ERROR',
      message: error.message,
      context,
    });
    return;
  }

  writeError(res, 500, { error: 'INTERNAL_ERROR' });
}
