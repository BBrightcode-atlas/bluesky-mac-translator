import { LruCache } from '@/lib/cache';
import { streamRequest } from '@/lib/nmh-client';
import type { Request, Response } from '../../host/src/types';

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
    clientPort.postMessage({ type: 'chunk', text: cached } as Response);
    clientPort.postMessage({ type: 'done' } as Response);
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
        clientPort.postMessage({ type: 'chunk', text } as Response);
      },
      onDone: () => {
        if (acc.length > 0) cache.set(key, acc);
        clientPort.postMessage({ type: 'done' } as Response);
      },
      onError: (e) => {
        clientPort.postMessage({
          type: 'error',
          code: e.code as never,
          message: e.message,
        } as Response);
      },
    },
    ctl.signal,
  );
}
