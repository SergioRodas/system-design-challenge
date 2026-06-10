import { SlidingWindowLog } from '../../src/algorithms/sliding-window';
import { MemoryStore } from '../../src/storage/memory.store';

const BASE_TIME = 1_000_000;

function setup(maxRequests = 5, windowMs = 60_000) {
  let currentTime = BASE_TIME;
  const now = () => currentTime;
  const store = new MemoryStore(now);
  const limiter = new SlidingWindowLog({ maxRequests, windowMs }, store, now);
  const advance = (ms: number) => { currentTime += ms; };
  return { limiter, advance };
}

describe('SlidingWindowLog', () => {
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

  it('rejects when the window is full', async () => {
    const { limiter } = setup(2);

    await limiter.consume('user:1');
    await limiter.consume('user:1');
    const rejected = await limiter.consume('user:1');

    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
  });

  it('allows a burst up to maxRequests', async () => {
    const { limiter } = setup(5);
    for (let i = 0; i < 5; i++) {
      const r = await limiter.consume('user:burst');
      expect(r.allowed).toBe(true);
    }
    const overflow = await limiter.consume('user:burst');
    expect(overflow.allowed).toBe(false);
  });

  it('allows new requests after old ones slide out of the window', async () => {
    const { limiter, advance } = setup(3, 10_000);

    await limiter.consume('user:1');
    await limiter.consume('user:1');
    await limiter.consume('user:1');
    const full = await limiter.consume('user:1');
    expect(full.allowed).toBe(false);

    // Advance past the window — all previous timestamps are now outside
    advance(10_001);
    const r = await limiter.consume('user:1');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('only slides out timestamps older than the window', async () => {
    const { limiter, advance } = setup(3, 10_000);

    await limiter.consume('user:1'); // t=1_000_000
    advance(8_000);                  // t=1_008_000
    await limiter.consume('user:1'); // t=1_008_000
    advance(3_000);                  // t=1_011_000 — first request is now 11s ago, outside window

    // Window is [1_001_000, 1_011_000]: only the second request is inside
    const r = await limiter.consume('user:1');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
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
    const limiter = new SlidingWindowLog({ maxRequests: 5, windowMs: 60_000 }, store, now);

    const result = await limiter.consume('user:1');
    expect(result.resetAt).toBeGreaterThan(Math.floor(currentTime / 1000));
  });
});
