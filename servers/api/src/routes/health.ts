import { Router } from 'express';

/**
 * Create public health-check routes.
 *
 * @returns An Express router mounted at /health
 */
export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
