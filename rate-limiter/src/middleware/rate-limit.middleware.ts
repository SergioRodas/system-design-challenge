import { Request, Response, NextFunction, RequestHandler } from 'express';
import { RateLimiter } from '../algorithms/rate-limiter.interface';

export interface RateLimitOptions {
  // How to derive the bucket key from a request. Defaults to the client IP.
  keyGenerator?: (req: Request) => string;
}

function defaultKey(req: Request): string {
  // req.ip respects trust proxy settings; fall back to the socket address.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function rateLimitMiddleware(
  limiter: RateLimiter,
  limit: number,
  options: RateLimitOptions = {},
): RequestHandler {
  const keyGenerator = options.keyGenerator ?? defaultKey;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator(req);
      const result = await limiter.consume(key);

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.resetAt);

      if (!result.allowed) {
        // resetAt is in seconds; Retry-After is seconds from now, never negative.
        const retryAfter = Math.max(0, result.resetAt - Math.ceil(Date.now() / 1000));
        res.setHeader('Retry-After', retryAfter);
        res.status(429).json({ error: 'Too Many Requests' });
        return;
      }

      next();
    } catch (err) {
      // Never let a limiter/storage failure swallow the request silently.
      next(err);
    }
  };
}
