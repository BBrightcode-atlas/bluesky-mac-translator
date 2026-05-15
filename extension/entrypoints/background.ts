import { send } from '@/lib/nmh-client';
import { isLocalEndpoint, loadSettings } from '@/lib/storage';
import type { Request, Response } from '../../host/src/types';

interface BgMessage {
  kind: 'nmh' | 'ensure_ready';
  payload?: Request;
}

type BgReply = Response | { ok: true } | { ok: false; error: string; code?: string };

// nmh-client's send() is single-in-flight (rejects 'NMH busy' on overlap).
// Serialize all NMH access through a promise chain so concurrent extension
// messages (e.g. options page status poll + content script ensure_ready) queue
// instead of failing.
let nmhChain: Promise<unknown> = Promise.resolve();

function serializeNmh<T>(fn: () => Promise<T>): Promise<T> {
  const run = nmhChain.then(fn, fn);
  // keep the chain alive even if fn rejects; swallow here so the chain doesn't break
  nmhChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export default defineBackground({
  main() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        void chrome.runtime.openOptionsPage();
      }
    });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      void handle(msg as BgMessage).then(sendResponse);
      return true; // keep the message channel open for the async response
    });
  },
});

async function handle(msg: BgMessage): Promise<BgReply> {
  try {
    if (msg.kind === 'nmh' && msg.payload) {
      const payload = msg.payload;
      return await serializeNmh(() => send(payload));
    }
    if (msg.kind === 'ensure_ready') {
      const settings = await loadSettings();
      if (!isLocalEndpoint(settings.apfelEndpoint)) {
        return { ok: true };
      }
      const res = await serializeNmh(() => send({ type: 'ensure_running' }));
      if (res.type === 'error') return { ok: false, error: res.message, code: res.code };
      return { ok: true };
    }
    return { ok: false, error: 'unknown message kind' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
