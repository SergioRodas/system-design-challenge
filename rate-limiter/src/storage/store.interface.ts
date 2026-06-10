export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  increment(key: string): Promise<number>;
  expire(key: string, ttlMs: number): Promise<void>;
  // Returns all members with scores within [min, max] from a sorted set
  zrangeByScore(key: string, min: number, max: number): Promise<string[]>;
  // Adds a member with a score to a sorted set
  zadd(key: string, score: number, member: string): Promise<void>;
  // Removes members with scores within [min, max] from a sorted set
  zremRangeByScore(key: string, min: number, max: number): Promise<void>;
  // Returns the number of members in a sorted set
  zcard(key: string): Promise<number>;
}
