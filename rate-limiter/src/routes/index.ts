import { Router, RequestHandler, Request, Response } from 'express';

/**
 * Builds the application router.
 *
 * The rate-limit middleware is injected rather than imported so the app can be
 * wired with different limiters (Redis in production, in-memory in tests)
 * without the routes knowing which one is in play.
 */
export function createRoutes(rateLimit: RequestHandler): Router {
  const router = Router();

  // Free endpoint — no rate limiting, useful as a liveness check.
  router.get('/ping', (_req: Request, res: Response) => {
    res.json({ message: 'pong' });
  });

  // Rate-limited endpoint.
  router.get('/api/data', rateLimit, (_req: Request, res: Response) => {
    res.json({ data: 'here is your data' });
  });

  return router;
}
