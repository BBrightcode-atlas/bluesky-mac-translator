import { LruCache } from '@/lib/cache';
import { streamRequest } from '@/lib/nmh-client';
import type { ErrorCode, Request, Response } from '../../host/src/types';

function toErrorCode(c: string | undefined): ErrorCode {
  if (c === 'claude_not_found' || c === 'claude_auth' || c === 'claude_failed') return c;
  return 'claude_failed';
}

interface ClientMsg {
  kind: 'translate';
  payload: Extract<Request, { type: 'translate' }>;
}

const cache = new LruCache<string>(200);

async function makeKey(p: Extract<Request, { type: 'translate' }>): Promise<string> {
  const stable =
    p.mode === 'post'
      ? JSON.stringify({ mode: 'post', text: p.text, targetLang: p.targetLang })
      : JSON.stringify({ mode: 'reply', originalPost: p.originalPost, reply: p.reply });
  const buf = new TextEncoder().encode(stable);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${p.mode}:${hex}`;
}

export default defineBackground({
  main() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        void chrome.runtime.openOptionsPage();
      }
    });

    chrome.runtime.onConnect.addListener((clientPort: chrome.runtime.Port) => {
      if (clientPort.name !== 'translate') return;
      let aborter: AbortController | null = null;
      clientPort.onMessage.addListener((raw: unknown) => {
        const msg = raw as ClientMsg;
        if (msg.kind !== 'translate') return;
        // Cancel any prior in-flight request from this port before starting a new one.
        aborter?.abort();
        aborter = null;
        void handle(msg.payload, clientPort, (a) => {
          aborter = a;
        });
      });
      clientPort.onDisconnect.addListener(() => {
        aborter?.abort();
      });
    });
  },
});

async function handle(
  payload: Extract<Request, { type: 'translate' }>,
  clientPort: chrome.runtime.Port,
  setAborter: (a: AbortController) => void,
): Promise<void> {
  const key = await makeKey(payload);
  const cached = cache.get(key);
  if (cached) {
    const chunkRes: Response = { type: 'chunk', text: cached };
    const doneRes: Response = { type: 'done' };
    clientPort.postMessage(chunkRes);
    clientPort.postMessage(doneRes);
    return;
  }

  const ctl = new AbortController();
  setAborter(ctl);
  let acc = '';
  streamRequest(
    payload,
    {
      onChunk: (text) => {
        acc += text;
        const chunkRes: Response = { type: 'chunk', text };
        clientPort.postMessage(chunkRes);
      },
      onDone: () => {
        if (acc.length > 0) cache.set(key, acc);
        const doneRes: Response = { type: 'done' };
        clientPort.postMessage(doneRes);
      },
      onError: (e) => {
        const res: Response = { type: 'error', code: toErrorCode(e.code), message: e.message };
        clientPort.postMessage(res);
      },
    },
    ctl.signal,
  );
}
