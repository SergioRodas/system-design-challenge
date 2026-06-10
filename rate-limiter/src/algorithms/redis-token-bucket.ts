import Redis from 'ioredis';
import { RateLimiter, RateLimitResult, RateLimiterConfig } from './rate-limiter.interface';

/**
 * Distributed Token Bucket backed by Redis.
 *
 * Unlike the in-memory TokenBucket (which does read-modify-write in JS and is
 * therefore only safe on a single process), this class pushes the entire
 * refill-and-consume step into a Lua script. Redis runs each EVAL atomically,
 * so two concurrent requests can never both read "1 token left" and both
 * consume it — the classic race that would let 2 requests through a limit of 1.
 *
 * Bucket state is stored in a Redis hash per key:
 *   tokens     -> current token count (fractional, refilled over time)
 *   lastRefill -> ms timestamp of the last refill
 *
 * The script receives the wall-clock time as an argument rather than calling
 * Redis's TIME, so behaviour is deterministic and testable, and so all logic
 * stays inside the single atomic EVAL.
 */
const CONSUME_SCRIPT = `
local key        = KEYS[1]
local maxTokens  = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])  -- tokens per ms
local windowMs   = tonumber(ARGV[3])
local now        = tonumber(ARGV[4])

-- Load the current bucket state. Both fields come back nil for a brand-new key.
local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then
  -- First request: bucket starts full.
  tokens = maxTokens
  lastRefill = now
else
  -- Lazy refill: credit tokens for the time elapsed since the last call, capped at maxTokens.
  -- Refilling on read means we never need a background timer to top buckets up.
  local elapsed = now - lastRefill
  tokens = math.min(maxTokens, tokens + elapsed * refillRate)
  lastRefill = now
end

-- Consume a token only if one is available. This check-and-decrement runs inside the
-- single atomic EVAL, so two concurrent requests can't both see the last token.
local allowed = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
end

-- Persist the new state and slide the TTL forward so idle buckets self-expire (no cleanup job).
redis.call('HSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
redis.call('PEXPIRE', key, windowMs)

-- Return allowed flag and the floored remaining count.
return { allowed, math.floor(tokens) }
`;

export class RedisTokenBucket implements RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly redis: Redis;
  private readonly now: () => number;

  constructor(config: RateLimiterConfig, redis: Redis, now: () => number = () => Date.now()) {
    this.config = config;
    this.redis = redis;
    this.now = now;
  }

  async consume(key: string): Promise<RateLimitResult> {
    const { maxRequests, windowMs } = this.config;
    const currentTime = this.now();
    const refillRate = maxRequests / windowMs;

    const result = (await this.redis.eval(
      CONSUME_SCRIPT,
      1,
      key,
      maxRequests,
      refillRate,
      windowMs,
      currentTime,
    )) as [number, number];

    const [allowed, remaining] = result;
    const resetAt = Math.ceil((currentTime + windowMs) / 1000);

    return {
      allowed: allowed === 1,
      remaining,
      resetAt,
    };
  }
}
