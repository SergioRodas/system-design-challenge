import { TokenBucket } from '../../src/algorithms/token-bucket';
import { MemoryStore } from '../../src/storage/memory.store';

const BASE_TIME = 1_000_000;

function setup(maxRequests = 5, windowMs = 60_000) {
  let currentTime = BASE_TIME;
  const now = () => currentTime;
  const store = new MemoryStore(now);
  const limiter = new TokenBucket({ maxRequests, windowMs }, store, now);
  const advance = (ms: number) => { currentTime += ms; };
  return { limiter, advance };
}

describe('TokenBucket', () => {
  it('allows requests up to the limit', async () => {
    const { limiter } = setup(3);

    const r1 = await limiter.consume('user:1');
    const r2 = await limiter.consume('user:1');
    const r3 = await limiter.consume('user:1');

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('rejects when bucket is empty', async () => {
    const { limiter } = setup(2);

    await limiter.consume('user:1');
    await limiter.consume('user:1');
    const rejected = await limiter.consume('user:1');

    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
  });

  it('allows a burst up to maxRequests without delay', async () => {
    const { limiter } = setup(5);
    for (let i = 0; i < 5; i++) {
      const r = await limiter.consume('user:burst');
      expect(r.allowed).toBe(true);
    }
    const overflow = await limiter.consume('user:burst');
    expect(overflow.allowed).toBe(false);
  });

  it('refills tokens proportionally after time passes', async () => {
    const { limiter, advance } = setup(10, 10_000); // 10 req / 10s = 1 token/s

    for (let i = 0; i < 10; i++) await limiter.consume('user:1');
    const empty = await limiter.consume('user:1');
    expect(empty.allowed).toBe(false);

    // Advance 5 seconds — should refill 5 tokens
    advance(5_000);
    const after = await limiter.consume('user:1');
    // tokens after refill = min(10, 0 + 5) = 5, consume 1 → floor(4) = 4
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(4);
  });

  it('does not exceed maxRequests after a full window refill', async () => {
    const { limiter, advance } = setup(3, 1_000);

    await limiter.consume('user:1');
    advance(5_000); // way more than one window
    const r = await limiter.consume('user:1');

    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2); // capped at max 3, then -1
  });

  it('isolates different keys', async () => {
    const { limiter } = setup(1);

    const a = await limiter.consume('user:A');
    const b = await limiter.consume('user:B');

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it('returns a resetAt value in the future', async () => {
    let currentTime = BASE_TIME;
    const now = () => currentTime;
    const store = new MemoryStore(now);
    const limiter = new TokenBucket({ maxRequests: 5, windowMs: 60_000 }, store, now);

    const result = await limiter.consume('user:1');
    expect(result.resetAt).toBeGreaterThan(Math.floor(currentTime / 1000));
  });
});
