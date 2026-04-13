import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/auth.js';

/**
 * Require a valid Bearer token and attach the authenticated user to the request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  try {
    req.user = { userId: verifyToken(token) };
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}
