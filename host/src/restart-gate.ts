const BACKOFF_MS = [1000, 5000, 30000];
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 3;

export type GateDecision =
  | { allow: true; waitMs: 0 }
  | { allow: false; waitMs: number; reason?: 'rate_limit' };

export class RestartGate {
  private readonly nowFn: () => number;
  private attempts: number[] = [];

  constructor(opts: { now?: () => number } = {}) {
    this.nowFn = opts.now ?? Date.now;
  }

  shouldAttempt(): GateDecision {
    const now = this.nowFn();
    this.attempts = this.attempts.filter((t) => now - t < RATE_WINDOW_MS);

    if (this.attempts.length >= RATE_MAX) {
      return { allow: false, waitMs: 0, reason: 'rate_limit' };
    }

    const last = this.attempts.at(-1);
    if (last === undefined) return { allow: true, waitMs: 0 };

    const idx = Math.min(this.attempts.length - 1, BACKOFF_MS.length - 1);
    const backoff = BACKOFF_MS[idx] ?? BACKOFF_MS.at(-1) ?? 1000;
    const elapsed = now - last;
    if (elapsed >= backoff) return { allow: true, waitMs: 0 };
    return { allow: false, waitMs: backoff - elapsed };
  }

  recordAttempt(): void {
    this.attempts.push(this.nowFn());
  }
}
