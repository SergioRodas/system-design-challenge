import Redis from 'ioredis';
import request from 'supertest';
import { createApp } from '../../src/app';
import { RedisTokenBucket } from '../../src/algorithms/redis-token-bucket';
import { RedisStore } from '../../src/storage/redis.store';
import { SlidingWindowLog } from '../../src/algorithms/sliding-window';

/**
 * Redis-backed integration tests. These require a real Redis (docker-compose up -d)
 * and are SKIPPED automatically when Redis is unreachable, so the suite is safe to
 * run in CI without Docker. Unlike the in-memory api.test.ts, this is the only place
 * the Lua script in RedisTokenBucket actually executes.
 */
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const LIMIT = 3;
const WINDOW_MS = 60_000;

// A unique prefix per run so leftover keys from a previous run never bleed in.
const KEY_PREFIX = `test:rl:${process.pid}:`;

let redis: Redis;
let redisAvailable = false;

beforeAll(async () => {
  redis = new Redis(REDIS_URL, {
    lazyConnect: true, // don't connect until we explicitly ask
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: 1000,
    retryStrategy: () => null, // never retry — fail fast if Redis is down
  });
  // Swallow async 'error' events so a down Redis doesn't print noise or crash.
  redis.on('error', () => undefined);
  try {
    await redis.connect();
    await redis.ping();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
    // quit() (vs disconnect()) closes the socket AND clears ioredis's internal
    // reconnect timer, so the Jest worker can exit cleanly with no leaked handle.
    await redis.quit().catch(() => undefined);
  }
});

afterAll(async () => {
  if (redis && redisAvailable) {
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit().catch(() => undefined);
  }
});

// Guard wrapper: marks a test as skipped (not failed) when Redis is absent.
function itRedis(name: string, fn: () => Promise<void>): void {
  it(name, async () => {
    if (!redisAvailable) {
      console.warn(`[skip] Redis not available at ${REDIS_URL} — skipping "${name}"`);
      return;
    }
    await fn();
  });
}

describe('RedisTokenBucket (Lua atomic consume)', () => {
  itRedis('allows requests under the limit, then rejects when empty', async () => {
    const limiter = new RedisTokenBucket({ maxRequests: LIMIT, windowMs: WINDOW_MS }, redis);
    const key = `${KEY_PREFIX}under-limit`;

    // Exercise the limiter directly with an explicit key — this drives the Lua
    // script straight, without depending on how supertest reports the client IP.
    const r1 = await limiter.consume(key);
    const r2 = await limiter.consume(key);
    const r3 = await limiter.consume(key);
    const r4 = await limiter.consume(key);

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(LIMIT - 1);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  itRedis('serves rate-limit headers and a 429 over HTTP', async () => {
    const limiter = new RedisTokenBucket({ maxRequests: LIMIT, windowMs: WINDOW_MS }, redis);
    const app = createApp(limiter, LIMIT);

    // All supertest requests share the same loopback IP, so they hit one bucket.
    let last = await request(app).get('/api/data');
    for (let i = 0; i < LIMIT - 1; i++) {
      expect(last.status).toBe(200);
      last = await request(app).get('/api/data');
    }
    expect(last.status).toBe(200);

    const rejected = await request(app).get('/api/data');
    expect(rejected.status).toBe(429);
    expect(rejected.headers['x-ratelimit-limit']).toBe(String(LIMIT));
    expect(rejected.headers['x-ratelimit-remaining']).toBe('0');
    expect(rejected.headers['retry-after']).toBeDefined();
  });

  itRedis('refills tokens after time passes (injected clock)', async () => {
    let clock = 5_000_000;
    const now = (): number => clock;
    const limiter = new RedisTokenBucket(
      { maxRequests: LIMIT, windowMs: 3_000 }, // 3 tokens / 3s = 1 token/s
      redis,
      now,
    );
    const key = `${KEY_PREFIX}refill`;

    for (let i = 0; i < LIMIT; i++) await limiter.consume(key);
    const empty = await limiter.consume(key);
    expect(empty.allowed).toBe(false);

    clock += 2_000; // 2 seconds → ~2 tokens refilled
    const after = await limiter.consume(key);
    expect(after.allowed).toBe(true);
  });
});

describe('SlidingWindowLog over RedisStore', () => {
  itRedis('rejects once the window is full', async () => {
    const store = new RedisStore(redis);
    const limiter = new SlidingWindowLog({ maxRequests: LIMIT, windowMs: WINDOW_MS }, store);
    const key = `${KEY_PREFIX}sliding`;

    for (let i = 0; i < LIMIT; i++) {
      const r = await limiter.consume(key);
      expect(r.allowed).toBe(true);
    }
    const rejected = await limiter.consume(key);
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
  });
});
