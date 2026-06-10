import 'dotenv/config';
import Redis from 'ioredis';
import { createApp } from './app';
import { RateLimiter, RateLimiterConfig } from './algorithms/rate-limiter.interface';
import { RedisTokenBucket } from './algorithms/redis-token-bucket';
import { SlidingWindowLog } from './algorithms/sliding-window';
import { RedisStore } from './storage/redis.store';
import { logger } from './logger';

const PORT = Number(process.env.PORT ?? 3000);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const ALGORITHM = process.env.RATE_LIMIT_ALGORITHM ?? 'token-bucket';
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 10);
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);

function buildLimiter(redis: Redis, config: RateLimiterConfig): RateLimiter {
  switch (ALGORITHM) {
    case 'sliding-window':
      // Sliding window log runs over the generic Store; sorted-set ops are
      // already atomic enough per-command for this prototype's needs.
      return new SlidingWindowLog(config, new RedisStore(redis));
    case 'token-bucket':
      // Token bucket needs the Lua path for an atomic refill+consume.
      return new RedisTokenBucket(config, redis);
    default:
      throw new Error(`Unknown RATE_LIMIT_ALGORITHM: ${ALGORITHM}`);
  }
}

const redis = new Redis(REDIS_URL);
const limiter = buildLimiter(redis, { maxRequests: MAX_REQUESTS, windowMs: WINDOW_MS });
const app = createApp(limiter, MAX_REQUESTS);

app.listen(PORT, () => {
  logger.info(`rate-limiter listening on port ${PORT} (algorithm: ${ALGORITHM})`);
});
