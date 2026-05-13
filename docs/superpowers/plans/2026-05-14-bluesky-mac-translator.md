# Bluesky Mac Translator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bsky.app 각 게시물에 "번역" 링크를 주입해 macOS 내장 LLM(apfel)으로 사용자 대상 언어(KR/JP/CN)로 스트리밍 번역하는 Chrome extension을 내부 배포한다.

**Architecture:** Chrome MV3 extension(WXT)이 content script로 bsky.app DOM에 Shadow DOM 기반 UI를 주입한다. Background service worker는 Native Messaging Host(Node.js)를 통해 `apfel --serve` lifecycle을 관리하고, content script는 `localhost:11434`로 직접 OpenAI 호환 SSE 스트리밍을 받는다. `install.sh` 한 줄로 전체 셋업 자동화.

**Tech Stack:** TypeScript, WXT (Chrome MV3), React (옵션 페이지만), Node.js 20 (NMH), Vitest, Biome, pnpm workspaces, apfel (macOS Tahoe 내장 LLM CLI)

**Spec reference:** `docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md`

---

## Phase 1 — 워크스페이스 & 툴링 부트스트랩

### Task 1: pnpm 모노레포 부트스트랩

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.node-version`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Root `package.json` 작성**

```json
{
  "name": "@flotter/bluesky-mac-translator",
  "version": "0.0.1",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r --filter=./host --filter=./extension build",
    "typecheck": "pnpm -r typecheck",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "lint:dom": "bash scripts/check-unsafe-dom.sh",
    "test": "pnpm -r test",
    "check": "pnpm typecheck && pnpm lint && pnpm lint:dom && pnpm test"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: `pnpm-workspace.yaml` 작성**

```yaml
packages:
  - extension
  - host
```

- [ ] **Step 3: `.gitignore` 작성**

```
node_modules/
dist/
.output/
.wxt/
*.log
.DS_Store
.env
.env.local
coverage/
```

- [ ] **Step 4: `.node-version` 작성**

```
20.18.0
```

- [ ] **Step 5: `tsconfig.base.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 6: pnpm 설치 + 검증**

Run: `corepack enable && corepack prepare pnpm@9.12.0 --activate && pnpm install`
Expected: `Done in Xs`, `pnpm-lock.yaml` 생성.

- [ ] **Step 7: 커밋**

```bash
git add package.json pnpm-workspace.yaml .gitignore .node-version tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: pnpm 모노레포 + TS strict 베이스 셋업"
```

---

### Task 2: Biome + grep guard (spec §7.6 보안 규칙)

**Files:**
- Create: `biome.json`
- Create: `scripts/check-unsafe-dom.sh`

- [ ] **Step 1: `biome.json` 작성**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["dist", ".output", ".wxt", "node_modules", "coverage"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "security": {
        "noDangerouslySetInnerHtml": "error",
        "noDangerouslySetInnerHtmlWithChildren": "error",
        "noGlobalEval": "error"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

- [ ] **Step 2: `scripts/check-unsafe-dom.sh` 작성**

Biome가 커버하지 않는 위험 패턴들을 grep으로 차단. 패턴은 정규식 문자열로만 등장(실제 호출 아님).

```bash
#!/usr/bin/env bash
set -euo pipefail

# spec §7.6에서 금지한 패턴 목록. 정규식만 사용 — 실제 호출은 grep 결과로 검출됨.
PATTERNS_FILE="$(dirname "$0")/unsafe-dom-patterns.txt"

found=0
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  if git grep -nE -- "$pat" 'extension/**/*.ts' 'extension/**/*.tsx' 'host/**/*.ts' 2>/dev/null \
       | grep -v '\.test\.ts:' \
       | grep -v 'scripts/check-unsafe-dom\.sh' \
       | grep -v 'unsafe-dom-patterns\.txt'; then
    printf "❌ 금지된 패턴 발견: %s\n" "$pat"
    found=1
  fi
done < "$PATTERNS_FILE"

if [ "$found" -eq 1 ]; then
  printf "\nspec §7.6 위반. createElement + textContent로 교체하세요.\n"
  exit 1
fi
printf "✓ unsafe DOM 패턴 없음\n"
```

- [ ] **Step 3: 패턴 파일 분리 — `scripts/unsafe-dom-patterns.txt`**

```
\.innerHTML[[:space:]]*=
\.outerHTML[[:space:]]*=
\.insertAdjacentHTML\b
\bdocument\.write\b
\beval[[:space:]]*\(
\bFunction[[:space:]]*\([^)]*\)[[:space:]]*\(
\bsetTimeout[[:space:]]*\([[:space:]]*['"]
\bsetInterval[[:space:]]*\([[:space:]]*['"]
```

> **참고**: `.test.ts` 파일은 grep에서 제외 (테스트 픽스처에서 안전한 한정 use가 허용될 수 있음). 프로덕션 코드(`lib/`, `entrypoints/`, `host/src/`)에서는 0건이어야 함.

- [ ] **Step 4: 권한 부여**

```bash
mkdir -p scripts
chmod +x scripts/check-unsafe-dom.sh
```

- [ ] **Step 5: 검증**

Run: `pnpm lint`
Expected: `Checked 0 files in Xs` (소스 없음, 통과)

Run: `pnpm lint:dom`
Expected: `✓ unsafe DOM 패턴 없음`

- [ ] **Step 6: 커밋**

```bash
git add biome.json scripts/check-unsafe-dom.sh scripts/unsafe-dom-patterns.txt
git commit -m "chore: Biome + grep guard로 unsafe DOM/eval 패턴 차단"
```

---

## Phase 2 — Native Messaging Host

### Task 3: Host 패키지 + NMH 프로토콜 (TDD)

**Files:**
- Create: `host/package.json`, `host/tsconfig.json`, `host/vitest.config.ts`
- Create: `host/src/types.ts`
- Create: `host/src/protocol.ts`, `host/src/protocol.test.ts`

- [ ] **Step 1: `host/package.json`**

```json
{
  "name": "@flotter/bsky-translator-host",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsup src/index.ts --format esm --target node20 --out-dir dist --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "20.16.13",
    "tsup": "8.3.0",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: `host/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "lib": ["ES2022"],
    "types": ["node"],
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: `host/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: `host/src/types.ts` (spec §4.2)**

```typescript
export type Request =
  | { type: 'status' }
  | { type: 'ensure_running' }
  | { type: 'restart' }
  | { type: 'shutdown' };

export type ErrorCode =
  | 'apfel_not_installed'
  | 'port_in_use'
  | 'spawn_failed'
  | 'timeout'
  | 'ai_disabled';

export type Response =
  | { type: 'status'; running: boolean; pid?: number; port: number; version?: string }
  | { type: 'started'; port: number; pid: number }
  | { type: 'error'; code: ErrorCode; message: string };
```

- [ ] **Step 5: 실패 테스트 — `host/src/protocol.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { encode, decode, readMessages } from './protocol';
import type { Request, Response } from './types';

describe('protocol', () => {
  it('encode prefixes 4-byte little-endian length', () => {
    const buf = encode({ type: 'status' });
    const len = buf.readUInt32LE(0);
    expect(len).toBe(JSON.stringify({ type: 'status' }).length);
    expect(buf.subarray(4).toString('utf8')).toBe('{"type":"status"}');
  });

  it('decode round-trips a single message', () => {
    const msg: Response = { type: 'status', running: true, port: 11434, pid: 42 };
    const decoded = decode<Response>(encode(msg));
    expect(decoded).toEqual(msg);
  });

  it('readMessages yields each message from a chunked stream', async () => {
    const a: Request = { type: 'status' };
    const b: Request = { type: 'restart' };
    const stream = Readable.from([
      encode(a).subarray(0, 3),
      Buffer.concat([encode(a).subarray(3), encode(b)]),
    ]);
    const out: Request[] = [];
    for await (const m of readMessages<Request>(stream)) out.push(m);
    expect(out).toEqual([a, b]);
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `cd host && pnpm test`
Expected: `Cannot find module './protocol'`

- [ ] **Step 7: 구현 — `host/src/protocol.ts`**

```typescript
import type { Readable } from 'node:stream';

export function encode(msg: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

export function decode<T>(buf: Buffer): T {
  const len = buf.readUInt32LE(0);
  return JSON.parse(buf.subarray(4, 4 + len).toString('utf8')) as T;
}

export async function* readMessages<T>(stream: Readable): AsyncGenerator<T> {
  let buf = Buffer.alloc(0);
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) break;
      const json = buf.subarray(4, 4 + len).toString('utf8');
      buf = buf.subarray(4 + len);
      yield JSON.parse(json) as T;
    }
  }
}
```

- [ ] **Step 8: 통과 확인**

Run: `cd host && pnpm test`
Expected: `Tests  3 passed (3)`

- [ ] **Step 9: 커밋**

```bash
git add host/
git commit -m "feat(host): NMH 길이 프리픽스 프로토콜 (TDD)"
```

---

### Task 4: Logger + PATH 기반 apfel 탐색

**Files:**
- Create: `host/src/logger.ts`
- Create: `host/src/which.ts`, `host/src/which.test.ts`

- [ ] **Step 1: `host/src/logger.ts`**

```typescript
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
```

- [ ] **Step 2: 테스트 — `host/src/which.test.ts`**

`whichInPath`는 외부 프로세스 없이 `node:fs.accessSync`로 PATH를 직접 순회한다. 안전성↑/속도↑.

```typescript
import { describe, expect, it, vi } from 'vitest';
import { whichInPath } from './which';

describe('whichInPath', () => {
  it('실행 가능 파일이 PATH 첫 디렉토리에 있으면 그 경로 반환', () => {
    const access = vi.fn().mockImplementation((p: string) => {
      if (p === '/a/foo') return; // OK
      throw new Error('ENOENT');
    });
    expect(whichInPath('foo', { path: '/a:/b', access })).toBe('/a/foo');
  });

  it('나중 디렉토리에 있으면 그 경로 반환', () => {
    const access = vi.fn().mockImplementation((p: string) => {
      if (p === '/b/foo') return;
      throw new Error('ENOENT');
    });
    expect(whichInPath('foo', { path: '/a:/b:/c', access })).toBe('/b/foo');
  });

  it('어디에도 없으면 null', () => {
    const access = vi.fn().mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(whichInPath('foo', { path: '/a:/b', access })).toBeNull();
  });

  it('빈 PATH 처리', () => {
    expect(whichInPath('foo', { path: '', access: vi.fn() })).toBeNull();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd host && pnpm test which`
Expected: `Cannot find module './which'`

- [ ] **Step 4: 구현 — `host/src/which.ts`**

```typescript
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export interface WhichOptions {
  path?: string;
  access?: (p: string) => void;
}

export function whichInPath(name: string, opts: WhichOptions = {}): string | null {
  const path = opts.path ?? process.env.PATH ?? '';
  if (!path) return null;
  const access = opts.access ?? ((p: string) => accessSync(p, constants.X_OK));
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const full = join(dir, name);
    try {
      access(full);
      return full;
    } catch {
      // try next
    }
  }
  return null;
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd host && pnpm test which`
Expected: `Tests  4 passed (4)`

- [ ] **Step 6: 커밋**

```bash
git add host/src/logger.ts host/src/which.ts host/src/which.test.ts
git commit -m "feat(host): logger + PATH 기반 apfel 탐색 (subprocess 없이)"
```

---

### Task 5: ApfelManager — 헬스체크 + spawn (TDD)

**Files:**
- Create: `host/src/apfel-manager.ts`, `host/src/apfel-manager.test.ts`

- [ ] **Step 1: 테스트 — `host/src/apfel-manager.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApfelManager, ApfelError } from './apfel-manager';

describe('ApfelManager.checkHealth', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns true on 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const mgr = new ApfelManager({ port: 11434 });
    expect(await mgr.checkHealth()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns false on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await new ApfelManager({ port: 11434 }).checkHealth()).toBe(false);
  });

  it('returns false on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await new ApfelManager({ port: 11434 }).checkHealth()).toBe(false);
  });

  it('uses configured timeout', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    expect(
      await new ApfelManager({ port: 11434, healthTimeoutMs: 30 }).checkHealth(),
    ).toBe(false);
  });
});

describe('ApfelManager.findApfelBinary', () => {
  it('PATH에서 찾으면 경로 반환', () => {
    const mgr = new ApfelManager({
      port: 11434,
      which: () => '/opt/homebrew/bin/apfel',
    });
    expect(mgr.findApfelBinary()).toBe('/opt/homebrew/bin/apfel');
  });

  it('없으면 null', () => {
    const mgr = new ApfelManager({ port: 11434, which: () => null });
    expect(mgr.findApfelBinary()).toBeNull();
  });
});

describe('ApfelManager.ensureRunning (헬스+spawn 통합)', () => {
  it('이미 헬시면 spawn 안 함', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const spawnMock = vi.fn();
    const mgr = new ApfelManager({
      port: 11434,
      which: () => '/x/apfel',
      spawnImpl: spawnMock,
    });
    await mgr.ensureRunning();
    expect(spawnMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('헬스 실패 시 spawn 호출', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const spawnMock = vi.fn().mockReturnValue({
      pid: 999,
      exitCode: null,
      on: vi.fn(),
      kill: vi.fn(),
    });
    const mgr = new ApfelManager({
      port: 11434,
      which: () => '/x/apfel',
      spawnImpl: spawnMock,
      startTimeoutMs: 500,
    });
    const res = await mgr.ensureRunning();
    expect(spawnMock).toHaveBeenCalledWith(
      '/x/apfel',
      ['--serve', '--port', '11434'],
      expect.objectContaining({ stdio: expect.any(Array) }),
    );
    expect(res.pid).toBe(999);
    vi.unstubAllGlobals();
  });

  it('apfel 미설치면 ApfelError(apfel_not_installed)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const mgr = new ApfelManager({ port: 11434, which: () => null });
    await expect(mgr.ensureRunning()).rejects.toMatchObject({
      name: 'ApfelError',
      code: 'apfel_not_installed',
    });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd host && pnpm test apfel-manager`
Expected: `Cannot find module './apfel-manager'`

- [ ] **Step 3: 구현 — `host/src/apfel-manager.ts`**

```typescript
import { spawn as nodeSpawn } from 'node:child_process';
import { openSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { apfelLogPath, log } from './logger';
import { whichInPath } from './which';

export interface SpawnedChild {
  pid?: number;
  exitCode: number | null;
  on(event: 'exit', cb: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface ApfelManagerOptions {
  port: number;
  healthTimeoutMs?: number;
  startTimeoutMs?: number;
  which?: (name: string) => string | null;
  spawnImpl?: (cmd: string, args: string[], opts: Parameters<typeof nodeSpawn>[2]) => SpawnedChild;
}

export class ApfelError extends Error {
  constructor(
    public readonly code: 'apfel_not_installed' | 'spawn_failed' | 'timeout' | 'port_in_use',
    message: string,
  ) {
    super(message);
    this.name = 'ApfelError';
  }
}

export class ApfelManager {
  private readonly port: number;
  private readonly healthTimeoutMs: number;
  private readonly startTimeoutMs: number;
  private readonly which: (name: string) => string | null;
  private readonly spawnImpl: NonNullable<ApfelManagerOptions['spawnImpl']>;
  private child: SpawnedChild | null = null;

  constructor(opts: ApfelManagerOptions) {
    this.port = opts.port;
    this.healthTimeoutMs = opts.healthTimeoutMs ?? 300;
    this.startTimeoutMs = opts.startTimeoutMs ?? 5000;
    this.which = opts.which ?? whichInPath;
    this.spawnImpl = opts.spawnImpl ?? ((cmd, args, o) => nodeSpawn(cmd, args, o) as unknown as SpawnedChild);
  }

  async checkHealth(): Promise<boolean> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.healthTimeoutMs);
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/v1/models`, {
        method: 'GET',
        signal: ctl.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  findApfelBinary(): string | null {
    return this.which('apfel');
  }

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  currentPid(): number | undefined {
    return this.child?.pid;
  }

  async ensureRunning(): Promise<{ pid: number; port: number }> {
    if (await this.checkHealth()) {
      return { pid: this.child?.pid ?? -1, port: this.port };
    }
    return this.spawnAndWait();
  }

  async spawnAndWait(): Promise<{ pid: number; port: number }> {
    const bin = this.findApfelBinary();
    if (!bin) throw new ApfelError('apfel_not_installed', 'apfel binary not found in PATH');

    const logFd = openSync(apfelLogPath, 'a');
    const child = this.spawnImpl(bin, ['--serve', '--port', String(this.port)], {
      stdio: ['ignore', logFd, logFd],
    });
    this.child = child;
    log('info', 'apfel spawn', { pid: child.pid, port: this.port });

    child.on('exit', (code, signal) => {
      log('warn', 'apfel exit', { code, signal });
      if (this.child === child) this.child = null;
    });

    const deadline = Date.now() + this.startTimeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new ApfelError('spawn_failed', `exited with code=${child.exitCode}`);
      }
      if (await this.checkHealth()) {
        return { pid: child.pid ?? -1, port: this.port };
      }
      await sleep(150);
    }
    throw new ApfelError('timeout', `apfel not ready in ${this.startTimeoutMs}ms`);
  }

  async stop(): Promise<void> {
    const c = this.child;
    if (!c || c.exitCode !== null) return;
    c.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (c.exitCode === null) c.kill('SIGKILL');
        resolve();
      }, 3000);
      c.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.child = null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd host && pnpm test apfel-manager`
Expected: `Tests  9 passed (9)`

- [ ] **Step 5: 커밋**

```bash
git add host/src/apfel-manager.ts host/src/apfel-manager.test.ts
git commit -m "feat(host): ApfelManager 헬스체크 + spawn (DI 가능, TDD)"
```

---

### Task 6: 헬스 모니터 + RestartGate (backoff 1s/5s/30s, 분당 3회)

**Files:**
- Create: `host/src/restart-gate.ts`, `host/src/restart-gate.test.ts`
- Modify: `host/src/apfel-manager.ts`

- [ ] **Step 1: 테스트 — `host/src/restart-gate.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { RestartGate } from './restart-gate';

describe('RestartGate', () => {
  it('첫 시도는 즉시 허용', () => {
    const g = new RestartGate({ now: () => 1000 });
    expect(g.shouldAttempt()).toEqual({ allow: true, waitMs: 0 });
  });

  it('연속 시도는 1s/5s/30s backoff', () => {
    let t = 1000;
    const g = new RestartGate({ now: () => t });
    g.recordAttempt();           // #1
    t += 100;
    expect(g.shouldAttempt().waitMs).toBe(900);   // 1000 - 100
    t += 900;
    expect(g.shouldAttempt()).toEqual({ allow: true, waitMs: 0 });
    g.recordAttempt();           // #2
    t += 100;
    expect(g.shouldAttempt().waitMs).toBe(4900);  // 5000 - 100
  });

  it('분당 3회 cap 초과 시 거부', () => {
    let t = 1000;
    const g = new RestartGate({ now: () => t });
    g.recordAttempt(); t += 1100;
    g.recordAttempt(); t += 5100;
    g.recordAttempt(); t += 30100;
    expect(g.shouldAttempt()).toEqual({ allow: false, waitMs: 0, reason: 'rate_limit' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd host && pnpm test restart-gate`
Expected: `Cannot find module './restart-gate'`

- [ ] **Step 3: 구현 — `host/src/restart-gate.ts`**

```typescript
const BACKOFF_MS = [1000, 5000, 30000];
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 3;

export type GateDecision =
  | { allow: true; waitMs: 0 }
  | { allow: false; waitMs: number; reason?: 'rate_limit' };

export class RestartGate {
  private readonly nowFn: () => number;
  private attempts: number[] = [];

  constructor(opts: { now?: () => number } = {}) {
    this.nowFn = opts.now ?? Date.now;
  }

  shouldAttempt(): GateDecision {
    const now = this.nowFn();
    this.attempts = this.attempts.filter((t) => now - t < RATE_WINDOW_MS);

    if (this.attempts.length >= RATE_MAX) {
      return { allow: false, waitMs: 0, reason: 'rate_limit' };
    }

    const last = this.attempts.at(-1);
    if (last === undefined) return { allow: true, waitMs: 0 };

    const idx = Math.min(this.attempts.length - 1, BACKOFF_MS.length - 1);
    const backoff = BACKOFF_MS[idx] ?? BACKOFF_MS.at(-1) ?? 1000;
    const elapsed = now - last;
    if (elapsed >= backoff) return { allow: true, waitMs: 0 };
    return { allow: false, waitMs: backoff - elapsed };
  }

  recordAttempt(): void {
    this.attempts.push(this.nowFn());
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd host && pnpm test restart-gate`
Expected: `Tests  3 passed (3)`

- [ ] **Step 5: `ApfelManager`에 헬스 모니터 추가**

`host/src/apfel-manager.ts`의 `ApfelManager` 클래스에 다음을 추가 (생성자 이후 위치):

```typescript
  // === 헬스 모니터 ===
  private monitorTimer: NodeJS.Timeout | null = null;
  private monitorFails = 0;
  private readonly gate = new (await import('./restart-gate.js')).RestartGate();
```

위 동적 import는 ESM 환경에서만 동작. 대신 정적 import로 교체:

상단에 `import { RestartGate } from './restart-gate';` 추가하고, 클래스에 추가:

```typescript
  private monitorTimer: NodeJS.Timeout | null = null;
  private monitorFails = 0;
  private readonly gate = new RestartGate();

  startMonitor(intervalMs = 30_000): void {
    this.stopMonitor();
    this.monitorTimer = setInterval(() => {
      void this.tickMonitor();
    }, intervalMs);
  }

  stopMonitor(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    this.monitorFails = 0;
  }

  private async tickMonitor(): Promise<void> {
    const ok = await this.checkHealth();
    if (ok) {
      this.monitorFails = 0;
      return;
    }
    this.monitorFails += 1;
    if (this.monitorFails < 3) return;

    const decision = this.gate.shouldAttempt();
    if (!decision.allow) {
      log('warn', 'restart blocked', { reason: decision.reason ?? 'backoff', waitMs: decision.waitMs });
      return;
    }
    log('info', 'apfel down → 자동 재시작 시도');
    this.gate.recordAttempt();
    this.monitorFails = 0;
    try {
      await this.spawnAndWait();
    } catch (e) {
      log('error', 'auto-restart 실패', { err: String(e) });
    }
  }
```

- [ ] **Step 6: 모니터 통합 테스트 추가 — `host/src/apfel-manager.test.ts`에 append**

```typescript
describe('ApfelManager.tickMonitor', () => {
  it('헬스 3회 연속 실패 후 spawn 시도', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const mgr = new ApfelManager({ port: 11434, which: () => '/x/apfel' });
    const spawnSpy = vi.spyOn(mgr, 'spawnAndWait').mockResolvedValue({ pid: 1, port: 11434 });

    const tick = (mgr as unknown as { tickMonitor: () => Promise<void> }).tickMonitor.bind(mgr);
    await tick();
    await tick();
    expect(spawnSpy).not.toHaveBeenCalled();
    await tick();
    expect(spawnSpy).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 7: 통과 확인**

Run: `cd host && pnpm test`
Expected: 모든 호스트 테스트 통과

- [ ] **Step 8: 커밋**

```bash
git add host/src/restart-gate.ts host/src/restart-gate.test.ts host/src/apfel-manager.ts host/src/apfel-manager.test.ts
git commit -m "feat(host): 헬스 모니터 + RestartGate 통합 (1s/5s/30s, 분당 3회 cap)"
```

---

### Task 7: NMH 메인 루프 + pidfile

**Files:**
- Create: `host/src/pidfile.ts`
- Create: `host/src/index.ts`

- [ ] **Step 1: `host/src/pidfile.ts`**

```typescript
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
```

- [ ] **Step 2: `host/src/index.ts`**

```typescript
import { ApfelManager, ApfelError } from './apfel-manager';
import { encode, readMessages } from './protocol';
import { acquireSinglePid, releasePid } from './pidfile';
import { log } from './logger';
import type { Request, Response, ErrorCode } from './types';

const PORT = 11434;

async function main() {
  if (!acquireSinglePid()) {
    log('warn', 'another host process is running; exiting');
    process.exit(0);
  }
  process.on('exit', releasePid);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  const mgr = new ApfelManager({ port: PORT });
  mgr.startMonitor();
  log('info', 'host started', { pid: process.pid });

  for await (const msg of readMessages<Request>(process.stdin)) {
    const reply = await handle(msg, mgr);
    process.stdout.write(encode(reply));
  }

  mgr.stopMonitor();
}

async function handle(req: Request, mgr: ApfelManager): Promise<Response> {
  try {
    switch (req.type) {
      case 'status': {
        const running = await mgr.checkHealth();
        return { type: 'status', running, port: PORT, pid: mgr.currentPid() };
      }
      case 'ensure_running': {
        if (await mgr.checkHealth()) {
          return { type: 'status', running: true, port: PORT, pid: mgr.currentPid() };
        }
        const { pid } = await mgr.spawnAndWait();
        return { type: 'started', port: PORT, pid };
      }
      case 'restart': {
        await mgr.stop();
        const { pid } = await mgr.spawnAndWait();
        return { type: 'started', port: PORT, pid };
      }
      case 'shutdown': {
        await mgr.stop();
        return { type: 'status', running: false, port: PORT };
      }
    }
  } catch (e) {
    if (e instanceof ApfelError) {
      return { type: 'error', code: e.code as ErrorCode, message: e.message };
    }
    log('error', 'handler exception', { err: String(e) });
    return { type: 'error', code: 'spawn_failed', message: String(e) };
  }
}

main().catch((e) => {
  log('error', 'fatal', { err: String(e) });
  process.exit(1);
});
```

- [ ] **Step 3: 빌드 + 타입 체크**

Run: `cd host && pnpm typecheck && pnpm build`
Expected: 에러 없음, `dist/index.js` 생성

- [ ] **Step 4: 커밋**

```bash
git add host/src/pidfile.ts host/src/index.ts
git commit -m "feat(host): NMH 메인 루프 + pidfile (단일 인스턴스)"
```

---

## Phase 3 — Extension 스캐폴딩

### Task 8: WXT extension 패키지

**Files:**
- Create: `extension/package.json`, `extension/wxt.config.ts`, `extension/tsconfig.json`, `extension/vitest.config.ts`
- Create: `extension/entrypoints/content.ts`, `extension/entrypoints/background.ts` (placeholder)
- Create: `extension/public/icon/{16,32,48,128}.png`

- [ ] **Step 1: `extension/package.json`**

```json
{
  "name": "@flotter/bsky-translator-extension",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "typecheck": "wxt prepare && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/chrome": "0.0.278",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.3",
    "happy-dom": "15.7.4",
    "typescript": "5.6.3",
    "vitest": "2.1.4",
    "wxt": "0.19.13"
  }
}
```

- [ ] **Step 2: `extension/wxt.config.ts` (spec §5.2)**

```typescript
import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  vite: () => ({ plugins: [react()] }),
  manifest: {
    name: 'Bluesky Translator',
    description: 'Translate Bluesky posts via Apple on-device LLM (apfel)',
    version: '0.0.1',
    permissions: ['storage', 'nativeMessaging'],
    host_permissions: [
      'https://bsky.app/*',
      'http://127.0.0.1:11434/*',
    ],
    options_ui: { page: 'options.html', open_in_tab: true },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
```

- [ ] **Step 3: `extension/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["chrome", "wxt/client"],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".wxt/**/*"]
}
```

- [ ] **Step 4: `extension/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'happy-dom', include: ['**/*.test.{ts,tsx}'] },
});
```

- [ ] **Step 5: placeholder entrypoints**

`extension/entrypoints/content.ts`:

```typescript
export default defineContentScript({
  matches: ['https://bsky.app/*'],
  runAt: 'document_idle',
  main() {
    console.log('[bsky-translator] content script loaded');
  },
});
```

`extension/entrypoints/background.ts`:

```typescript
export default defineBackground({
  main() {
    console.log('[bsky-translator] background loaded');
  },
});
```

- [ ] **Step 6: placeholder 아이콘 4종 (1x1 투명 PNG)**

```bash
cd extension && mkdir -p public/icon
PNG_B64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
for s in 16 32 48 128; do
  printf '%s' "$PNG_B64" | base64 -D > "public/icon/$s.png"
done
ls public/icon/
```

Expected: `16.png 32.png 48.png 128.png`

- [ ] **Step 7: 설치 + 빌드**

```bash
cd /Users/bright/Projects/bluesky-mac-translator
pnpm install
cd extension && pnpm build
```

Expected: `extension/.output/chrome-mv3/manifest.json` 존재

- [ ] **Step 8: 커밋**

```bash
git add extension/ pnpm-lock.yaml
git commit -m "feat(extension): WXT MV3 스캐폴딩 + placeholder 아이콘"
```

---

### Task 9: 공용 lib — storage / prompts / cache (TDD)

**Files:**
- Create: `extension/lib/storage.ts`
- Create: `extension/lib/prompts.ts`
- Create: `extension/lib/cache.ts`, `extension/lib/cache.test.ts`

- [ ] **Step 1: `extension/lib/storage.ts` (spec §8.1, §8.6)**

```typescript
export type TargetLang = 'ko' | 'ja' | 'zh';

export interface Settings {
  targetLang: TargetLang;
  apfelEndpoint: string;
  showLanguagePicker: boolean;
  autoRestartServer: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  targetLang: 'ko',
  apfelEndpoint: 'http://127.0.0.1:11434',
  showLanguagePicker: true,
  autoRestartServer: true,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored } as Settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}

export function onSettingsChange(handler: (s: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ) => {
    if (area !== 'sync') return;
    if (Object.keys(changes).some((k) => k in DEFAULT_SETTINGS)) {
      void loadSettings().then(handler);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function isLocalEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: `extension/lib/prompts.ts` (spec §6.2)**

```typescript
import type { TargetLang } from './storage';

export const SYSTEM_PROMPTS: Record<TargetLang, string> = {
  ko: 'You are a translator. Translate the user\'s text into natural Korean (한국어). Output only the translation, no explanations, no quotes.',
  ja: 'You are a translator. Translate the user\'s text into natural Japanese (日本語). Output only the translation, no explanations, no quotes.',
  zh: 'You are a translator. Translate the user\'s text into natural Simplified Chinese (简体中文). Output only the translation, no explanations, no quotes.',
};

export const LANG_OPTIONS: ReadonlyArray<{ value: TargetLang; label: string }> = [
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
] as const;

export interface ChatRequest {
  model: string;
  messages: ReadonlyArray<{ role: 'system' | 'user'; content: string }>;
  stream: true;
  temperature: number;
}

export function buildRequest(text: string, lang: TargetLang): ChatRequest {
  return {
    model: 'apple-on-device',
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS[lang] },
      { role: 'user', content: text },
    ],
    stream: true,
    temperature: 0.2,
  };
}
```

- [ ] **Step 3: 테스트 — `extension/lib/cache.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { LruCache, cacheKey } from './cache';

describe('cacheKey', () => {
  it('같은 입력이면 같은 키', async () => {
    expect(await cacheKey('hello', 'ko')).toBe(await cacheKey('hello', 'ko'));
  });
  it('언어가 다르면 다른 키', async () => {
    expect(await cacheKey('hello', 'ko')).not.toBe(await cacheKey('hello', 'ja'));
  });
});

describe('LruCache', () => {
  it('set/get round-trip', () => {
    const c = new LruCache<string>(3);
    c.set('a', '1');
    expect(c.get('a')).toBe('1');
  });
  it('miss는 undefined', () => {
    expect(new LruCache<string>(3).get('z')).toBeUndefined();
  });
  it('초과 시 가장 오래된 항목부터 evict', () => {
    const c = new LruCache<string>(2);
    c.set('a', '1');
    c.set('b', '2');
    c.set('c', '3');
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe('2');
  });
  it('get은 LRU 순서 갱신', () => {
    const c = new LruCache<string>(2);
    c.set('a', '1');
    c.set('b', '2');
    c.get('a');
    c.set('c', '3');
    expect(c.get('a')).toBe('1');
    expect(c.get('b')).toBeUndefined();
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `cd extension && pnpm test cache`
Expected: `Cannot find module './cache'`

- [ ] **Step 5: 구현 — `extension/lib/cache.ts`**

```typescript
import type { TargetLang } from './storage';

export class LruCache<V> {
  private readonly max: number;
  private readonly map = new Map<string, V>();

  constructor(max: number) {
    this.max = max;
  }

  get(k: string): V | undefined {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }

  set(k: string, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

export async function cacheKey(text: string, lang: TargetLang): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex}:${lang}`;
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd extension && pnpm test cache`
Expected: `Tests  6 passed (6)`

- [ ] **Step 7: 커밋**

```bash
git add extension/lib/storage.ts extension/lib/prompts.ts extension/lib/cache.ts extension/lib/cache.test.ts
git commit -m "feat(extension): 설정 storage + 프롬프트 + LRU 캐시 (TDD)"
```

---

## Phase 4 — 번역 core

### Task 10: SSE 파서 (TDD)

**Files:**
- Create: `extension/lib/translate.ts`, `extension/lib/translate.test.ts`

- [ ] **Step 1: 테스트 — `extension/lib/translate.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateStream, TranslateError } from './translate';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('translateStream', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('delta.content 토큰 순서대로 yield', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([
      'data: {"choices":[{"delta":{"content":"안"}}]}\n',
      'data: {"choices":[{"delta":{"content":"녕"}}]}\n',
      'data: [DONE]\n',
    ]));
    const tokens: string[] = [];
    for await (const t of translateStream('hi', 'ko', 'http://x', new AbortController().signal)) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['안', '녕']);
  });

  it('chunk 경계가 라인 중간이어도 정확히 파싱', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([
      'data: {"choices":[{"delta":{"content":"안"}}]}\ndata: {"cho',
      'ices":[{"delta":{"content":"녕"}}]}\n',
      'data: [DONE]\n',
    ]));
    const tokens: string[] = [];
    for await (const t of translateStream('hi', 'ko', 'http://x', new AbortController().signal)) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['안', '녕']);
  });

  it('깨진 JSON 라인은 스킵', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse([
      'data: {not json}\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
      'data: [DONE]\n',
    ]));
    const tokens: string[] = [];
    for await (const t of translateStream('hi', 'ko', 'http://x', new AbortController().signal)) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['ok']);
  });

  it('non-2xx는 TranslateError', async () => {
    fetchMock.mockResolvedValueOnce(new Response('err', { status: 500 }));
    await expect(async () => {
      for await (const _t of translateStream('hi', 'ko', 'http://x', new AbortController().signal)) {
        /* drain */
      }
    }).rejects.toBeInstanceOf(TranslateError);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd extension && pnpm test translate`
Expected: `Cannot find module './translate'`

- [ ] **Step 3: 구현 — `extension/lib/translate.ts`**

```typescript
import { buildRequest } from './prompts';
import type { TargetLang } from './storage';

export class TranslateError extends Error {
  constructor(public readonly status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = 'TranslateError';
  }
}

export async function* translateStream(
  text: string,
  lang: TargetLang,
  endpoint: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const url = `${endpoint.replace(/\/$/, '')}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequest(text, lang)),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new TranslateError(res.status);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // skip malformed line
      }
    }
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd extension && pnpm test translate`
Expected: `Tests  4 passed (4)`

- [ ] **Step 5: 커밋**

```bash
git add extension/lib/translate.ts extension/lib/translate.test.ts
git commit -m "feat(extension): translateStream SSE 파서 (TDD)"
```

---

## Phase 5 — Content script

### Task 11: post-detector (TDD)

**Files:**
- Create: `extension/lib/post-detector.ts`, `extension/lib/post-detector.test.ts`

- [ ] **Step 1: 테스트 — `extension/lib/post-detector.test.ts`**

테스트 픽스처도 `createElement`로 만들어 spec §7.6과 일관.

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import {
  findUnprocessedPosts,
  markProcessed,
  isProcessed,
  extractPostText,
  findPostTextNode,
} from './post-detector';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function makePost(testid: string, postText?: string): HTMLElement {
  const post = document.createElement('div');
  post.setAttribute('data-testid', testid);
  if (postText !== undefined) {
    const t = document.createElement('div');
    t.setAttribute('data-testid', 'postText');
    t.textContent = postText;
    post.appendChild(t);
  }
  document.body.appendChild(post);
  return post;
}

describe('findUnprocessedPosts', () => {
  it('feedItem-by-* testid 매치', () => {
    makePost('feedItem-by-alice', 'hello');
    expect(findUnprocessedPosts(document.body)).toHaveLength(1);
  });

  it('postThreadItem-by-* testid 매치', () => {
    makePost('postThreadItem-by-bob', 'hi');
    expect(findUnprocessedPosts(document.body)).toHaveLength(1);
  });

  it('이미 마킹된 post는 제외', () => {
    const el = makePost('feedItem-by-alice', 'hi');
    markProcessed(el);
    expect(findUnprocessedPosts(document.body)).toHaveLength(0);
    expect(isProcessed(el)).toBe(true);
  });
});

describe('extractPostText', () => {
  it('postText의 trimmed textContent', () => {
    const el = makePost('feedItem-by-alice', '  hello world  ');
    expect(extractPostText(el)).toBe('hello world');
  });

  it('postText 없으면 null', () => {
    const el = makePost('feedItem-by-alice');
    expect(extractPostText(el)).toBeNull();
  });

  it('빈 문자열이면 null', () => {
    const el = makePost('feedItem-by-alice', '   ');
    expect(extractPostText(el)).toBeNull();
  });
});

describe('findPostTextNode', () => {
  it('찾으면 element, 없으면 null', () => {
    const el = makePost('feedItem-by-alice', 'hi');
    expect(findPostTextNode(el)?.getAttribute('data-testid')).toBe('postText');
    const empty = makePost('feedItem-by-bob');
    expect(findPostTextNode(empty)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd extension && pnpm test post-detector`
Expected: 모듈 미존재 실패

- [ ] **Step 3: 구현 — `extension/lib/post-detector.ts`**

```typescript
export const POST_SELECTORS = [
  '[data-testid^="feedItem-by-"]',
  '[data-testid^="postThreadItem-by-"]',
] as const;

const FALLBACK_SELECTOR = 'article[role="article"]';
const PROCESSED_ATTR = 'data-translator-injected';
const POST_TEXT_SELECTOR = '[data-testid="postText"]';

export function findUnprocessedPosts(root: ParentNode): HTMLElement[] {
  const selector = POST_SELECTORS.join(',');
  const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
  if (matches.length === 0) {
    return Array.from(root.querySelectorAll<HTMLElement>(FALLBACK_SELECTOR)).filter(
      (el) => !isProcessed(el),
    );
  }
  return matches.filter((el) => !isProcessed(el));
}

export function isProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(PROCESSED_ATTR);
}

export function markProcessed(el: HTMLElement): void {
  el.setAttribute(PROCESSED_ATTR, '1');
}

export function extractPostText(post: HTMLElement): string | null {
  const node = post.querySelector(POST_TEXT_SELECTOR);
  const text = node?.textContent?.trim() ?? '';
  return text.length > 0 ? text : null;
}

export function findPostTextNode(post: HTMLElement): Element | null {
  return post.querySelector(POST_TEXT_SELECTOR);
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd extension && pnpm test post-detector`
Expected: `Tests  7 passed (7)`

- [ ] **Step 5: 커밋**

```bash
git add extension/lib/post-detector.ts extension/lib/post-detector.test.ts
git commit -m "feat(extension): bsky post detector (testid + fallback) (TDD)"
```

---

### Task 12: inject-ui — Shadow DOM + textContent-only (TDD)

**Files:**
- Create: `extension/styles/inject.css`
- Create: `extension/lib/inject-ui.ts`, `extension/lib/inject-ui.test.ts`

- [ ] **Step 1: `extension/styles/inject.css`**

```css
:host {
  display: block;
  margin-top: 4px;
  font-family: inherit;
}

.row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.trigger {
  background: transparent;
  color: var(--bsky-link, #1185fe);
  font: inherit;
  border: none;
  cursor: pointer;
  padding: 4px 0;
}
.trigger:hover { text-decoration: underline; }

.lang {
  font: inherit;
  background: transparent;
  color: var(--bsky-text, inherit);
  border: 1px solid var(--bsky-border, rgba(0,0,0,0.15));
  border-radius: 6px;
  padding: 2px 6px;
}

.result {
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--bsky-secondary-bg, rgba(0,0,0,0.04));
  border-radius: 8px;
  font-size: 0.95em;
  line-height: 1.5;
  white-space: pre-wrap;
}

.result[data-state="error"] {
  background: var(--bsky-error-bg, rgba(220, 53, 69, 0.08));
  color: var(--bsky-error-text, #b00020);
}

.retry {
  display: inline-block;
  margin-left: 6px;
  color: var(--bsky-link, #1185fe);
  cursor: pointer;
  font: inherit;
  background: transparent;
  border: none;
  padding: 0;
}
.retry:hover { text-decoration: underline; }
```

- [ ] **Step 2: 테스트 — `extension/lib/inject-ui.test.ts`**

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { mountTranslatorUI } from './inject-ui';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function makePostWithText(): HTMLElement {
  const post = document.createElement('div');
  post.setAttribute('data-testid', 'feedItem-by-x');
  const txt = document.createElement('div');
  txt.setAttribute('data-testid', 'postText');
  txt.textContent = 'hello';
  post.appendChild(txt);
  document.body.appendChild(post);
  return post;
}

describe('mountTranslatorUI', () => {
  it('Shadow DOM host를 postText 다음 형제로 삽입', () => {
    const post = makePostWithText();
    const handle = mountTranslatorUI(post);
    const postText = post.querySelector('[data-testid="postText"]') as HTMLElement;
    expect(postText.nextSibling).toBe(handle.host);
    expect(handle.host.shadowRoot).not.toBeNull();
  });

  it('트리거 버튼은 "번역"', () => {
    const handle = mountTranslatorUI(makePostWithText());
    expect(handle.trigger.textContent).toBe('번역');
    expect(handle.trigger.tagName).toBe('BUTTON');
    expect(handle.trigger.getAttribute('type')).toBe('button');
  });

  it('언어 select 옵션: ko/ja/zh', () => {
    const handle = mountTranslatorUI(makePostWithText());
    const values = Array.from(handle.lang.options).map((o) => o.value);
    expect(values).toEqual(['ko', 'ja', 'zh']);
  });

  it('result 박스는 초기에 hidden', () => {
    expect(mountTranslatorUI(makePostWithText()).result.hidden).toBe(true);
  });

  it('appendChunk는 textContent 누적 (HTML 파싱 안 함)', () => {
    const handle = mountTranslatorUI(makePostWithText());
    handle.show();
    handle.appendChunk('hi ');
    handle.appendChunk('<script>x</script>');
    expect(handle.result.textContent).toBe('hi <script>x</script>');
    expect(handle.result.querySelector('script')).toBeNull();
  });

  it('showError는 메시지 + 재시도 버튼', () => {
    const handle = mountTranslatorUI(makePostWithText());
    let clicked = false;
    handle.showError('실패', () => {
      clicked = true;
    });
    const retry = handle.result.querySelector('button.retry') as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    expect(handle.result.dataset.state).toBe('error');
    retry?.click();
    expect(clicked).toBe(true);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd extension && pnpm test inject-ui`
Expected: 모듈 미존재 실패

- [ ] **Step 4: 구현 — `extension/lib/inject-ui.ts`**

```typescript
import { LANG_OPTIONS } from './prompts';
import { findPostTextNode } from './post-detector';
import injectedCss from '../styles/inject.css?raw';

export interface TranslatorHandle {
  host: HTMLElement;
  trigger: HTMLButtonElement;
  lang: HTMLSelectElement;
  result: HTMLDivElement;
  show(): void;
  hide(): void;
  reset(): void;
  appendChunk(chunk: string): void;
  showError(message: string, onRetry: () => void): void;
  destroy(): void;
}

export function mountTranslatorUI(postEl: HTMLElement): TranslatorHandle {
  const host = document.createElement('div');
  host.className = 'flotter-translator-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = injectedCss;
  shadow.appendChild(style);

  const row = document.createElement('div');
  row.className = 'row';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'trigger';
  trigger.textContent = '번역';
  row.appendChild(trigger);

  const lang = document.createElement('select');
  lang.className = 'lang';
  for (const opt of LANG_OPTIONS) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    lang.appendChild(optionEl);
  }
  row.appendChild(lang);

  const result = document.createElement('div') as HTMLDivElement;
  result.className = 'result';
  result.hidden = true;

  shadow.appendChild(row);
  shadow.appendChild(result);

  const textNode = findPostTextNode(postEl);
  if (textNode?.parentNode) {
    textNode.parentNode.insertBefore(host, textNode.nextSibling);
  } else {
    postEl.appendChild(host);
  }

  return {
    host,
    trigger,
    lang,
    result,
    show() {
      result.hidden = false;
    },
    hide() {
      result.hidden = true;
    },
    reset() {
      while (result.firstChild) result.removeChild(result.firstChild);
      result.removeAttribute('data-state');
    },
    appendChunk(chunk: string) {
      result.removeAttribute('data-state');
      result.textContent = (result.textContent ?? '') + chunk;
    },
    showError(message: string, onRetry: () => void) {
      while (result.firstChild) result.removeChild(result.firstChild);
      result.dataset.state = 'error';
      const span = document.createElement('span');
      span.textContent = message;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'retry';
      retry.textContent = '다시 시도';
      retry.addEventListener('click', () => onRetry());
      result.appendChild(span);
      result.appendChild(document.createTextNode(' '));
      result.appendChild(retry);
      result.hidden = false;
    },
    destroy() {
      host.remove();
    },
  };
}

export function setThemeTokens(host: HTMLElement, tokens: Record<string, string>): void {
  for (const [k, v] of Object.entries(tokens)) {
    host.style.setProperty(k, v);
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd extension && pnpm test inject-ui`
Expected: `Tests  6 passed (6)`

- [ ] **Step 6: grep guard 통과 확인**

Run (root): `pnpm lint:dom`
Expected: `✓ unsafe DOM 패턴 없음`

- [ ] **Step 7: 커밋**

```bash
git add extension/lib/inject-ui.ts extension/lib/inject-ui.test.ts extension/styles/inject.css
git commit -m "feat(extension): inject-ui — Shadow DOM + textContent-only (TDD)"
```

---

### Task 13: 테마 토큰 추출

**Files:**
- Create: `extension/lib/theme.ts`, `extension/lib/theme.test.ts`

- [ ] **Step 1: 테스트 — `extension/lib/theme.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { extractBskyTokens } from './theme';

describe('extractBskyTokens', () => {
  it('기본 토큰을 모두 반환', () => {
    const t = extractBskyTokens();
    expect(t['--bsky-link']).toBeTruthy();
    expect(t['--bsky-text']).toBeTruthy();
    expect(t['--bsky-border']).toBeTruthy();
    expect(t['--bsky-secondary-bg']).toBeTruthy();
    expect(t['--bsky-error-bg']).toBeTruthy();
    expect(t['--bsky-error-text']).toBeTruthy();
  });
});
```

- [ ] **Step 2: 구현 — `extension/lib/theme.ts`**

```typescript
export function extractBskyTokens(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const colorScheme = cs.colorScheme || '';
  const prefersDark =
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  const isDark = colorScheme.includes('dark') || prefersDark;

  return {
    '--bsky-link': '#1185fe',
    '--bsky-text': cs.color || (isDark ? '#e7e9ea' : '#0f1419'),
    '--bsky-border': isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
    '--bsky-secondary-bg': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    '--bsky-error-bg': 'rgba(220, 53, 69, 0.08)',
    '--bsky-error-text': isDark ? '#ff6b81' : '#b00020',
  };
}
```

- [ ] **Step 3: 통과 확인**

Run: `cd extension && pnpm test theme`
Expected: `Tests  1 passed (1)`

- [ ] **Step 4: 커밋**

```bash
git add extension/lib/theme.ts extension/lib/theme.test.ts
git commit -m "feat(extension): bsky 테마 토큰 추출 (다크/라이트 자동)"
```

---

### Task 14: content.ts 와이어링

**Files:**
- Modify: `extension/entrypoints/content.ts`
- Create: `extension/lib/nmh-client-content.ts` (placeholder, Task 16에서 실구현)
- Create: `extension/lib/concurrency.ts`, `extension/lib/concurrency.test.ts`

- [ ] **Step 1: 동시성 cap 테스트 — `extension/lib/concurrency.test.ts`**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { Semaphore } from './concurrency';

describe('Semaphore', () => {
  it('cap 만큼만 동시 실행 허용', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 5 }, () => async () => {
      const release = await sem.acquire();
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      release();
    });
    await Promise.all(tasks.map((t) => t()));
    expect(peak).toBe(2);
  });

  it('대기 중인 작업은 release 후 풀림', async () => {
    const sem = new Semaphore(1);
    const r1 = await sem.acquire();
    let resolved = false;
    const p = sem.acquire().then((r) => {
      resolved = true;
      r();
    });
    expect(resolved).toBe(false);
    r1();
    await p;
    expect(resolved).toBe(true);
  });
});
```

- [ ] **Step 2: 구현 — `extension/lib/concurrency.ts`**

```typescript
export class Semaphore {
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly cap: number) {}

  async acquire(): Promise<() => void> {
    if (this.inFlight < this.cap) {
      this.inFlight += 1;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.inFlight += 1;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.inFlight -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}
```

- [ ] **Step 3: 통과 확인**

Run: `cd extension && pnpm test concurrency`
Expected: `Tests  2 passed (2)`

- [ ] **Step 4: `extension/lib/nmh-client-content.ts` placeholder**

```typescript
export async function ensureServerReady(): Promise<void> {
  // Task 16에서 background 메시지로 교체
  return;
}
```

- [ ] **Step 5: `extension/entrypoints/content.ts` 작성**

```typescript
import { translateStream, TranslateError } from '@/lib/translate';
import { LruCache, cacheKey } from '@/lib/cache';
import { findUnprocessedPosts, markProcessed, extractPostText } from '@/lib/post-detector';
import { mountTranslatorUI, setThemeTokens, type TranslatorHandle } from '@/lib/inject-ui';
import { extractBskyTokens } from '@/lib/theme';
import { loadSettings, onSettingsChange, type TargetLang } from '@/lib/storage';
import { ensureServerReady } from '@/lib/nmh-client-content';
import { Semaphore } from '@/lib/concurrency';

export default defineContentScript({
  matches: ['https://bsky.app/*'],
  runAt: 'document_idle',
  async main() {
    let settings = await loadSettings();
    const mounted = new Map<HTMLElement, TranslatorHandle>();
    onSettingsChange((s) => {
      settings = s;
      for (const h of mounted.values()) {
        h.lang.value = s.targetLang;
        h.lang.style.display = s.showLanguagePicker ? '' : 'none';
      }
    });

    const cache = new LruCache<string>(200);
    const sem = new Semaphore(4);

    function attach(post: HTMLElement): void {
      const text = extractPostText(post);
      if (!text) return;
      markProcessed(post);

      const handle = mountTranslatorUI(post);
      setThemeTokens(handle.host, extractBskyTokens());
      handle.lang.value = settings.targetLang;
      handle.lang.style.display = settings.showLanguagePicker ? '' : 'none';
      mounted.set(post, handle);

      let abortCtl: AbortController | null = null;
      let acc = '';
      let visible = false;
      let activeLang: TargetLang = settings.targetLang;

      async function runTranslate(): Promise<void> {
        const langValue = handle.lang.value as TargetLang;
        activeLang = langValue;
        handle.reset();
        handle.show();
        visible = true;

        const key = await cacheKey(text, langValue);
        const cached = cache.get(key);
        if (cached) {
          handle.appendChunk(cached);
          handle.trigger.textContent = '번역 숨기기';
          return;
        }

        abortCtl?.abort();
        abortCtl = new AbortController();
        const signal = abortCtl.signal;

        const release = await sem.acquire();
        const hangTimer = setTimeout(() => {
          if (acc.length === 0) handle.appendChunk('응답 지연 중...');
        }, 10_000);

        try {
          await ensureServerReady();
          acc = '';
          for await (const chunk of translateStream(text, langValue, settings.apfelEndpoint, signal)) {
            if (acc.length === 0) handle.reset();
            acc += chunk;
            handle.appendChunk(chunk);
          }
          if (acc.length > 0) cache.set(key, acc);
          handle.trigger.textContent = '번역 숨기기';
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          const msg =
            e instanceof TranslateError
              ? `번역 실패 — HTTP ${e.status}.`
              : e instanceof Error
                ? `번역 실패 — ${e.message}.`
                : '번역 실패.';
          handle.showError(msg, () => void runTranslate());
        } finally {
          clearTimeout(hangTimer);
          release();
        }
      }

      handle.trigger.addEventListener('click', () => {
        if (visible) {
          handle.hide();
          handle.trigger.textContent = '번역';
          visible = false;
          abortCtl?.abort();
          return;
        }
        void runTranslate();
      });

      handle.lang.addEventListener('change', () => {
        const next = handle.lang.value as TargetLang;
        if (next === activeLang) return;
        void runTranslate();
      });
    }

    function scan(root: ParentNode): void {
      for (const post of findUnprocessedPosts(root)) {
        try {
          attach(post);
        } catch (e) {
          console.warn('[bsky-translator] attach failed', e);
        }
      }
    }

    scan(document.body);

    const idleSchedule =
      (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 0));

    const observer = new MutationObserver((records) => {
      idleSchedule(() => {
        for (const r of records) {
          for (const node of r.addedNodes) {
            if (node instanceof HTMLElement) scan(node);
          }
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      if (mounted.size === 0) {
        console.warn('[bsky-translator] no posts detected after 30s; selectors may need update');
      }
    }, 30_000);
  },
});
```

- [ ] **Step 6: 타입 체크 + 빌드 + grep guard**

```bash
cd extension && pnpm typecheck && pnpm build
cd .. && pnpm lint:dom
```

Expected: 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add extension/entrypoints/content.ts extension/lib/nmh-client-content.ts extension/lib/concurrency.ts extension/lib/concurrency.test.ts
git commit -m "feat(extension): content script 와이어링 (클릭→스트리밍→렌더, 동시성 cap 4)"
```

---

## Phase 6 — Background + NMH 브릿지

### Task 15: nmh-client (background)

**Files:**
- Create: `extension/lib/nmh-client.ts`

- [ ] **Step 1: 작성 — `extension/lib/nmh-client.ts`**

```typescript
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
```

- [ ] **Step 2: 타입 체크**

Run: `cd extension && pnpm typecheck`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add extension/lib/nmh-client.ts
git commit -m "feat(extension): background-side NMH client (status TTL 캐시)"
```

---

### Task 16: background.ts 라우터 + content client 실구현

**Files:**
- Modify: `extension/entrypoints/background.ts`
- Modify: `extension/lib/nmh-client-content.ts`

- [ ] **Step 1: `extension/entrypoints/background.ts`**

```typescript
import { send } from '@/lib/nmh-client';
import { isLocalEndpoint, loadSettings } from '@/lib/storage';
import type { Request, Response } from '../../host/src/types';

export default defineBackground({
  main() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        void chrome.runtime.openOptionsPage();
      }
    });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      void handle(msg as BgMessage).then(sendResponse);
      return true; // async response
    });
  },
});

interface BgMessage {
  kind: 'nmh' | 'ensure_ready';
  payload?: Request;
}

type BgReply = Response | { ok: true } | { ok: false; error: string };

async function handle(msg: BgMessage): Promise<BgReply> {
  try {
    if (msg.kind === 'nmh' && msg.payload) {
      return await send(msg.payload);
    }
    if (msg.kind === 'ensure_ready') {
      const settings = await loadSettings();
      if (!isLocalEndpoint(settings.apfelEndpoint)) return { ok: true };
      const res = await send({ type: 'ensure_running' });
      if (res.type === 'error') return { ok: false, error: res.message };
      return { ok: true };
    }
    return { ok: false, error: 'unknown message kind' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 2: `extension/lib/nmh-client-content.ts` 실구현**

```typescript
interface EnsureResponse {
  ok: boolean;
  error?: string;
}

export async function ensureServerReady(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ kind: 'ensure_ready' })) as EnsureResponse;
  if (!res?.ok) {
    throw new Error(res?.error ?? 'NMH ensure_ready 실패');
  }
}
```

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `cd extension && pnpm typecheck && pnpm build`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add extension/entrypoints/background.ts extension/lib/nmh-client-content.ts
git commit -m "feat(extension): background NMH 라우터 + onInstalled 옵션 자동 오픈"
```

---

## Phase 7 — 옵션 페이지

### Task 17: 옵션 페이지 (React)

**Files:**
- Create: `extension/entrypoints/options/index.html`
- Create: `extension/entrypoints/options/main.tsx`
- Create: `extension/entrypoints/options/App.tsx`
- Create: `extension/entrypoints/options/styles.css`
- Create: `extension/entrypoints/options/components/LanguageSelector.tsx`
- Create: `extension/entrypoints/options/components/EndpointEditor.tsx`
- Create: `extension/entrypoints/options/components/AutoRestartToggle.tsx`
- Create: `extension/entrypoints/options/components/ServerStatus.tsx`

- [ ] **Step 1: `index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>Bluesky Translator — 설정</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `styles.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #0f1419;
  --muted: #5b6471;
  --link: #1185fe;
  --card: rgba(0,0,0,0.04);
  --border: rgba(0,0,0,0.1);
  --error: #b00020;
  --ok: #2a8c3f;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15181c;
    --fg: #e7e9ea;
    --muted: #8b98a5;
    --card: rgba(255,255,255,0.06);
    --border: rgba(255,255,255,0.12);
  }
}
* { box-sizing: border-box; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  margin: 0;
  padding: 32px;
}
.container { max-width: 720px; margin: 0 auto; }
h1 { margin-top: 0; }
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}
.card h2 { margin: 0 0 12px; font-size: 1.1em; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field label { color: var(--muted); font-size: 0.9em; }
select, input[type="text"] {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
button {
  background: var(--link);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
}
button.ghost {
  background: transparent;
  color: var(--link);
  border: 1px solid var(--border);
}
.row { display: flex; gap: 8px; align-items: center; }
.muted { color: var(--muted); font-size: 0.9em; }
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
}
.status-dot.ok { background: var(--ok); }
.status-dot.bad { background: var(--error); }
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 6px;
}
```

- [ ] **Step 3: `main.tsx`**

```typescript
import { createRoot } from 'react-dom/client';
import { App } from './App';

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
```

- [ ] **Step 4: `components/LanguageSelector.tsx`**

```typescript
import type { TargetLang } from '@/lib/storage';
import { LANG_OPTIONS } from '@/lib/prompts';

interface Props {
  value: TargetLang;
  onChange: (v: TargetLang) => void;
}

export function LanguageSelector({ value, onChange }: Props) {
  return (
    <div className="field">
      <label htmlFor="lang">번역 대상 언어</label>
      <select
        id="lang"
        value={value}
        onChange={(e) => onChange(e.target.value as TargetLang)}
      >
        {LANG_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 5: `components/EndpointEditor.tsx`**

```typescript
import { useState } from 'react';
import { DEFAULT_SETTINGS } from '@/lib/storage';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function EndpointEditor({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="field">
      <label htmlFor="endpoint">apfel 엔드포인트</label>
      <div className="row">
        <input
          id="endpoint"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onChange(draft)}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setDraft(DEFAULT_SETTINGS.apfelEndpoint);
            onChange(DEFAULT_SETTINGS.apfelEndpoint);
          }}
        >
          기본값으로
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `components/AutoRestartToggle.tsx`**

```typescript
import { isLocalEndpoint } from '@/lib/storage';

interface Props {
  value: boolean;
  endpoint: string;
  onChange: (v: boolean) => void;
}

export function AutoRestartToggle({ value, endpoint, onChange }: Props) {
  const local = isLocalEndpoint(endpoint);
  return (
    <div className="field">
      <label>
        <input
          type="checkbox"
          checked={value && local}
          disabled={!local}
          onChange={(e) => onChange(e.target.checked)}
        />{' '}
        apfel 서버가 죽으면 자동으로 다시 시작
      </label>
      {!local && <span className="muted">원격 엔드포인트에서는 적용되지 않습니다.</span>}
    </div>
  );
}
```

- [ ] **Step 7: `components/ServerStatus.tsx`**

```typescript
import { useEffect, useState } from 'react';

interface StatusInfo {
  running: boolean;
  pid?: number;
  port?: number;
  version?: string;
  error?: string;
}

interface Props {
  endpointIsLocal: boolean;
}

interface NmhResponse {
  type?: 'status' | 'error';
  running?: boolean;
  pid?: number;
  port?: number;
  version?: string;
  message?: string;
}

export function ServerStatus({ endpointIsLocal }: Props) {
  const [info, setInfo] = useState<StatusInfo>({ running: false });

  useEffect(() => {
    if (!endpointIsLocal) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = (await chrome.runtime.sendMessage({
          kind: 'nmh',
          payload: { type: 'status' },
        })) as NmhResponse;
        if (cancelled) return;
        if (res?.type === 'status') {
          setInfo({
            running: !!res.running,
            pid: res.pid,
            port: res.port,
            version: res.version,
          });
        } else if (res?.type === 'error') {
          setInfo({ running: false, error: res.message });
        }
      } catch (e) {
        if (!cancelled) setInfo({ running: false, error: String(e) });
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [endpointIsLocal]);

  async function restart() {
    await chrome.runtime.sendMessage({ kind: 'nmh', payload: { type: 'restart' } });
  }
  async function shutdown() {
    await chrome.runtime.sendMessage({ kind: 'nmh', payload: { type: 'shutdown' } });
  }

  if (!endpointIsLocal) {
    return (
      <div className="card">
        <h2>Server status</h2>
        <p className="muted">원격 엔드포인트 사용 중 — 로컬 NMH가 관리하지 않습니다.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Server status</h2>
      {info.error ? (
        <p>
          <span className="status-dot bad" />
          {info.error.includes('apfel_not_installed') ? (
            <>
              apfel이 설치되지 않았습니다. <span className="code">brew install apfel</span>
            </>
          ) : (
            <>오류: {info.error}</>
          )}
        </p>
      ) : info.running ? (
        <p>
          <span className="status-dot ok" />
          실행 중 {info.pid ? `(PID ${info.pid}, port ${info.port})` : ''}
        </p>
      ) : (
        <p>
          <span className="status-dot bad" />
          중지됨
        </p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" onClick={() => void restart()}>
          재시작
        </button>
        <button type="button" className="ghost" onClick={() => void shutdown()}>
          종료
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: `App.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { loadSettings, saveSettings, isLocalEndpoint, type Settings } from '@/lib/storage';
import { LanguageSelector } from './components/LanguageSelector';
import { EndpointEditor } from './components/EndpointEditor';
import { AutoRestartToggle } from './components/AutoRestartToggle';
import { ServerStatus } from './components/ServerStatus';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!settings) return;
    setSettings({ ...settings, ...p });
    await saveSettings(p);
  }

  if (!settings) return <div className="container">불러오는 중...</div>;

  return (
    <div className="container">
      <h1>Bluesky Translator</h1>

      <div className="card">
        <h2>⚙ Settings</h2>
        <LanguageSelector
          value={settings.targetLang}
          onChange={(v) => void patch({ targetLang: v })}
        />
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.showLanguagePicker}
              onChange={(e) => void patch({ showLanguagePicker: e.target.checked })}
            />{' '}
            게시물 옆에 ▾ 드롭다운 표시
          </label>
        </div>
        <EndpointEditor
          value={settings.apfelEndpoint}
          onChange={(v) => void patch({ apfelEndpoint: v })}
        />
        <AutoRestartToggle
          value={settings.autoRestartServer}
          endpoint={settings.apfelEndpoint}
          onChange={(v) => void patch({ autoRestartServer: v })}
        />
      </div>

      <ServerStatus endpointIsLocal={isLocalEndpoint(settings.apfelEndpoint)} />

      <p className="muted">
        ※ apfel이 미설치면 터미널에서 <span className="code">brew install apfel</span> 실행 후
        이 페이지를 새로고침하세요.
      </p>
    </div>
  );
}
```

- [ ] **Step 9: 타입 체크 + 빌드 + grep guard**

```bash
cd extension && pnpm typecheck && pnpm build
cd .. && pnpm lint:dom
```

Expected: 모두 통과, `extension/.output/chrome-mv3/options.html` 존재

- [ ] **Step 10: 커밋**

```bash
git add extension/entrypoints/options/
git commit -m "feat(extension): 옵션 페이지 — 설정 + 서버 상태/제어"
```

---

## Phase 8 — Install / Doctor / Uninstall / CI / Docs

### Task 18: install.sh + doctor.sh

**Files:**
- Create: `install.sh`
- Create: `scripts/doctor.sh`

- [ ] **Step 1: `install.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${BMT_REPO_URL:-https://github.com/flotter-atlas/bluesky-mac-translator.git}"
INSTALL_DIR="$HOME/Library/Application Support/flotter-bsky-translator"
SRC_DIR="$INSTALL_DIR/src"
LOG_DIR="$HOME/Library/Logs/flotter-bsky-translator"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.flotter.bsky_translator"

green() { printf "\033[1;32m%s\033[0m\n" "$*"; }
red()   { printf "\033[1;31m%s\033[0m\n" "$*"; }
step()  { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }

step "1/7  사전 점검"
[ "$(uname -s)" = "Darwin" ] || { red "macOS 전용입니다."; exit 1; }
if [ "$(uname -m)" != "arm64" ]; then
  red "경고: Apple Silicon이 아닙니다. apfel은 Apple Silicon 전용."
fi
mkdir -p "$INSTALL_DIR" "$LOG_DIR" "$NMH_DIR"

step "2/7  의존성 설치"
if ! command -v brew >/dev/null 2>&1; then
  red "Homebrew가 필요합니다: https://brew.sh"
  exit 1
fi
command -v apfel >/dev/null 2>&1 || brew install apfel
command -v node  >/dev/null 2>&1 || brew install node
command -v pnpm  >/dev/null 2>&1 || npm install -g pnpm@9.12.0

step "3/7  repo clone / update"
if [ -d "$SRC_DIR/.git" ]; then
  git -C "$SRC_DIR" pull --ff-only
else
  rm -rf "$SRC_DIR"
  git clone "$REPO_URL" "$SRC_DIR"
fi

step "4/7  빌드"
( cd "$SRC_DIR" && pnpm install --frozen-lockfile && pnpm build )
rm -rf "$INSTALL_DIR/host" "$INSTALL_DIR/extension"
cp -R "$SRC_DIR/host/dist"                    "$INSTALL_DIR/host"
cp -R "$SRC_DIR/extension/.output/chrome-mv3" "$INSTALL_DIR/extension"

step "5/7  host-launcher.sh"
NODE_BIN="$(command -v node)"
cat > "$INSTALL_DIR/host-launcher.sh" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$INSTALL_DIR/host/index.js" "\$@"
EOF
chmod +x "$INSTALL_DIR/host-launcher.sh"

step "6/7  Chrome unpacked 로드 + Extension ID 입력"
echo
echo "1. Chrome에서 chrome://extensions 열기"
echo "2. 우측 상단 '개발자 모드' ON"
echo "3. '압축해제된 확장 프로그램 로드' 클릭 후 다음 경로 선택:"
echo "     $INSTALL_DIR/extension"
echo "4. 표시된 ID (32자리 a-z)를 아래에 붙여넣으세요:"
read -r -p "Extension ID: " EXT_ID
if ! [[ "$EXT_ID" =~ ^[a-z]{32}$ ]]; then
  red "ID 형식이 올바르지 않습니다 (a-z 32자)."
  exit 1
fi

cat > "$NMH_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Bluesky Translator Host (manages apfel server)",
  "path": "$INSTALL_DIR/host-launcher.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

step "7/7  검증"
"$SRC_DIR/scripts/doctor.sh"

green ""
green "✓ 설치 완료. https://bsky.app/ 을 새로고침하세요."
green "  옵션 페이지: chrome-extension://$EXT_ID/options.html"
```

```bash
chmod +x install.sh
```

- [ ] **Step 2: `scripts/doctor.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/flotter-bsky-translator"
LOG_DIR="$HOME/Library/Logs/flotter-bsky-translator"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.flotter.bsky_translator"

ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*"; FAILED=1; }

FAILED=0
echo "Bluesky Translator 진단"

command -v apfel >/dev/null 2>&1 && ok "apfel 설치됨" || fail "apfel 미설치 (brew install apfel)"
command -v node  >/dev/null 2>&1 && ok "node 설치됨: $(node --version)" || fail "node 미설치"

[ -d "$INSTALL_DIR/host" ]           && ok "host dist 존재" || fail "host dist 없음 ($INSTALL_DIR/host)"
[ -d "$INSTALL_DIR/extension" ]      && ok "extension dist 존재" || fail "extension dist 없음"
[ -x "$INSTALL_DIR/host-launcher.sh" ] && ok "host-launcher.sh 실행 가능" || fail "host-launcher.sh 없음/실행 불가"
[ -f "$NMH_DIR/$HOST_NAME.json" ]    && ok "NMH manifest 존재" || fail "NMH manifest 없음"
[ -d "$LOG_DIR" ]                    && ok "로그 디렉토리 OK" || fail "로그 디렉토리 없음"

if command -v curl >/dev/null 2>&1; then
  if curl -fsS -m 1 http://127.0.0.1:11434/v1/models >/dev/null 2>&1; then
    ok "apfel --serve 응답 OK (port 11434)"
  else
    echo "  ⓘ apfel --serve 미응답 (다음 번역 시 NMH가 자동 spawn)"
  fi
fi

exit "$FAILED"
```

```bash
mkdir -p scripts && chmod +x scripts/doctor.sh
```

- [ ] **Step 3: 셸 syntax 검증**

Run: `bash -n install.sh && bash -n scripts/doctor.sh`
Expected: 출력 없음 (정상)

- [ ] **Step 4: 커밋**

```bash
git add install.sh scripts/doctor.sh
git commit -m "feat(install): install.sh 7단계 + doctor.sh 진단"
```

---

### Task 19: uninstall.sh

**Files:**
- Create: `uninstall.sh`

- [ ] **Step 1: 작성**

```bash
#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/flotter-bsky-translator"
LOG_DIR="$HOME/Library/Logs/flotter-bsky-translator"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.flotter.bsky_translator"

echo "Bluesky Translator 제거"
echo
read -r -p "정말 제거하시겠습니까? [y/N] " ans
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || exit 0

pkill -f 'apfel.*--serve' || true
rm -f "$NMH_DIR/$HOST_NAME.json"
rm -rf "$INSTALL_DIR" "$LOG_DIR"

echo
read -r -p "apfel도 brew uninstall 하시겠습니까? [y/N] " ans2
if [ "$ans2" = "y" ] || [ "$ans2" = "Y" ]; then
  brew uninstall apfel || true
fi

echo
echo "✓ 제거 완료. Chrome에서 'Bluesky Translator' 확장을 수동으로 제거하세요."
```

```bash
chmod +x uninstall.sh
```

- [ ] **Step 2: syntax 검증**

Run: `bash -n uninstall.sh`
Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add uninstall.sh
git commit -m "feat(install): uninstall.sh"
```

---

### Task 20: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 작성**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Unsafe DOM guard
        run: pnpm lint:dom

      - name: Test
        run: pnpm test

      - name: Build extension
        run: pnpm --filter @flotter/bsky-translator-extension build

      - name: Build host
        run: pnpm --filter @flotter/bsky-translator-host build

      - name: Shell syntax check
        run: |
          bash -n install.sh
          bash -n uninstall.sh
          bash -n scripts/doctor.sh
          bash -n scripts/check-unsafe-dom.sh
```

- [ ] **Step 2: 커밋**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: macos-latest에서 typecheck/lint/test/build/shell-check"
```

---

### Task 21: README + 스모크 + 트러블슈팅

**Files:**
- Create: `README.md`
- Create: `docs/SMOKE.md`
- Create: `docs/TROUBLESHOOTING.md`

- [ ] **Step 1: `README.md`**

````markdown
# Bluesky Mac Translator

bsky.app 게시물을 macOS 내장 LLM(apfel)으로 한국어/일본어/중국어로 빠르게 번역하는 Chrome extension.
사내 전용. 토큰 비용 0, 외부 네트워크 호출 없음.

## 설치

```bash
curl -fsSL https://raw.githubusercontent.com/flotter-atlas/bluesky-mac-translator/main/install.sh | bash
```

요구사항: macOS Tahoe + Apple Silicon + Apple Intelligence 활성, Homebrew, Chrome.

설치 흐름:
1. apfel/node/pnpm 자동 설치
2. repo clone + 빌드
3. `~/Library/Application Support/flotter-bsky-translator/`로 산출물 배치
4. Chrome 개발자 모드에서 unpacked 로드 → ID 입력
5. 자동 진단(`doctor.sh`)

## 사용

1. https://bsky.app/ 새로고침
2. 게시물 텍스트 아래 **번역** 링크 클릭
3. 첫 토큰 1초 이내 스트리밍 시작
4. 다시 클릭하면 접힘

옵션 페이지에서: 기본 언어, ▾ 드롭다운 on/off, 엔드포인트 변경, 서버 상태/재시작/종료.

## 업데이트

```bash
~/Library/Application\ Support/flotter-bsky-translator/src/install.sh
```

Chrome에서 확장 "새로고침" 클릭.

## 제거

```bash
~/Library/Application\ Support/flotter-bsky-translator/src/uninstall.sh
```

## 개발

```bash
pnpm install
pnpm -F @flotter/bsky-translator-extension dev   # WXT HMR
pnpm -F @flotter/bsky-translator-host build
pnpm check                                       # typecheck + lint + lint:dom + test
```

## 문서

- 설계: [docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md](docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md)
- 트러블슈팅: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- 릴리스 스모크: [docs/SMOKE.md](docs/SMOKE.md)
````

- [ ] **Step 2: `docs/SMOKE.md`**

```markdown
# 릴리스 스모크 체크리스트

릴리스 전 5분 체크.

1. [ ] fresh 머신 (또는 uninstall 후) `install.sh` 실행 → 7단계 모두 OK
2. [ ] Chrome unpacked 로드 → 옵션 페이지 자동 오픈
3. [ ] bsky.app 새로고침 → 피드 첫 5개 post 아래 "번역" 링크 보임
4. [ ] 클릭 → 1초 이내 첫 토큰 표시
5. [ ] 재클릭 → 캐시 hit (즉시 표시)
6. [ ] 옵션에서 ja로 변경 → 새 post 번역 시 일본어
7. [ ] post의 ▾로 zh 변경 → 해당 post만 중국어
8. [ ] `pkill apfel` → 다음 번역 시 자동 재시작 후 정상
9. [ ] extension 리로드 → 정상 복귀
10. [ ] extension 비활성화 → 주입 링크 사라짐
11. [ ] XSS 테스트: post 본문에 `<img src=x onerror=alert(1)>` 텍스트 → 번역 박스에 텍스트로만 표시
12. [ ] endpoint를 빈 포트로 변경 → 번역 시 에러 + 재시도 버튼
```

- [ ] **Step 3: `docs/TROUBLESHOOTING.md`**

````markdown
# 트러블슈팅

## "번역" 링크가 안 보임

1. `chrome://extensions`에서 확장 활성 확인
2. bsky.app DevTools console에 `[bsky-translator]` 로그 확인
3. `no posts detected` 경고면 bsky가 testid를 바꾼 것 — `lib/post-detector.ts` selectors 업데이트 필요

## "Native host 미설치"

```bash
ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.flotter.bsky_translator.json
```

없으면 `install.sh` 재실행. ID 32자 a-z 정확히 입력.

## "apfel이 설치되지 않았습니다"

```bash
brew install apfel
which apfel
```

## "Apple Intelligence 활성화 필요"

시스템 환경설정 → Apple Intelligence & Siri → ON. macOS Tahoe + Apple Silicon만 가능.

## 번역이 끝없이 hang

```bash
tail -f ~/Library/Logs/flotter-bsky-translator/apfel.log
tail -f ~/Library/Logs/flotter-bsky-translator/host.log
```

`pkill -f 'apfel.*--serve'` 후 옵션에서 [재시작].

## 자세한 로그

- Service worker: chrome://extensions → "서비스 워커 검사"
- Content script: bsky DevTools console
- NMH: `~/Library/Logs/flotter-bsky-translator/host.log`
- apfel: `~/Library/Logs/flotter-bsky-translator/apfel.log`
````

- [ ] **Step 4: 커밋**

```bash
git add README.md docs/SMOKE.md docs/TROUBLESHOOTING.md
git commit -m "docs: README + 스모크 체크리스트 + 트러블슈팅"
```

---

## Phase 9 — 마무리

### Task 22: 전체 통합 검증

- [ ] **Step 1: 자동 검증**

Run (repo root):

```bash
pnpm check
```

Expected: `typecheck`, `lint`, `lint:dom`, `test` 모두 통과

- [ ] **Step 2: 빌드 산출물 확인**

```bash
pnpm build
ls extension/.output/chrome-mv3/
ls host/dist/
```

Expected:
- `manifest.json`, `content-scripts/`, `background.js`, `options.html` 존재
- `host/dist/index.js` 존재

- [ ] **Step 3: 실제 macOS 머신 스모크 테스트**

`./install.sh` 실행 → `docs/SMOKE.md` 1~12번 모두 통과 확인

- [ ] **Step 4: 태그 + push (선택)**

```bash
git tag v0.0.1
git remote add origin git@github.com:flotter-atlas/bluesky-mac-translator.git   # 최초 1회
git push -u origin main
git push origin v0.0.1
```

---

## 부록 — 디렉토리 최종 구조

```
bluesky-mac-translator/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── biome.json
├── .gitignore
├── .node-version
├── install.sh
├── uninstall.sh
├── README.md
│
├── extension/
│   ├── package.json
│   ├── wxt.config.ts
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── entrypoints/
│   │   ├── content.ts
│   │   ├── background.ts
│   │   └── options/
│   │       ├── index.html
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── styles.css
│   │       └── components/
│   │           ├── LanguageSelector.tsx
│   │           ├── EndpointEditor.tsx
│   │           ├── AutoRestartToggle.tsx
│   │           └── ServerStatus.tsx
│   ├── lib/
│   │   ├── storage.ts
│   │   ├── prompts.ts
│   │   ├── cache.ts            (+ .test.ts)
│   │   ├── translate.ts        (+ .test.ts)
│   │   ├── post-detector.ts    (+ .test.ts)
│   │   ├── inject-ui.ts        (+ .test.ts)
│   │   ├── theme.ts            (+ .test.ts)
│   │   ├── concurrency.ts      (+ .test.ts)
│   │   ├── nmh-client.ts
│   │   └── nmh-client-content.ts
│   ├── styles/inject.css
│   └── public/icon/{16,32,48,128}.png
│
├── host/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts
│       ├── types.ts
│       ├── protocol.ts         (+ .test.ts)
│       ├── apfel-manager.ts    (+ .test.ts)
│       ├── restart-gate.ts     (+ .test.ts)
│       ├── which.ts            (+ .test.ts)
│       ├── pidfile.ts
│       └── logger.ts
│
├── scripts/
│   ├── doctor.sh
│   ├── check-unsafe-dom.sh
│   └── unsafe-dom-patterns.txt
│
├── docs/
│   ├── SMOKE.md
│   ├── TROUBLESHOOTING.md
│   └── superpowers/
│       ├── specs/2026-05-13-bluesky-mac-translator-design.md
│       └── plans/2026-05-14-bluesky-mac-translator.md
│
└── .github/workflows/ci.yml
```

---

## 자체 점검 (writing-plans 요구)

**Spec coverage 매핑** (spec 섹션 → plan 태스크):

| Spec | 구현 태스크 |
|---|---|
| §3 시스템 아키텍처 | Task 7, 14, 16 (NMH 메인 / content / background) |
| §4 NMH | Task 3–7 |
| §4.4 NMH manifest | Task 18 (install.sh step 6) |
| §5 Extension 구조 | Task 8, 14, 16, 17 |
| §6.2 prompts | Task 9 |
| §6.3 SSE 파싱 | Task 10 |
| §6.4 캐시 | Task 9 |
| §7.1 post 식별 | Task 11 |
| §7.2 Shadow DOM + safe DOM | Task 12 |
| §7.3 테마 토큰 | Task 13 |
| §7.4 lifecycle (MutationObserver, AbortController) | Task 14 |
| §7.5 성능 가드 | Task 14 |
| §7.6 lint 보안 규칙 | Task 2 (Biome + grep guard) |
| §8 Settings + 옵션 UI | Task 9, 17 |
| §8.5 동시성 cap 4 | Task 14 (`Semaphore`) |
| §8.6 endpoint 모드 분기 | Task 9 (`isLocalEndpoint`), Task 16 (background), Task 17 (UI) |
| §9 에러 처리 | Task 12 (`showError`), Task 14 (catch), Task 17 (옵션 안내) |
| §10 install/uninstall | Task 18, 19 |
| §11.1 자동 테스트 | Task 3, 5, 6, 9, 10, 11, 12, 13, 14, 20 |
| §11.3 smoke | Task 21, 22 |
| §11.4 CI | Task 20 |
| §11.5 디버깅 | Task 21 |

빠진 spec 요구사항 없음을 확인.

**Placeholder 스캔**: TBD/TODO/"적절한 에러 처리" 등 없음. 모든 step에 실코드/실명령 포함.

**타입 일관성**: `Request`/`Response`/`ErrorCode`는 `host/src/types.ts`에서 단일 source. extension 측은 path import. `TargetLang`은 `extension/lib/storage.ts`에서 정의 후 일관 사용.

**스코프**: 단일 통합 시스템 (extension + host + install). 단일 plan으로 적절.
