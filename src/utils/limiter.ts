import { safe, sleep, store } from './helpers';

export interface RateLimiterOptions {
  rate: number;
  min?: number;
  max?: number;
  burst?: number;
  adaptive?: boolean;
  jitter?: boolean;
  persistKey?: string | null;
}

export class RateLimiter {
  rate: number;
  min: number;
  max: number;
  burst: number;
  adaptive: boolean;
  jitter: boolean;
  persistKey: string | null;

  tokens: number;
  last: number;
  until: number;
  okStreak: number;
  queue: Promise<void>;

  constructor({ rate, min = 1, max = rate, burst = 1, adaptive = false, jitter = false, persistKey = null }: RateLimiterOptions) {
    this.min = min;
    this.max = max;
    this.burst = burst;
    this.adaptive = adaptive;
    this.jitter = jitter;
    this.persistKey = persistKey;

    this.rate = Math.min(max, Math.max(min, rate));
    this.tokens = burst;
    this.last = Date.now();
    this.until = 0;
    this.okStreak = 0;
    this.queue = Promise.resolve();
  }

  get resumeAt(): number {
    const stored = this.persistKey ? Number(store.get(this.persistKey, 0)) || 0 : 0;
    const at = Math.max(this.until, stored);
    return at > Date.now() ? at : 0;
  }

  setRate(n: number): void {
    this.rate = Math.min(this.max, Math.max(this.min, n));
  }

  acquire(check?: () => void): Promise<void> {
    const run = this.queue.then(() => this._take(check));
    this.queue = run.catch(() => {});
    return run;
  }

  private async _take(check?: () => void): Promise<void> {
    for (;;) {
      check?.();
      const now = Date.now();
      const resume = this.resumeAt;
      if (resume) {
        this.tokens = 0;
        this.last = resume;
        await sleep(Math.min(1000, resume - now));
        continue;
      }
      this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 60000) * this.rate);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await sleep(Math.max(15, ((1 - this.tokens) / this.rate) * 60000));
    }
  }

  success(): void {
    if (this.adaptive && ++this.okStreak >= 25 && this.rate < this.max) {
      this.setRate(this.rate + Math.max(1, Math.round(this.rate * 0.1)));
      this.okStreak = 0;
    }
  }

  limit(ms: number): void {
    this.okStreak = 0;
    this.tokens = 0;
    if (this.adaptive) this.setRate(Math.floor(this.rate / 2));
    if (!(ms > 0)) return;
    this.until = Math.max(this.until, Date.now() + ms * (this.jitter ? 0.9 + Math.random() * 0.3 : 1));
    if (this.persistKey) safe(() => store.set(this.persistKey!, this.until), 'persist cooldown');
  }
}