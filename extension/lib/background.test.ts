import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function waitFor(predicate: () => boolean, maxMs = 200): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > maxMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

type Listener<T> = (arg: T) => void;

interface FakePort {
  name: string;
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onMessage: { addListener: (cb: Listener<unknown>) => void; _emit: (v: unknown) => void };
  onDisconnect: { addListener: (cb: Listener<unknown>) => void; _emit: () => void };
}

function makePort(name: string): FakePort {
  const msgListeners: Array<Listener<unknown>> = [];
  const disListeners: Array<Listener<unknown>> = [];
  return {
    name,
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (cb) => msgListeners.push(cb),
      _emit: (v) => {
        for (const l of msgListeners) l(v);
      },
    },
    onDisconnect: {
      addListener: (cb) => disListeners.push(cb),
      _emit: () => {
        for (const l of disListeners) l(undefined);
      },
    },
  };
}

const onConnectListeners: Array<(port: FakePort) => void> = [];

beforeEach(async () => {
  onConnectListeners.length = 0;
  const fakeNativePort = makePort('native');

  // Stub chrome before background.ts import so connectNative mock is fresh per test.
  vi.stubGlobal('chrome', {
    runtime: {
      onConnect: { addListener: (cb: (p: FakePort) => void) => onConnectListeners.push(cb) },
      connectNative: vi.fn(() => fakeNativePort),
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      lastError: null,
    },
  });

  // WXT registers defineBackground as a build-time global via its vite plugin.
  // In vitest, that global doesn't exist — stub it so background.ts can import cleanly.
  // defineBackground({ main() {...} }) simply returns { main } without calling main().
  vi.stubGlobal('defineBackground', (arg: { main: () => void } | (() => void)) => {
    if (typeof arg === 'function') return { main: arg };
    return arg;
  });

  // Re-import background module fresh per test.
  vi.resetModules();
  const bg = await import('../entrypoints/background');
  // Call main() explicitly — WXT never auto-invokes it in unit test context.
  (bg.default as { main?: () => void }).main?.();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('background translate port', () => {
  it('miss → native port로 request 전달, chunk/done 을 client port로 relay', async () => {
    const clientPort = makePort('translate');
    onConnectListeners[0]?.(clientPort);
    clientPort.onMessage._emit({
      kind: 'translate',
      payload: { type: 'translate', mode: 'post', text: 'hi', targetLang: 'ko' },
    });
    const mockConnectNative = (
      globalThis as unknown as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }
    ).chrome.runtime.connectNative;
    // Wait until handle() has awaited makeKey and called connectNative.
    await waitFor(() => mockConnectNative.mock.calls.length === 1);
    expect(mockConnectNative).toHaveBeenCalledWith('com.flotter.bsky_translator');
    // 가짜 host가 chunk + done 보낸다고 시뮬레이션
    const nativePort = mockConnectNative.mock.results[0]?.value as FakePort;
    nativePort.onMessage._emit({ type: 'chunk', text: '안녕' });
    nativePort.onMessage._emit({ type: 'done' });
    await waitFor(() =>
      clientPort.postMessage.mock.calls.some((c: unknown[]) => (c[0] as { type: string })?.type === 'done'),
    );
    expect(clientPort.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: '안녕' });
    expect(clientPort.postMessage).toHaveBeenCalledWith({ type: 'done' });
  });

  it('hit → 즉시 cached chunk + done, native 호출 없음', async () => {
    const mockConnectNative = (
      globalThis as unknown as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }
    ).chrome.runtime.connectNative;

    // First request — cache miss, goes to native.
    const a = makePort('translate');
    onConnectListeners[0]?.(a);
    a.onMessage._emit({
      kind: 'translate',
      payload: { type: 'translate', mode: 'post', text: 'hi', targetLang: 'ko' },
    });
    // Wait until handle() has called connectNative.
    await waitFor(() => mockConnectNative.mock.calls.length === 1);
    const native = mockConnectNative.mock.results[0]?.value as FakePort;
    native.onMessage._emit({ type: 'chunk', text: '안녕' });
    native.onMessage._emit({ type: 'done' });
    // Wait until client A receives done (cache is now populated).
    await waitFor(() =>
      a.postMessage.mock.calls.some((c: unknown[]) => (c[0] as { type: string })?.type === 'done'),
    );

    // Second request — same payload, cache hit, no new native connection.
    const b = makePort('translate');
    onConnectListeners[0]?.(b);
    b.onMessage._emit({
      kind: 'translate',
      payload: { type: 'translate', mode: 'post', text: 'hi', targetLang: 'ko' },
    });
    // Wait until client B receives done from cache.
    await waitFor(() =>
      b.postMessage.mock.calls.some((c: unknown[]) => (c[0] as { type: string })?.type === 'done'),
    );
    expect(b.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: '안녕' });
    expect(b.postMessage).toHaveBeenCalledWith({ type: 'done' });
    // native는 첫 번째 호출만
    expect(mockConnectNative).toHaveBeenCalledTimes(1);
  });
});
