import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';

const PID_PATH = `${homedir()}/Library/Application Support/flotter-bsky-translator/host.pid`;

export function acquireSinglePid(): boolean {
  mkdirSync(dirname(PID_PATH), { recursive: true });
  if (existsSync(PID_PATH)) {
    const existing = Number(readFileSync(PID_PATH, 'utf8').trim());
    if (Number.isFinite(existing) && existing > 0 && isAlive(existing)) {
      return false;
    }
  }
  writeFileSync(PID_PATH, String(process.pid), 'utf8');
  return true;
}

export function releasePid(): void {
  try {
    if (existsSync(PID_PATH)) unlinkSync(PID_PATH);
  } catch {
    // ignore
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
