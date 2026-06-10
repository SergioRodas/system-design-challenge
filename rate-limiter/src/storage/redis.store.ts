import Redis from 'ioredis';
import { Store } from './store.interface';

/**
 * Generic ioredis-backed implementation of the Store interface.
 *
 * This is a thin adapter — it maps each Store method onto the equivalent Redis
 * command and nothing more. The atomic token-bucket logic does NOT live here;
 * it lives in RedisTokenBucket, which owns its Lua script. Keeping this adapter
 * free of algorithm-specific code is what lets the same Store interface back
 * both the in-memory and Redis paths.
 */
export class RedisStore implements Store {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs !== undefined) {
      await this.redis.set(key, value, 'PX', ttlMs);
    } else {
      await this.redis.set(key, value);
    }
  }

  async increment(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, ttlMs: number): Promise<void> {
    // PEXPIRE takes milliseconds; Redis floors to ms precision.
    await this.redis.pexpire(key, ttlMs);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.redis.zadd(key, score, member);
  }

  async zrangeByScore(key: string, min: number, max: number): Promise<string[]> {
    return this.redis.zrangebyscore(key, min, max);
  }

  async zremRangeByScore(key: string, min: number, max: number): Promise<void> {
    await this.redis.zremrangebyscore(key, min, max);
  }

  async zcard(key: string): Promise<number> {
    return this.redis.zcard(key);
  }
}
