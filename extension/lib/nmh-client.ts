import type { Request, Response } from '../../host/src/types';

const HOST_NAME = 'com.flotter.bsky_translator';
const STATUS_CACHE_TTL_MS = 2000;

interface StatusCache {
  at: number;
  value: Response;
}

let port: chrome.runtime.Port | null = null;
let pending: ((res: Response) => void) | null = null;
let statusCache: StatusCache | null = null;

function connect(): chrome.runtime.Port {
  if (port) return port;
  const p = chrome.runtime.connectNative(HOST_NAME);
  p.onMessage.addListener((msg: Response) => {
    const cb = pending;
    pending = null;
    cb?.(msg);
  });
  p.onDisconnect.addListener(() => {
    port = null;
    pending = null;
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
    pending = (res) => {
      if (req.type === 'status') statusCache = { at: Date.now(), value: res };
      resolve(res);
    };
    try {
      p.postMessage(req);
    } catch (e) {
      pending = null;
      reject(e);
    }
  });
}

export function invalidateStatusCache(): void {
  statusCache = null;
}
