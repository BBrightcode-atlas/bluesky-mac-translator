import { describe, expect, it } from 'vitest';
import { RestartGate } from './restart-gate';

describe('RestartGate', () => {
  it('첫 시도는 즉시 허용', () => {
    const g = new RestartGate({ now: () => 1000 });
    expect(g.shouldAttempt()).toEqual({ allow: true, waitMs: 0 });
  });

  it('연속 시도는 1s/5s/30s backoff', () => {
    let t = 1000;
    const g = new RestartGate({ now: () => t });
    g.recordAttempt(); // #1
    t += 100;
    expect(g.shouldAttempt().waitMs).toBe(900); // 1000 - 100
    t += 900;
    expect(g.shouldAttempt()).toEqual({ allow: true, waitMs: 0 });
    g.recordAttempt(); // #2
    t += 100;
    expect(g.shouldAttempt().waitMs).toBe(4900); // 5000 - 100
  });

  it('분당 3회 cap 초과 시 거부', () => {
    let t = 1000;
    const g = new RestartGate({ now: () => t });
    g.recordAttempt();
    t += 1100;
    g.recordAttempt();
    t += 5100;
    g.recordAttempt();
    t += 30100;
    expect(g.shouldAttempt()).toEqual({ allow: false, waitMs: 0, reason: 'rate_limit' });
  });
});
