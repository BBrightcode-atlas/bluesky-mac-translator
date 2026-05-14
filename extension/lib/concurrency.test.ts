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

  it('release를 두 번 호출해도 cap이 망가지지 않음', async () => {
    const sem = new Semaphore(1);
    const r1 = await sem.acquire();
    r1();
    r1(); // 두 번째 호출은 무시되어야 함
    // cap이 망가졌다면 이 acquire가 즉시 풀리지 않거나 cap 위반이 생김
    const r2 = await sem.acquire();
    let thirdResolved = false;
    const p = sem.acquire().then((r) => {
      thirdResolved = true;
      r();
    });
    // r2가 슬롯을 점유 중이므로 세 번째는 대기해야 함
    await new Promise((res) => setTimeout(res, 5));
    expect(thirdResolved).toBe(false);
    r2();
    await p;
    expect(thirdResolved).toBe(true);
  });
});
