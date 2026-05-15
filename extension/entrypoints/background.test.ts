import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const bg = await import('./background');
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
    // handle() is async (awaits makeKey / crypto.subtle.digest); flush the microtask queue.
    await new Promise((r) => setTimeout(r, 0));
    // background에서 native port로 위임됐는지
    expect(
      (globalThis as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }).chrome
        .runtime.connectNative,
    ).toHaveBeenCalledWith('com.flotter.bsky_translator');
    // 가짜 host가 chunk + done 보낸다고 시뮬레이션
    const nativePort = (
      globalThis as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }
    ).chrome.runtime.connectNative.mock.results[0]?.value as FakePort;
    nativePort.onMessage._emit({ type: 'chunk', text: '안녕' });
    nativePort.onMessage._emit({ type: 'done' });
    expect(clientPort.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: '안녕' });
    expect(clientPort.postMessage).toHaveBeenCalledWith({ type: 'done' });
  });

  it('hit → 즉시 cached chunk + done, native 호출 없음', async () => {
    const a = makePort('translate');
    onConnectListeners[0]?.(a);
    a.onMessage._emit({
      kind: 'translate',
      payload: { type: 'translate', mode: 'post', text: 'hi', targetLang: 'ko' },
    });
    // Await makeKey (crypto.subtle.digest) so handle() reaches streamRequest.
    await new Promise((r) => setTimeout(r, 0));
    const native = (
      globalThis as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }
    ).chrome.runtime.connectNative.mock.results[0]?.value as FakePort;
    native.onMessage._emit({ type: 'chunk', text: '안녕' });
    native.onMessage._emit({ type: 'done' });
    // 두 번째 요청 — cache hit이므로 새 native 연결 없음
    const b = makePort('translate');
    onConnectListeners[0]?.(b);
    b.onMessage._emit({
      kind: 'translate',
      payload: { type: 'translate', mode: 'post', text: 'hi', targetLang: 'ko' },
    });
    // Await makeKey for the second request too.
    await new Promise((r) => setTimeout(r, 0));
    expect(b.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: '안녕' });
    expect(b.postMessage).toHaveBeenCalledWith({ type: 'done' });
    // native는 첫 번째 호출만
    expect(
      (globalThis as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }).chrome
        .runtime.connectNative,
    ).toHaveBeenCalledTimes(1);
  });
});
