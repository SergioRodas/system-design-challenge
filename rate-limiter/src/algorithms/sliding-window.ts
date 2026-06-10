import { RateLimiter, RateLimitResult, RateLimiterConfig } from './rate-limiter.interface';
import { Store } from '../storage/store.interface';

export class SlidingWindowLog implements RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly store: Store;
  private readonly now: () => number;

  constructor(config: RateLimiterConfig, store: Store, now: () => number = () => Date.now()) {
    this.config = config;
    this.store = store;
    this.now = now;
  }

  async consume(key: string): Promise<RateLimitResult> {
    const { maxRequests, windowMs } = this.config;
    const currentTime = this.now();
    const windowStart = currentTime - windowMs;
    const resetAt = Math.ceil((currentTime + windowMs) / 1000);

    // Remove timestamps that are outside the current window
    await this.store.zremRangeByScore(key, 0, windowStart);

    const count = await this.store.zcard(key);

    if (count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    // Use currentTime as score; member must be unique per request
    // Append count to timestamp to avoid collisions within the same ms
    const member = `${currentTime}-${count}`;
    await this.store.zadd(key, currentTime, member);

    return {
      allowed: true,
      remaining: maxRequests - count - 1,
      resetAt,
    };
  }
}
