import { Store } from './store.interface';

interface Entry {
  value: string;
  expiresAt: number | null; // ms timestamp, null = no expiry
}

interface SortedSetEntry {
  score: number;
  member: string;
}

export class MemoryStore implements Store {
  private readonly store = new Map<string, Entry>();
  private readonly sortedSets = new Map<string, SortedSetEntry[]>();

  // Injected so tests can control time without real timers
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && this.now() > entry.expiresAt;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs !== undefined ? this.now() + ttlMs : null,
    });
  }

  async increment(key: string): Promise<number> {
    const entry = this.store.get(key);
    const expired = !entry || this.isExpired(entry);
    const current = expired ? 0 : parseInt(entry.value, 10);
    const next = current + 1;
    this.store.set(key, {
      value: String(next),
      expiresAt: expired ? null : (entry?.expiresAt ?? null),
    });
    return next;
  }

  async expire(key: string, ttlMs: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry && !this.isExpired(entry)) {
      entry.expiresAt = this.now() + ttlMs;
    }
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    const set = this.sortedSets.get(key) ?? [];
    const idx = set.findIndex((e) => e.member === member);
    if (idx !== -1) {
      set[idx].score = score;
    } else {
      set.push({ score, member });
    }
    this.sortedSets.set(key, set);
  }

  async zrangeByScore(key: string, min: number, max: number): Promise<string[]> {
    const set = this.sortedSets.get(key) ?? [];
    return set
      .filter((e) => e.score >= min && e.score <= max)
      .sort((a, b) => a.score - b.score)
      .map((e) => e.member);
  }

  async zremRangeByScore(key: string, min: number, max: number): Promise<void> {
    const set = this.sortedSets.get(key) ?? [];
    this.sortedSets.set(
      key,
      set.filter((e) => e.score < min || e.score > max),
    );
  }

  async zcard(key: string): Promise<number> {
    return (this.sortedSets.get(key) ?? []).length;
  }
}
