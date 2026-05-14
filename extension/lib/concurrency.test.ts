import { describe, expect, it } from 'vitest';
import { Semaphore } from './concurrency';

describe('Semaphore', () => {
  it('cap 만큼만 동시 실행 허용', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 5 }, () => async () => {
      const release = await sem.acquire();
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      release();
    });
    await Promise.all(tasks.map((t) => t()));
    expect(peak).toBe(2);
  });

  it('대기 중인 작업은 release 후 풀림', async () => {
    const sem = new Semaphore(1);
    const r1 = await sem.acquire();
    let resolved = false;
    const p = sem.acquire().then((r) => {
      resolved = true;
      r();
    });
    expect(resolved).toBe(false);
    r1();
    await p;
    expect(resolved).toBe(true);
  });
});
