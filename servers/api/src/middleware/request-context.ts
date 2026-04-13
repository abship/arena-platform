import type { NextFunction, Request, Response } from 'express';
import { ValidationError } from '@arena/shared';

/** Optional GPS coordinates passed by the client. */
export interface GpsCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** Request-scoped metadata extracted once for downstream route handlers. */
export interface RequestContext {
  readonly ipAddress: string;
  readonly gpsCoordinates?: GpsCoordinates;
}

function parseHeaderNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN;
}

/**
 * Attach per-request metadata used by downstream handlers.
 *
 * @param req - Express request
 * @param _res - Express response
 * @param next - Express next function
 */
export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const latitude = parseHeaderNumber(req.header('x-gps-latitude'));
  const longitude = parseHeaderNumber(req.header('x-gps-longitude'));

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    next(new ValidationError('GPS headers must be valid numbers', {
      reason: 'invalid_gps_headers',
    }));
    return;
  }

  if ((latitude === null) !== (longitude === null)) {
    next(new ValidationError('GPS headers must include both latitude and longitude', {
      reason: 'partial_gps_headers',
    }));
    return;
  }

  req.requestContext = {
    ipAddress: req.ip ?? '127.0.0.1',
    gpsCoordinates:
      latitude !== null && longitude !== null
        ? { latitude, longitude }
        : undefined,
  };

  next();
}
