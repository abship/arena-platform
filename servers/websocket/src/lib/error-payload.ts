import { AppError } from '@arena/shared';
import type { GatewayActionFailure, GatewayErrorPayload } from '../types.js';

const INTERNAL_ERROR = 'INTERNAL_ERROR';

/**
 * Convert an unknown error into a socket-safe payload.
 *
 * @param error - The caught error
 * @returns A normalized error payload for server-to-client events
 */
export function toGatewayErrorPayload(error: unknown): GatewayErrorPayload {
  if (error instanceof AppError) {
    return {
      error: error.code,
      message: error.message,
      context: error.context,
    };
  }

  if (error instanceof Error) {
    return {
      error: INTERNAL_ERROR,
      message: error.message,
    };
  }

  return {
    error: INTERNAL_ERROR,
    message: String(error),
  };
}

/**
 * Convert an unknown error into a join-match acknowledgement failure.
 *
 * @param error - The caught error
 * @returns A normalized negative acknowledgement
 */
export function toGatewayActionFailure(error: unknown): GatewayActionFailure {
  return {
    ok: false,
    ...toGatewayErrorPayload(error),
  };
}
