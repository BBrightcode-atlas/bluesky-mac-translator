// extension/lib/nmh-client.ts
import type { Request, Response } from '../../host/src/types';

const HOST_NAME = 'com.flotter.bsky_translator';

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: { code?: string; message: string }) => void;
  onDiagnoseResult?: (r: Extract<Response, { type: 'diagnose_result' }>) => void;
}

export function streamRequest(req: Request, cb: StreamCallbacks, signal: AbortSignal): void {
  let port: chrome.runtime.Port | null;
  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch (e) {
    cb.onError({ message: e instanceof Error ? e.message : String(e) });
    return;
  }
  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
    try {
      port?.disconnect();
    } catch {
      // ignore
    }
  };

  port.onMessage.addListener((msg: Response) => {
    if (msg.type === 'chunk') cb.onChunk(msg.text);
    else if (msg.type === 'done') settle(cb.onDone);
    else if (msg.type === 'error') settle(() => cb.onError({ code: msg.code, message: msg.message }));
    else if (msg.type === 'diagnose_result') {
      cb.onDiagnoseResult?.(msg);
      // diagnose는 result 1회 → host가 곧 done 보냄
    }
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message ?? 'disconnected';
    settle(() => cb.onError({ message: `NMH ${reason}` }));
  });
  signal.addEventListener(
    'abort',
    () => {
      settle(() => cb.onError({ message: 'aborted' }));
    },
    { once: true },
  );
  try {
    port.postMessage(req);
  } catch (e) {
    settle(() => cb.onError({ message: e instanceof Error ? e.message : String(e) }));
  }
}

export async function diagnose(): Promise<
  Extract<Response, { type: 'diagnose_result' }> | { type: 'error'; code?: string; message: string }
> {
  return new Promise((resolve) => {
    const ctl = new AbortController();
    let captured: Extract<Response, { type: 'diagnose_result' }> | null = null;
    streamRequest(
      { type: 'diagnose' },
      {
        onChunk: () => {},
        onDiagnoseResult: (r) => {
          captured = r;
        },
        onDone: () => {
          if (captured) resolve(captured);
          else resolve({ type: 'error', message: 'no diagnose_result' });
        },
        onError: (e) => resolve({ type: 'error', code: e.code, message: e.message }),
      },
      ctl.signal,
    );
  });
}
