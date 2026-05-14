import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

const LOG_PATH = `${homedir()}/Library/Logs/flotter-bsky-translator/host.log`;

function ensureDir(p: string) {
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

export function log(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown): void {
  ensureDir(LOG_PATH);
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(extra && typeof extra === 'object' ? { extra } : {}),
  });
  try {
    appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    // 디스크 오류는 무시 (NMH는 계속 동작)
  }
}

export const apfelLogPath = `${homedir()}/Library/Logs/flotter-bsky-translator/apfel.log`;
