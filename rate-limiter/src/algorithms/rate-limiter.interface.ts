export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp (seconds)
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
}

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}
