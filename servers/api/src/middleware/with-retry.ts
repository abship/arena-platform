import { setTimeout as sleep } from 'node:timers/promises';
import type { NextFunction, Request, Response } from 'express';
import { ConflictError } from '@arena/shared';

const RETRY_DELAYS_MS = [50, 100, 200] as const;

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Retry a route handler when the dependency layer raises retryable ConflictError.
 *
 * @param handler - The async route handler to wrap
 * @returns An Express-compatible route handler
 */
export function withRetry(handler: AsyncRouteHandler): AsyncRouteHandler {
  return async function retryingHandler(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    let attempt = 0;

    while (true) {
      try {
        await handler(req, res, next);
        return;
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt >= RETRY_DELAYS_MS.length) {
          throw error;
        }

        await sleep(RETRY_DELAYS_MS[attempt]);
        attempt += 1;
      }
    }
  };
}
