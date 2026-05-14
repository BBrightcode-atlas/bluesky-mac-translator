import type { Request, Response } from '../../host/src/types';

const HOST_NAME = 'com.flotter.bsky_translator';
const STATUS_CACHE_TTL_MS = 2000;

interface StatusCache {
  at: number;
  value: Response;
}

interface Pending {
  resolve: (res: Response) => void;
  reject: (err: Error) => void;
}

let port: chrome.runtime.Port | null = null;
let pending: Pending | null = null;
let statusCache: StatusCache | null = null;

function connect(): chrome.runtime.Port {
  if (port) return port;
  const p = chrome.runtime.connectNative(HOST_NAME);
  p.onMessage.addListener((msg: Response) => {
    const cb = pending;
    pending = null;
    cb?.resolve(msg);
  });
  p.onDisconnect.addListener(() => {
    port = null;
    const cb = pending;
    pending = null;
    const reason = chrome.runtime.lastError?.message ?? 'disconnected';
    cb?.reject(new Error(`NMH ${reason}`));
  });
  port = p;
  return p;
}

export async function send(req: Request): Promise<Response> {
  if (req.type === 'status' && statusCache && Date.now() - statusCache.at < STATUS_CACHE_TTL_MS) {
    return statusCache.value;
  }
  const p = connect();
  return new Promise<Response>((resolve, reject) => {
    if (pending) {
      reject(new Error('NMH busy'));
      return;
    }
    pending = {
      resolve: (res) => {
        if (req.type === 'status' && res.type === 'status') {
          statusCache = { at: Date.now(), value: res };
        }
        resolve(res);
      },
      reject,
    };
    try {
      p.postMessage(req);
    } catch (e) {
      pending = null;
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export function invalidateStatusCache(): void {
  statusCache = null;
}
