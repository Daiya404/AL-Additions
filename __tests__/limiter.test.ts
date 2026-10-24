import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../src/utils/limiter';
import { store } from '../src/utils/helpers';

describe('RateLimiter: Construction & Configuration', () => {
  it('clamps rate between min and max options', () => {
    const under = new RateLimiter({ rate: 0.5, min: 2, max: 10 });
    expect(under.rate).toBe(2);

    const over = new RateLimiter({ rate: 50, min: 2, max: 10 });
    expect(over.rate).toBe(10);

    const normal = new RateLimiter({ rate: 5, min: 2, max: 10 });
    expect(normal.rate).toBe(5);
  });

  it('applies default parameters when omitted', () => {
    const limiter = new RateLimiter({ rate: 30 });
    expect(limiter.min).toBe(1);
    expect(limiter.max).toBe(30);
    expect(limiter.burst).toBe(1);
    expect(limiter.adaptive).toBe(false);
    expect(limiter.jitter).toBe(false);
    expect(limiter.persistKey).toBeNull();
    expect(limiter.tokens).toBe(1);
  });

  it('clamps manual rate updates within bounds', () => {
    const limiter = new RateLimiter({ rate: 10, min: 5, max: 20 });
    limiter.setRate(15);
    expect(limiter.rate).toBe(15);

    limiter.setRate(2);
    expect(limiter.rate).toBe(5);

    limiter.setRate(99);
    expect(limiter.rate).toBe(20);
  });
});

describe('RateLimiter: Token Consumption & Acquisition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows immediate consumption up to the burst limit', async () => {
    const limiter = new RateLimiter({ rate: 60, burst: 3 });

    await expect(limiter.acquire()).resolves.toBeUndefined();
    await expect(limiter.acquire()).resolves.toBeUndefined();
    await expect(limiter.acquire()).resolves.toBeUndefined();

    let acquired = false;
    limiter.acquire().then(() => {
      acquired = true;
    });

    expect(acquired).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(acquired).toBe(true);
  });

  it('executes queued requests in FIFO sequence', async () => {
    const limiter = new RateLimiter({ rate: 60, burst: 1 });
    const order: number[] = [];

    await limiter.acquire();

    limiter.acquire().then(() => order.push(1));
    limiter.acquire().then(() => order.push(2));
    limiter.acquire().then(() => order.push(3));

    expect(order).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual([1]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual([1, 2, 3]);
  });

  it('handles check callback errors and continues queue processing', async () => {
    const limiter = new RateLimiter({ rate: 60, burst: 1 });

    const failed = limiter.acquire(() => {
      throw new Error('Request cancelled');
    });

    await expect(failed).rejects.toThrow('Request cancelled');

    const next = limiter.acquire();
    await expect(next).resolves.toBeUndefined();
  });
});

describe('RateLimiter: Adaptive Scaling', () => {
  it('does not alter rate on success or limit when adaptive is false', () => {
    const limiter = new RateLimiter({ rate: 10, min: 2, max: 20, adaptive: false });

    for (let i = 0; i < 30; i++) limiter.success();
    expect(limiter.rate).toBe(10);

    limiter.limit(1000);
    expect(limiter.rate).toBe(10);
  });

  it('halves rate on limit down to min when adaptive is true', () => {
    const limiter = new RateLimiter({ rate: 20, min: 5, max: 40, adaptive: true });

    limiter.limit(1000);
    expect(limiter.rate).toBe(10);

    limiter.limit(1000);
    expect(limiter.rate).toBe(5);

    limiter.limit(1000);
    expect(limiter.rate).toBe(5);
  });

  it('increases rate after 25 consecutive successes up to max', () => {
    const limiter = new RateLimiter({ rate: 10, min: 2, max: 15, adaptive: true });

    for (let i = 0; i < 24; i++) limiter.success();
    expect(limiter.rate).toBe(10);

    limiter.success();
    expect(limiter.rate).toBe(11);
    expect(limiter.okStreak).toBe(0);

    limiter.setRate(15);
    for (let i = 0; i < 25; i++) limiter.success();
    expect(limiter.rate).toBe(15);
  });

  it('resets okStreak when limit is encountered', () => {
    const limiter = new RateLimiter({ rate: 10, adaptive: true });

    for (let i = 0; i < 20; i++) limiter.success();
    expect(limiter.okStreak).toBe(20);

    limiter.limit(500);
    expect(limiter.okStreak).toBe(0);
  });
});

describe('RateLimiter: Cooldowns & Coordinated Cooldown State', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    store.del('test_limiter_key');
  });

  afterEach(() => {
    vi.useRealTimers();
    store.del('test_limiter_key');
  });

  it('delays token acquisition until cooldown expires', async () => {
    const limiter = new RateLimiter({ rate: 60, burst: 1 });

    limiter.limit(2000);
    expect(limiter.resumeAt).toBeGreaterThan(Date.now());

    let acquired = false;
    limiter.acquire().then(() => {
      acquired = true;
    });

    await vi.advanceTimersByTimeAsync(1500);
    expect(acquired).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);
    expect(acquired).toBe(true);
  });

  it('applies jitter range within expected bounds', () => {
    const limiter = new RateLimiter({ rate: 60, jitter: true });
    const now = Date.now();

    limiter.limit(10000);

    expect(limiter.until).toBeGreaterThanOrEqual(now + 9000);
    expect(limiter.until).toBeLessThanOrEqual(now + 12000);
  });

  it('persists and respects stored cooldown timestamps', () => {
    const key = 'test_limiter_key';
    const limiter = new RateLimiter({ rate: 60, persistKey: key });

    limiter.limit(5000);
    expect(store.get(key)).toBe(limiter.until);

    const futureTime = Date.now() + 10000;
    store.set(key, futureTime);

    expect(limiter.resumeAt).toBe(futureTime);
  });

  it('ignores zero or negative limit intervals', () => {
    const limiter = new RateLimiter({ rate: 10 });
    limiter.limit(0);
    expect(limiter.until).toBe(0);

    limiter.limit(-500);
    expect(limiter.until).toBe(0);
  });
});