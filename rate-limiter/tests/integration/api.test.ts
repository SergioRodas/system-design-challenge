import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { TokenBucket } from '../../src/algorithms/token-bucket';
import { MemoryStore } from '../../src/storage/memory.store';

/**
 * These tests exercise the full Express stack (routing + middleware + headers)
 * using the in-memory limiter, so they need no Redis and no network. The Redis
 * path is covered separately (and requires docker-compose); the HTTP contract
 * is identical regardless of which Store backs the limiter.
 */
const LIMIT = 3;
const WINDOW_MS = 60_000;

function buildApp(): Express {
  // Fixed clock so token refill never interferes within a test run.
  const now = (): number => 1_000_000;
  const store = new MemoryStore(now);
  const limiter = new TokenBucket({ maxRequests: LIMIT, windowMs: WINDOW_MS }, store, now);
  return createApp(limiter, LIMIT);
}

describe('GET /ping (free endpoint)', () => {
  it('always responds 200 and is never rate limited', async () => {
    const app = buildApp();
    // Hit it more times than the limit; none should be rejected.
    for (let i = 0; i < LIMIT + 3; i++) {
      const res = await request(app).get('/ping');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'pong' });
      // Free endpoint should not carry rate-limit headers.
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    }
  });
});

describe('GET /api/data (rate limited)', () => {
  it('allows requests under the limit and sets correct headers', async () => {
    const app = buildApp();

    const first = await request(app).get('/api/data');
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ data: 'here is your data' });
    expect(first.headers['x-ratelimit-limit']).toBe(String(LIMIT));
    expect(first.headers['x-ratelimit-remaining']).toBe(String(LIMIT - 1));
    expect(first.headers['x-ratelimit-reset']).toBeDefined();

    const second = await request(app).get('/api/data');
    expect(second.status).toBe(200);
    expect(second.headers['x-ratelimit-remaining']).toBe(String(LIMIT - 2));
  });

  it('returns 429 with Retry-After once the limit is exceeded', async () => {
    const app = buildApp();

    // Exhaust the bucket.
    for (let i = 0; i < LIMIT; i++) {
      const res = await request(app).get('/api/data');
      expect(res.status).toBe(200);
    }

    // The next request must be rejected.
    const rejected = await request(app).get('/api/data');
    expect(rejected.status).toBe(429);
    expect(rejected.body).toEqual({ error: 'Too Many Requests' });
    expect(rejected.headers['x-ratelimit-remaining']).toBe('0');
    expect(rejected.headers['retry-after']).toBeDefined();
    expect(Number(rejected.headers['retry-after'])).toBeGreaterThanOrEqual(0);
  });

  it('keeps the X-RateLimit-Limit header stable across requests', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/data');
    expect(res.headers['x-ratelimit-limit']).toBe(String(LIMIT));
  });
});
