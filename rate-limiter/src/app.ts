import express, { Express, Request, Response, NextFunction } from 'express';
import { RateLimiter } from './algorithms/rate-limiter.interface';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { createRoutes } from './routes';
import { logger } from './logger';

/**
 * Assembles the Express app. The RateLimiter is injected so callers decide the
 * backing implementation (Redis for the running server, in-memory for tests).
 * No app.listen here — that belongs to server.ts.
 */
export function createApp(limiter: RateLimiter, limit: number): Express {
  const app = express();

  app.use(express.json());

  const rateLimit = rateLimitMiddleware(limiter, limit);
  app.use(createRoutes(rateLimit));

  // Centralised error handler so storage failures surface as 500s, not hangs.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(`request failed: ${err.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
}
