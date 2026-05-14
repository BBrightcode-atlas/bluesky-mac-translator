import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApfelManager, ApfelError } from './apfel-manager';

describe('ApfelManager.checkHealth', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns true on 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const mgr = new ApfelManager({ port: 11434 });
    expect(await mgr.checkHealth()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns false on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await new ApfelManager({ port: 11434 }).checkHealth()).toBe(false);
  });

  it('returns false on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await new ApfelManager({ port: 11434 }).checkHealth()).toBe(false);
  });

  it('uses configured timeout', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    expect(
      await new ApfelManager({ port: 11434, healthTimeoutMs: 30 }).checkHealth(),
    ).toBe(false);
  });
});

describe('ApfelManager.findApfelBinary', () => {
  it('PATH에서 찾으면 경로 반환', () => {
    const mgr = new ApfelManager({
      port: 11434,
      which: () => '/opt/homebrew/bin/apfel',
    });
    expect(mgr.findApfelBinary()).toBe('/opt/homebrew/bin/apfel');
  });

  it('없으면 null', () => {
    const mgr = new ApfelManager({ port: 11434, which: () => null });
    expect(mgr.findApfelBinary()).toBeNull();
  });
});

describe('ApfelManager.ensureRunning (헬스+spawn 통합)', () => {
  it('이미 헬시면 spawn 안 함', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const spawnMock = vi.fn();
    const mgr = new ApfelManager({
      port: 11434,
      which: () => '/x/apfel',
      spawnImpl: spawnMock,
    });
    await mgr.ensureRunning();
    expect(spawnMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('헬스 실패 시 spawn 호출', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const spawnMock = vi.fn().mockReturnValue({
      pid: 999,
      exitCode: null,
      on: vi.fn(),
      kill: vi.fn(),
    });
    const mgr = new ApfelManager({
      port: 11434,
      which: () => '/x/apfel',
      spawnImpl: spawnMock,
      startTimeoutMs: 500,
    });
    const res = await mgr.ensureRunning();
    expect(spawnMock).toHaveBeenCalledWith(
      '/x/apfel',
      ['--serve', '--port', '11434'],
      expect.objectContaining({ stdio: expect.any(Array) }),
    );
    expect(res.pid).toBe(999);
    vi.unstubAllGlobals();
  });

  it('apfel 미설치면 ApfelError(apfel_not_installed)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const mgr = new ApfelManager({ port: 11434, which: () => null });
    await expect(mgr.ensureRunning()).rejects.toMatchObject({
      name: 'ApfelError',
      code: 'apfel_not_installed',
    });
    vi.unstubAllGlobals();
  });
});
