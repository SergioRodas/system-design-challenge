import { RateLimiter, RateLimitResult, RateLimiterConfig } from './rate-limiter.interface';
import { Store } from '../storage/store.interface';

interface BucketState {
  tokens: number;
  lastRefill: number; // ms timestamp
}

export class TokenBucket implements RateLimiter {
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
    const refillRate = maxRequests / windowMs; // tokens per ms

    const raw = await this.store.get(key);
    let state: BucketState;

    if (raw === null) {
      // First request: bucket starts full, consume one immediately
      state = { tokens: maxRequests, lastRefill: currentTime };
    } else {
      state = JSON.parse(raw) as BucketState;
      const elapsed = currentTime - state.lastRefill;
      const refilled = elapsed * refillRate;
      state.tokens = Math.min(maxRequests, state.tokens + refilled);
      state.lastRefill = currentTime;
    }

    const resetAt = Math.ceil((currentTime + windowMs) / 1000);

    if (state.tokens < 1) {
      await this.store.set(key, JSON.stringify(state), windowMs);
      return { allowed: false, remaining: 0, resetAt };
    }

    state.tokens -= 1;
    await this.store.set(key, JSON.stringify(state), windowMs);

    return {
      allowed: true,
      remaining: Math.floor(state.tokens),
      resetAt,
    };
  }
}
