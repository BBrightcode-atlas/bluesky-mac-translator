# Claude CLI 백엔드 + 답글 작성 번역 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** apfel 백엔드를 `claude` CLI로 교체하고, 답글 작성 박스에 "번역" 미리보기 UI를 추가한다.

**Architecture:** content script → background (NMH 직렬화 + LRU 캐시) → NMH host (요청당 `claude -p ... --output-format stream-json` spawn) → claude CLI. 답글 번역은 LLM에게 "원 포스트의 언어로 번역" 지시를 한 프롬프트에 담아 한 번에 처리.

**Tech Stack:** TypeScript, WXT, React (옵션 페이지), vitest + happy-dom, Node 20+ (host), `child_process.spawn`, Chrome Native Messaging.

**Reference spec:** [`docs/superpowers/specs/2026-05-15-claude-cli-backend-and-reply-translation-design.md`](../specs/2026-05-15-claude-cli-backend-and-reply-translation-design.md)

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `host/src/types.ts` | modify | `Request`/`Response` 타입을 translate/diagnose 로 갱신 |
| `host/src/claude-spawn.ts` | **create** | `claude -p ... --output-format stream-json` spawn + NDJSON 파싱 + chunk emit |
| `host/src/claude-spawn.test.ts` | **create** | spawn mock 기반 단위 테스트 |
| `host/src/claude-stream-parser.ts` | **create** | stream-json NDJSON 한 줄 → text delta 추출 (순수 함수) |
| `host/src/claude-stream-parser.test.ts` | **create** | fixture 라인 → 기대 delta 검증 |
| `host/src/index.ts` | modify | apfel 로직 제거, request → `claude-spawn`로 dispatch, response 스트리밍 |
| `host/src/apfel-manager.ts` | **delete** | apfel HTTP server lifecycle (불필요) |
| `host/src/apfel-manager.test.ts` | **delete** | 같이 삭제 |
| `host/src/restart-gate.ts` | **delete** | apfel restart 디바운스 (불필요) |
| `host/src/restart-gate.test.ts` | **delete** | 같이 삭제 |
| `host/src/which.ts` | unchanged | `whichInPath('claude')`에 재사용 |
| `host/src/pidfile.ts` | unchanged | 단일 host instance 가드 — 유지 |
| `host/src/protocol.ts` | unchanged | NMH length-prefixed JSON encode/decode |
| `host/src/logger.ts` | unchanged | stderr 로깅 |
| `extension/lib/storage.ts` | modify | `apfelEndpoint`, `autoRestartServer`, `isLocalEndpoint` 제거 |
| `extension/lib/translate.ts` | **delete** | HTTP fetch → background NMH 단일 채널로 통합 |
| `extension/lib/translate.test.ts` | **delete** | 같이 삭제 |
| `extension/lib/nmh-client.ts` | modify | `Request`/`Response` 타입 갱신; status caching 제거; translate 전용 stream API |
| `extension/lib/nmh-client-content.ts` | **delete** | content는 `chrome.runtime.sendMessage` 만 사용 |
| `extension/lib/prompts.ts` | modify | `buildPostPrompt`, `buildReplyPrompt` 두 함수 + 새 시스템 지시 |
| `extension/lib/prompts.test.ts` | **create** | snapshot 기반 단위 테스트 |
| `extension/lib/compose-detector.ts` | **create** | reply compose 박스 + 인용 원 포스트 탐지 |
| `extension/lib/compose-detector.test.ts` | **create** | DOM fixture 단위 테스트 |
| `extension/lib/inject-reply-ui.ts` | **create** | compose 옆 Shadow DOM 미리보기 UI 마운트 |
| `extension/lib/inject-reply-ui.test.ts` | **create** | 단위 테스트 |
| `extension/entrypoints/background.ts` | modify | `kind:'translate'` dispatch + LRU 캐시 + chunk relay |
| `extension/entrypoints/background.test.ts` | **create** | message dispatch + cache hit/miss 단위 테스트 |
| `extension/entrypoints/content.ts` | modify | post + compose 양쪽 스캔, translate 호출은 sendMessage 단일 경로 |
| `extension/entrypoints/options/App.tsx` | modify | `EndpointEditor`/`AutoRestartToggle`/`ServerStatus` 제거, `ClaudeStatus` 추가 |
| `extension/entrypoints/options/components/EndpointEditor.tsx` | **delete** | endpoint 편집 UI 불필요 |
| `extension/entrypoints/options/components/AutoRestartToggle.tsx` | **delete** | 자동 재시작 토글 불필요 |
| `extension/entrypoints/options/components/ServerStatus.tsx` | **delete** | apfel 서버 상태 카드 불필요 |
| `extension/entrypoints/options/components/ClaudeStatus.tsx` | **create** | which/version/login 진단 카드 |
| `extension/entrypoints/options/components/LanguageSelector.tsx` | unchanged | 게시글 번역 대상 언어 선택 |
| `extension/wxt.config.ts` | modify | `host_permissions`에서 `http://127.0.0.1:11434/*` 제거; description 갱신 |
| `extension/lib/cache.ts` | unchanged | background에서 import |
| `extension/lib/post-detector.ts` | unchanged | post 탐지 그대로 |
| `extension/lib/inject-ui.ts` | unchanged | post용 UI 그대로 (host stopPropagation 이미 적용) |
| `install.sh` | modify | apfel 설치 단계 → claude 확인 단계 |
| `scripts/doctor.sh` | modify | apfel 점검 → claude 점검 |
| `uninstall.sh` | modify | apfel 관련 정리 제거 |
| `README.md` | modify | 백엔드 설명 + 답글 번역 사용법 |

---

## Phase 1 — Host: claude CLI 통합 (TDD)

apfel 의존성을 host에서 먼저 들어낸다. extension 쪽은 잠시 깨지지만 host 단위 테스트로 회귀 확인.

### Task 1: stream-json 파서 (순수 함수, 가장 안쪽부터)

**Files:**
- Create: `host/src/claude-stream-parser.ts`
- Test: `host/src/claude-stream-parser.test.ts`

claude의 `--output-format stream-json` 은 NDJSON으로 메시지 이벤트 시퀀스를 emit한다. 정확한 스키마는 구현 시 1회 실측(아래 Step 1)으로 fixture를 만든다. 파서는 한 줄을 받아 text delta(있으면) 를 반환하는 순수 함수.

- [ ] **Step 1: 실측으로 fixture 캡처**

터미널에서 다음 실행 후 출력 5–10줄을 그대로 `host/src/fixtures/claude-stream.ndjson` 에 저장(필요시 `mkdir -p host/src/fixtures`):

```bash
claude -p "Translate to Korean: hello" --output-format stream-json 2>/dev/null \
  | tee host/src/fixtures/claude-stream.ndjson
```

확인할 것: 각 줄이 `{...}` JSON, text delta 가 들어 있는 필드명(`message.content[0].text`, `delta.text`, 또는 `content` 등). 이 fixture 가 Step 2 테스트의 입력이 된다.

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// host/src/claude-stream-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseStreamLine } from './claude-stream-parser';

describe('parseStreamLine', () => {
  it('빈 줄은 null', () => {
    expect(parseStreamLine('')).toBeNull();
  });

  it('JSON 아닌 줄은 null', () => {
    expect(parseStreamLine('not json')).toBeNull();
  });

  it('text delta가 있는 assistant 이벤트는 텍스트 반환', () => {
    // fixture에서 확인한 실제 한 줄 (예시 — Step 1 결과로 교체)
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '안녕' }] },
    });
    expect(parseStreamLine(line)).toBe('안녕');
  });

  it('system/result 이벤트는 null', () => {
    expect(parseStreamLine(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeNull();
    expect(parseStreamLine(JSON.stringify({ type: 'result' }))).toBeNull();
  });
});
```

> Step 1 fixture로 정확한 스키마가 확인되면 위 `type: 'assistant'` 분기를 그대로, 또는 실제 필드 이름으로 보정한다. 절대 추측으로 두지 말 것.

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd host && pnpm test claude-stream-parser
```

Expected: FAIL — `parseStreamLine` not exported.

- [ ] **Step 4: 최소 구현**

```ts
// host/src/claude-stream-parser.ts
interface AssistantEvent {
  type: 'assistant';
  message?: { content?: Array<{ type?: string; text?: string }> };
}

export function parseStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const ev = obj as AssistantEvent;
  if (ev.type !== 'assistant') return null;
  const parts = ev.message?.content ?? [];
  let acc = '';
  for (const p of parts) {
    if (p.type === 'text' && typeof p.text === 'string') acc += p.text;
  }
  return acc.length > 0 ? acc : null;
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd host && pnpm test claude-stream-parser
```

Expected: PASS — 4 tests.

- [ ] **Step 6: commit**

```bash
git add host/src/claude-stream-parser.ts host/src/claude-stream-parser.test.ts host/src/fixtures/
git commit -m "feat(host): claude stream-json line parser"
```

---

### Task 2: claude spawn 헬퍼 (child_process.spawn 추상화)

**Files:**
- Create: `host/src/claude-spawn.ts`
- Test: `host/src/claude-spawn.test.ts`

스폰 자체는 mock 가능한 spawner 함수를 주입받게 설계해서 단위 테스트한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// host/src/claude-spawn.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { runClaude } from './claude-spawn';

function fakeChild(stdoutLines: string[], opts: { exitCode?: number; stderr?: string; spawnError?: NodeJS.ErrnoException } = {}) {
  const ee = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    kill: (sig: string) => void;
  };
  ee.stdout = Readable.from(stdoutLines.map((l) => `${l}\n`));
  ee.stderr = Readable.from([opts.stderr ?? '']);
  ee.kill = vi.fn();
  setTimeout(() => {
    if (opts.spawnError) {
      ee.emit('error', opts.spawnError);
      return;
    }
    ee.emit('close', opts.exitCode ?? 0);
  }, 0);
  return ee;
}

describe('runClaude', () => {
  it('정상 stream → chunk 시퀀스 + done', async () => {
    const chunks: string[] = [];
    const events: string[] = [];
    const spawner = vi.fn(() =>
      fakeChild([
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '안' }] } }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '녕' }] } }),
        JSON.stringify({ type: 'result' }),
      ]),
    );
    await runClaude(
      { prompt: 'hi', signal: new AbortController().signal },
      {
        onChunk: (t) => chunks.push(t),
        onDone: () => events.push('done'),
        onError: () => events.push('err'),
        spawner: spawner as never,
      },
    );
    expect(chunks).toEqual(['안', '녕']);
    expect(events).toEqual(['done']);
    expect(spawner).toHaveBeenCalledWith(
      'claude',
      ['-p', 'hi', '--output-format', 'stream-json', '--verbose'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });

  it('ENOENT → claude_not_found', async () => {
    const events: Array<{ code?: string; message: string }> = [];
    const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    const spawner = vi.fn(() => fakeChild([], { spawnError: err }));
    await runClaude(
      { prompt: 'hi', signal: new AbortController().signal },
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (e) => events.push(e),
        spawner: spawner as never,
      },
    );
    expect(events).toEqual([{ code: 'claude_not_found', message: expect.stringContaining('claude') as unknown as string }]);
  });

  it('stderr가 "not logged in"이고 exit ≠ 0 → claude_auth', async () => {
    const events: Array<{ code?: string; message: string }> = [];
    const spawner = vi.fn(() =>
      fakeChild([], { exitCode: 1, stderr: 'You are not logged in. Run `claude login`.' }),
    );
    await runClaude(
      { prompt: 'hi', signal: new AbortController().signal },
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (e) => events.push(e),
        spawner: spawner as never,
      },
    );
    expect(events[0]?.code).toBe('claude_auth');
  });

  it('기타 exit ≠ 0 → claude_failed + stderr 앞 200자', async () => {
    const events: Array<{ code?: string; message: string }> = [];
    const spawner = vi.fn(() =>
      fakeChild([], { exitCode: 2, stderr: 'rate limited blah blah' }),
    );
    await runClaude(
      { prompt: 'hi', signal: new AbortController().signal },
      {
        onChunk: () => {},
        onDone: () => {},
        onError: (e) => events.push(e),
        spawner: spawner as never,
      },
    );
    expect(events[0]?.code).toBe('claude_failed');
    expect(events[0]?.message).toContain('rate limited');
  });

  it('abort signal → child.kill 호출', async () => {
    const ctl = new AbortController();
    const child = fakeChild([
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'a' }] } }),
    ]);
    const spawner = vi.fn(() => child);
    const run = runClaude(
      { prompt: 'hi', signal: ctl.signal },
      { onChunk: () => {}, onDone: () => {}, onError: () => {}, spawner: spawner as never },
    );
    ctl.abort();
    await run;
    expect((child.kill as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd host && pnpm test claude-spawn
```

Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```ts
// host/src/claude-spawn.ts
import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { parseStreamLine } from './claude-stream-parser';

type Spawner = typeof nodeSpawn;

export interface RunClaudeArgs {
  prompt: string;
  signal: AbortSignal;
}

export interface RunClaudeCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: { code: 'claude_not_found' | 'claude_auth' | 'claude_failed'; message: string }) => void;
  spawner?: Spawner; // for testing
}

export function runClaude(args: RunClaudeArgs, cb: RunClaudeCallbacks): Promise<void> {
  const spawner = (cb.spawner ?? nodeSpawn) as Spawner;
  return new Promise<void>((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawner(
        'claude',
        ['-p', args.prompt, '--output-format', 'stream-json', '--verbose'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      ) as ChildProcessWithoutNullStreams;
    } catch (e) {
      cb.onError({ code: 'claude_failed', message: e instanceof Error ? e.message : String(e) });
      resolve();
      return;
    }

    let stderrBuf = '';
    let finished = false;
    const finish = (fn: () => void) => {
      if (finished) return;
      finished = true;
      fn();
      resolve();
    };

    const onAbort = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    };
    args.signal.addEventListener('abort', onAbort, { once: true });

    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const delta = parseStreamLine(line);
      if (delta !== null) cb.onChunk(delta);
    });

    child.stderr.on('data', (b: Buffer) => {
      stderrBuf += b.toString('utf8');
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        finish(() => cb.onError({ code: 'claude_not_found', message: 'claude CLI not found in PATH' }));
      } else {
        finish(() => cb.onError({ code: 'claude_failed', message: err.message }));
      }
    });

    child.on('close', (code) => {
      args.signal.removeEventListener('abort', onAbort);
      if (args.signal.aborted) {
        finish(() => cb.onDone());
        return;
      }
      if (code === 0) {
        finish(() => cb.onDone());
        return;
      }
      const lowered = stderrBuf.toLowerCase();
      if (lowered.includes('not logged in') || lowered.includes('login') || lowered.includes('unauthorized')) {
        finish(() => cb.onError({ code: 'claude_auth', message: stderrBuf.slice(0, 200) || 'claude not logged in' }));
      } else {
        finish(() =>
          cb.onError({ code: 'claude_failed', message: stderrBuf.slice(0, 200) || `exit ${code}` }),
        );
      }
    });
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd host && pnpm test claude-spawn
```

Expected: PASS — 5 tests.

- [ ] **Step 5: commit**

```bash
git add host/src/claude-spawn.ts host/src/claude-spawn.test.ts
git commit -m "feat(host): runClaude spawn helper with stream/abort/error mapping"
```

---

### Task 3: host/src/types.ts 갱신 + apfel 모듈 제거

**Files:**
- Modify: `host/src/types.ts`
- Delete: `host/src/apfel-manager.ts`, `host/src/apfel-manager.test.ts`, `host/src/restart-gate.ts`, `host/src/restart-gate.test.ts`

- [ ] **Step 1: types.ts 교체**

```ts
// host/src/types.ts
export type TargetLang = 'ko' | 'ja' | 'zh';

export type Request =
  | { type: 'translate'; mode: 'post'; text: string; targetLang: TargetLang }
  | { type: 'translate'; mode: 'reply'; originalPost: string; reply: string }
  | { type: 'diagnose' };

export type ErrorCode = 'claude_not_found' | 'claude_auth' | 'claude_failed';

export type Response =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'diagnose_result'; claudePath: string | null; version: string | null; loggedIn: boolean };
```

- [ ] **Step 2: apfel/restart-gate 모듈 삭제**

```bash
git rm host/src/apfel-manager.ts host/src/apfel-manager.test.ts host/src/restart-gate.ts host/src/restart-gate.test.ts
```

- [ ] **Step 3: typecheck — host/src/index.ts 가 깨지는지 확인 (다음 task에서 fix)**

```bash
cd host && pnpm typecheck 2>&1 | head -30
```

Expected: index.ts 에서 ApfelManager / restart-gate import 못 찾아 fail. 다음 task에서 index.ts 재작성.

- [ ] **Step 4: commit (의도적으로 빌드 깨진 채로 — index.ts 재작성과 분리)**

```bash
git add host/src/types.ts
git commit -m "refactor(host): replace apfel types with translate/diagnose; remove apfel modules"
```

---

### Task 4: host/src/index.ts 재작성 (NMH stdin → dispatch → stdout)

**Files:**
- Modify: `host/src/index.ts`

protocol.ts (length-prefixed encode/decode) 와 logger.ts 는 그대로 재사용한다.

- [ ] **Step 1: 기존 index.ts 전체 삭제 후 재작성**

```ts
// host/src/index.ts
import { runClaude } from './claude-spawn';
import { log } from './logger';
import { acquireSinglePid, releasePid } from './pidfile';
import { encode, readMessages } from './protocol';
import type { Request, Response } from './types';
import { whichInPath } from './which';
import { spawn } from 'node:child_process';

function send(res: Response): void {
  process.stdout.write(encode(res));
}

async function diagnose(): Promise<Response> {
  const claudePath = whichInPath('claude');
  if (!claudePath) {
    return { type: 'diagnose_result', claudePath: null, version: null, loggedIn: false };
  }
  const version = await runOneShot(claudePath, ['--version']);
  // claude 의 인증 상태는 `claude` 자체로는 명확하게 못 빼는 경우가 있어 휴리스틱:
  // version 출력이 정상이면 일단 path/version 노출, loggedIn 은 실제 호출 시 판단.
  return {
    type: 'diagnose_result',
    claudePath,
    version: version.trim() || null,
    loggedIn: true,
  };
}

function runOneShot(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const ch = spawn(bin, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ch.stdout.on('data', (b: Buffer) => {
      out += b.toString('utf8');
    });
    ch.on('close', () => resolve(out));
    ch.on('error', () => resolve(''));
  });
}

function buildPostPrompt(text: string, targetLang: 'ko' | 'ja' | 'zh'): string {
  // Phase 2 의 prompts.ts 와 같은 내용 — host에서 사용하기 위해 동일 문자열로 복제.
  // (extension/host 가 독립 빌드라 함수 import 못 함; 같은 spec을 두 쪽에서 따른다.)
  const langName = { ko: 'Korean (한국어)', ja: 'Japanese (日本語)', zh: 'Simplified Chinese (简体中文)' }[targetLang];
  return [
    `You are a translator for social media posts on Bluesky.`,
    `Translate the user's text into natural, casual ${langName} as it would be written by a native SNS user.`,
    `Rules: Output ONLY the translation. No prefix, no quotes, no explanation.`,
    `Preserve @mentions, URLs, #hashtags, and emoji verbatim.`,
    `Match the original tone (casual, joking, serious, etc).`,
    ``,
    `Source text:`,
    text,
  ].join('\n');
}

function buildReplyPrompt(originalPost: string, reply: string): string {
  return [
    `You are a translator for Bluesky reply composition.`,
    `Below is the ORIGINAL POST a user is replying to, followed by their REPLY draft.`,
    `Translate the REPLY into the SAME LANGUAGE as the ORIGINAL POST.`,
    `Rules: Output ONLY the translated reply. No prefix, no quotes, no explanation.`,
    `Preserve @mentions, URLs, #hashtags, and emoji verbatim. Match SNS casual tone.`,
    ``,
    `--- ORIGINAL POST ---`,
    originalPost,
    `--- REPLY (translate this) ---`,
    reply,
  ].join('\n');
}

let currentAbort: AbortController | null = null;

async function handle(req: Request): Promise<void> {
  if (req.type === 'diagnose') {
    send(await diagnose());
    return;
  }
  if (req.type === 'translate') {
    if (currentAbort) currentAbort.abort();
    const ctl = new AbortController();
    currentAbort = ctl;
    const prompt =
      req.mode === 'post'
        ? buildPostPrompt(req.text, req.targetLang)
        : buildReplyPrompt(req.originalPost, req.reply);
    await runClaude(
      { prompt, signal: ctl.signal },
      {
        onChunk: (text) => send({ type: 'chunk', text }),
        onDone: () => send({ type: 'done' }),
        onError: ({ code, message }) => send({ type: 'error', code, message }),
      },
    );
    if (currentAbort === ctl) currentAbort = null;
    return;
  }
  send({ type: 'error', code: 'claude_failed', message: 'unknown request type' });
}

async function main(): Promise<void> {
  if (!acquireSinglePid()) {
    log('warn', 'another host process is running; exiting');
    process.exit(0);
  }
  process.on('exit', releasePid);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  log('info', 'host started', { pid: process.pid });

  for await (const req of readMessages(process.stdin)) {
    try {
      await handle(req as Request);
    } catch (e) {
      log('error', 'handle failed', { msg: (e as Error).message });
      send({ type: 'error', code: 'claude_failed', message: (e as Error).message });
    }
  }
}

void main();
```

- [ ] **Step 2: typecheck**

```bash
cd host && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: protocol.test.ts 가 여전히 통과하는지 확인**

```bash
cd host && pnpm test
```

Expected: PASS — `claude-stream-parser`, `claude-spawn`, `protocol`, `which` 테스트. (apfel-manager / restart-gate 테스트는 삭제됨.)

- [ ] **Step 4: build**

```bash
cd host && pnpm build
ls host/dist/index.js
```

Expected: `host/dist/index.js` 생성.

- [ ] **Step 5: commit**

```bash
git add host/src/index.ts
git commit -m "feat(host): replace apfel dispatch with claude translate + diagnose"
```

---

## Phase 2 — Extension: 백엔드 호출 경로 재배선

extension은 host와 독립 빌드라 host가 먼저 그린 다음 진행한다 (Phase 1 commit 완료 가정).

### Task 5: storage.ts 정리

**Files:**
- Modify: `extension/lib/storage.ts`

- [ ] **Step 1: 새 내용으로 교체**

```ts
// extension/lib/storage.ts
export type TargetLang = 'ko' | 'ja' | 'zh';

export interface Settings {
  targetLang: TargetLang;
}

export const DEFAULT_SETTINGS: Settings = {
  targetLang: 'ko',
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
```

- [ ] **Step 2: typecheck (다른 곳에서 깨지는 import 확인)**

```bash
cd extension && npm run typecheck 2>&1 | grep -E 'apfelEndpoint|autoRestartServer|isLocalEndpoint' | head -10
```

Expected: 사용처 출력. 다음 task들에서 정리.

- [ ] **Step 3: commit (의도적으로 깨진 채 진행)**

```bash
git add extension/lib/storage.ts
git commit -m "refactor(extension): trim Settings to targetLang only"
```

---

### Task 6: lib/translate.ts + lib/nmh-client-content.ts 삭제, lib/nmh-client.ts 재작성

**Files:**
- Delete: `extension/lib/translate.ts`, `extension/lib/translate.test.ts`, `extension/lib/nmh-client-content.ts`
- Modify: `extension/lib/nmh-client.ts`

`nmh-client.ts` 는 background에서만 사용. translate 요청은 multi-response 스트림이라 callback API.

- [ ] **Step 1: 삭제**

```bash
git rm extension/lib/translate.ts extension/lib/translate.test.ts extension/lib/nmh-client-content.ts
```

- [ ] **Step 2: nmh-client.ts 재작성**

```ts
// extension/lib/nmh-client.ts
import type { Request, Response } from '../../host/src/types';

const HOST_NAME = 'com.flotter.bsky_translator';

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: { code?: string; message: string }) => void;
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
        onChunk: () => {
          // diagnose는 chunk 없음
        },
        onDone: () => {
          if (captured) resolve(captured);
          else resolve({ type: 'error', message: 'no diagnose_result' });
        },
        onError: (e) => resolve({ type: 'error', code: e.code, message: e.message }),
      },
      ctl.signal,
    );
    // hijack: diagnose_result 는 chunk 도 done 도 아니므로 onMessage를 직접 다루기 위해
    // streamRequest 가 받는 모든 메시지 분기를 알게 해야 한다. → 아래 Step 3 에서 streamRequest 보강.
  });
}
```

- [ ] **Step 3: diagnose_result 메시지를 streamRequest 가 받게 보강**

위 코드에서 `streamRequest` 의 `port.onMessage` 분기에 `diagnose_result` 처리가 빠져 있다. diagnose는 chunk 없이 한 번에 결과를 보내는 ad-hoc 메시지라, `StreamCallbacks` 에 옵션 핸들러를 추가하는 게 깔끔. 다음으로 교체:

```ts
// extension/lib/nmh-client.ts 의 StreamCallbacks 와 streamRequest 교체
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
```

> host 의 `diagnose` 핸들러도 result 를 보낸 뒤 `done` 을 보내도록 보강 — Task 4 의 index.ts handle('diagnose') 분기 끝에 `send({ type: 'done' });` 한 줄 추가.

- [ ] **Step 4: host index.ts 의 diagnose 분기에 done 추가**

```ts
// host/src/index.ts handle()
if (req.type === 'diagnose') {
  send(await diagnose());
  send({ type: 'done' });
  return;
}
```

- [ ] **Step 5: typecheck**

```bash
cd extension && npm run typecheck 2>&1 | tail -30
cd host && pnpm typecheck
```

Expected: 양쪽 모두 PASS (storage 사용처는 다음 task들에서 정리되므로 일부 fail 가능 — 어디서 깨지는지 메모만).

- [ ] **Step 6: commit**

```bash
git add extension/lib/nmh-client.ts host/src/index.ts
git commit -m "refactor: NMH client = stream + diagnose; host sends done after diagnose"
```

---

### Task 7: prompts.ts TDD (post + reply)

**Files:**
- Modify: `extension/lib/prompts.ts`
- Create: `extension/lib/prompts.test.ts`

host에서 같은 문자열을 쓰지만(import 못 함), spec 일관성 유지를 위해 extension 쪽도 별도 함수로 가짐. extension에서 직접 사용하는 자리는 없고(번역은 background → host 경로) 호환·검증 목적. host 와 동일 출력이 나오는지 stringify로 검사한다.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// extension/lib/prompts.test.ts
import { describe, expect, it } from 'vitest';
import { buildPostPrompt, buildReplyPrompt } from './prompts';

describe('buildPostPrompt', () => {
  it('targetLang 별 언어명을 명시', () => {
    expect(buildPostPrompt('hi', 'ko')).toContain('Korean (한국어)');
    expect(buildPostPrompt('hi', 'ja')).toContain('Japanese (日本語)');
    expect(buildPostPrompt('hi', 'zh')).toContain('Simplified Chinese (简体中文)');
  });
  it('Output only the translation 지시', () => {
    const p = buildPostPrompt('hi', 'ko');
    expect(p).toMatch(/Output ONLY the translation/i);
    expect(p).toMatch(/Preserve @mentions, URLs, #hashtags, and emoji/);
  });
  it('소스 텍스트가 끝에 오고 변조 없음', () => {
    const p = buildPostPrompt('@alice https://x.test #tag 😀', 'ko');
    expect(p.endsWith('@alice https://x.test #tag 😀')).toBe(true);
  });
});

describe('buildReplyPrompt', () => {
  it('원 포스트와 답글을 구분된 섹션으로', () => {
    const p = buildReplyPrompt({ originalPost: 'Hello world', reply: '안녕' });
    expect(p).toContain('--- ORIGINAL POST ---\nHello world');
    expect(p).toContain('--- REPLY (translate this) ---\n안녕');
  });
  it('"SAME LANGUAGE as the ORIGINAL POST" 지시 포함', () => {
    expect(buildReplyPrompt({ originalPost: 'a', reply: 'b' })).toMatch(/SAME LANGUAGE as the ORIGINAL POST/);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd extension && npm test prompts
```

Expected: FAIL — buildPostPrompt/buildReplyPrompt not exported.

- [ ] **Step 3: prompts.ts 교체**

```ts
// extension/lib/prompts.ts
import type { TargetLang } from './storage';

export const LANG_OPTIONS: ReadonlyArray<{ value: TargetLang; label: string }> = [
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
] as const;

const LANG_NAMES: Record<TargetLang, string> = {
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
  zh: 'Simplified Chinese (简体中文)',
};

export function buildPostPrompt(text: string, targetLang: TargetLang): string {
  return [
    `You are a translator for social media posts on Bluesky.`,
    `Translate the user's text into natural, casual ${LANG_NAMES[targetLang]} as it would be written by a native SNS user.`,
    `Rules: Output ONLY the translation. No prefix, no quotes, no explanation.`,
    `Preserve @mentions, URLs, #hashtags, and emoji verbatim.`,
    `Match the original tone (casual, joking, serious, etc).`,
    ``,
    `Source text:`,
    text,
  ].join('\n');
}

export function buildReplyPrompt(args: { originalPost: string; reply: string }): string {
  return [
    `You are a translator for Bluesky reply composition.`,
    `Below is the ORIGINAL POST a user is replying to, followed by their REPLY draft.`,
    `Translate the REPLY into the SAME LANGUAGE as the ORIGINAL POST.`,
    `Rules: Output ONLY the translated reply. No prefix, no quotes, no explanation.`,
    `Preserve @mentions, URLs, #hashtags, and emoji verbatim. Match SNS casual tone.`,
    ``,
    `--- ORIGINAL POST ---`,
    args.originalPost,
    `--- REPLY (translate this) ---`,
    args.reply,
  ].join('\n');
}
```

- [ ] **Step 4: 통과 확인**

```bash
cd extension && npm test prompts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: commit**

```bash
git add extension/lib/prompts.ts extension/lib/prompts.test.ts
git commit -m "feat(extension): buildPostPrompt + buildReplyPrompt with SNS-aware system prompt"
```

---

### Task 8: background.ts dispatch + cache (TDD)

**Files:**
- Modify: `extension/entrypoints/background.ts`
- Create: `extension/entrypoints/background.test.ts`

background는 단일 진입점. content는 `chrome.runtime.connect({name: 'translate'})` 로 port를 열고, background는 그 port로 chunk/done/error를 직접 push. 이 패턴은 chrome.runtime.sendMessage 보다 multi-message 스트리밍에 적합.

캐시는 background-scope module-level `LruCache`.

- [ ] **Step 1: 테스트 작성**

```ts
// extension/entrypoints/background.test.ts
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
  vi.stubGlobal('chrome', {
    runtime: {
      onConnect: { addListener: (cb: (p: FakePort) => void) => onConnectListeners.push(cb) },
      connectNative: vi.fn(() => fakeNativePort),
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      lastError: null,
    },
  });
  // Re-import background module fresh:
  vi.resetModules();
  await import('./background');
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
    // background에서 native port로 위임됐는지
    expect((globalThis as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }).chrome.runtime.connectNative).toHaveBeenCalledWith('com.flotter.bsky_translator');
    // 가짜 host가 chunk + done 보낸다고 시뮬레이션
    const nativePort = (globalThis as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }).chrome.runtime.connectNative.mock.results[0]?.value as FakePort;
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
    const native = (globalThis as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }).chrome.runtime.connectNative.mock.results[0]?.value as FakePort;
    native.onMessage._emit({ type: 'chunk', text: '안녕' });
    native.onMessage._emit({ type: 'done' });
    // 두 번째 요청
    const b = makePort('translate');
    onConnectListeners[0]?.(b);
    b.onMessage._emit({
      kind: 'translate',
      payload: { type: 'translate', mode: 'post', text: 'hi', targetLang: 'ko' },
    });
    expect(b.postMessage).toHaveBeenCalledWith({ type: 'chunk', text: '안녕' });
    expect(b.postMessage).toHaveBeenCalledWith({ type: 'done' });
    // native는 첫 번째 호출만
    expect((globalThis as { chrome: { runtime: { connectNative: ReturnType<typeof vi.fn> } } }).chrome.runtime.connectNative).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd extension && npm test background
```

Expected: FAIL — 현재 background.ts 가 새 프로토콜을 모름.

- [ ] **Step 3: background.ts 재작성**

```ts
// extension/entrypoints/background.ts
import { LruCache, cacheKey } from '@/lib/cache';
import { streamRequest } from '@/lib/nmh-client';
import type { Request, Response } from '../../host/src/types';

interface ClientMsg {
  kind: 'translate';
  payload: Extract<Request, { type: 'translate' }>;
}

const cache = new LruCache<string>(200);

async function makeKey(p: Extract<Request, { type: 'translate' }>): Promise<string> {
  // stable JSON
  const stable =
    p.mode === 'post'
      ? `post|${p.targetLang}|${p.text}`
      : `reply|${p.originalPost}|${p.reply}`;
  return cacheKey(stable, p.mode);
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
        clientPort.postMessage({ type: 'error', code: e.code as never, message: e.message } as Response);
      },
    },
    ctl.signal,
  );
}
```

- [ ] **Step 4: cache.ts 의 `cacheKey` 시그니처가 이미 `(text, lang)` 라 위 `cacheKey(stable, p.mode)` 호출과 맞는지 확인**

```bash
cat extension/lib/cache.ts | head -30
```

만약 시그니처가 다르면 일치하도록 `makeKey` 안에서 직접 `crypto.subtle.digest`로 SHA-256 만들기. 이미 둘째 인자로 임의 문자열을 받는다면 그대로.

- [ ] **Step 5: 테스트 통과**

```bash
cd extension && npm test background
```

Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add extension/entrypoints/background.ts extension/entrypoints/background.test.ts
git commit -m "feat(extension): background dispatches translate via port + LRU cache shared across tabs"
```

---

### Task 9: content.ts 의 translate 호출 경로 갈아끼우기 (post 시나리오 먼저)

**Files:**
- Modify: `extension/entrypoints/content.ts`

기존 `translateStream` (HTTP) 호출과 `ensureServerReady` 를 제거하고 background port 로 교체. compose detector / reply UI는 다음 task에서 추가.

- [ ] **Step 1: 새 헬퍼 함수와 함께 content.ts 갱신**

```ts
// extension/entrypoints/content.ts (관련 부분 발췌, 전체는 아래 패치 형태로 적용)
import { LruCache, cacheKey } from '@/lib/cache'; // ← 제거 (background로 이동)
// 위 import 라인 삭제

import { type TranslatorHandle, mountTranslatorUI, setThemeTokens } from '@/lib/inject-ui';
import { extractPostText, findUnprocessedPosts, markProcessed } from '@/lib/post-detector';
import { type TargetLang, loadSettings, onSettingsChange } from '@/lib/storage';
import { extractBskyTokens } from '@/lib/theme';
import { dbg } from '@/lib/debug';

function translateViaBackground(
  payload: { type: 'translate'; mode: 'post'; text: string; targetLang: TargetLang } |
           { type: 'translate'; mode: 'reply'; originalPost: string; reply: string },
  onChunk: (t: string) => void,
  onDone: () => void,
  onError: (e: { code?: string; message: string }) => void,
  signal: AbortSignal,
): void {
  const port = chrome.runtime.connect({ name: 'translate' });
  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
    try {
      port.disconnect();
    } catch {
      // ignore
    }
  };
  port.onMessage.addListener((m: { type: 'chunk' | 'done' | 'error'; text?: string; code?: string; message?: string }) => {
    if (m.type === 'chunk' && typeof m.text === 'string') onChunk(m.text);
    else if (m.type === 'done') settle(onDone);
    else if (m.type === 'error') settle(() => onError({ code: m.code, message: m.message ?? 'error' }));
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message ?? 'disconnected';
    settle(() => onError({ message: reason }));
  });
  signal.addEventListener(
    'abort',
    () => {
      settle(() => {});
    },
    { once: true },
  );
  port.postMessage({ kind: 'translate', payload });
}
```

그리고 `attach` 안의 `runTranslate` 를 다음으로 교체 (cache / Semaphore / ensureServerReady / translateStream 모두 제거):

```ts
async function runTranslate(): Promise<void> {
  const langValue: TargetLang = settings.targetLang;
  handle.reset();
  handle.show();
  visible = true;

  abortCtl?.abort();
  abortCtl = new AbortController();
  const signal = abortCtl.signal;

  let acc = '';
  const hangTimer = setTimeout(() => {
    if (acc.length === 0) handle.appendChunk('응답 지연 중...');
  }, 10_000);

  translateViaBackground(
    { type: 'translate', mode: 'post', text, targetLang: langValue },
    (chunk) => {
      if (acc.length === 0) handle.reset();
      acc += chunk;
      handle.appendChunk(chunk);
    },
    () => {
      clearTimeout(hangTimer);
      handle.trigger.textContent = '번역 숨기기';
    },
    (e) => {
      clearTimeout(hangTimer);
      const code = e.code;
      let msg: string;
      if (code === 'claude_not_found') {
        msg = 'claude CLI가 설치되어 있지 않습니다. `npm i -g @anthropic-ai/claude-code` 후 다시 시도하세요.';
      } else if (code === 'claude_auth') {
        msg = 'claude 로그인이 필요합니다. 터미널에서 `claude login` 후 다시 시도하세요.';
      } else {
        msg = `번역 실패 — ${e.message}.`;
      }
      handle.showError(msg, () => void runTranslate());
    },
    signal,
  );
}
```

`Semaphore` 와 그 import 도 함께 제거. content 안의 `LruCache`/`cacheKey` 캐시도 제거 (background로 이동). `EnsureServerError`/`ensureServerReady` import 와 사용처 제거.

전체 content.ts 의 attach 외 영역(observer, idleSchedule, initial-scan)은 그대로.

- [ ] **Step 2: typecheck**

```bash
cd extension && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: 기존 테스트 통과 (회귀 없음 확인)**

```bash
cd extension && npm test
```

Expected: PASS. translate.test.ts 는 삭제됐고, 새 prompts/background 테스트 통과.

- [ ] **Step 4: commit**

```bash
git add extension/entrypoints/content.ts
git commit -m "feat(extension): content uses background translate port (post mode)"
```

---

## Phase 3 — 답글 번역 기능

### Task 10: compose-detector TDD

**Files:**
- Create: `extension/lib/compose-detector.ts`
- Create: `extension/lib/compose-detector.test.ts`

Bluesky 의 reply composer는 `bsky.app/compose` 모달 또는 인라인 reply 박스. 정확한 selector는 구현 시 실측. 우선 두 가지 selector 후보 + fallback.

- [ ] **Step 1: 실측 — Bluesky 에서 한 번 reply 박스를 열고 DOM 조사**

브라우저 DevTools 에서:
```js
document.querySelector('[data-testid="composerTextInput"]') // 있나?
document.querySelectorAll('[role="textbox"][contenteditable="true"]') // 있나?
// reply라면 위쪽에 quoted post 영역 selector도 함께 기록
```

결과를 `extension/lib/compose-detector.ts` 의 `COMPOSE_SELECTORS`, `QUOTED_POST_SELECTORS` 상수로 박는다. fixture 작성을 위해 reply composer 의 outerHTML 도 250자 정도 캡처.

- [ ] **Step 2: 실패 테스트 작성**

```ts
// extension/lib/compose-detector.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { findReplyComposer } from './compose-detector';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function mountReplyFixture(opts: { withQuotedPost: boolean }): { compose: HTMLElement; quoted: HTMLElement | null } {
  // Step 1 실측 결과를 반영한 fixture.
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'dialog');
  let quoted: HTMLElement | null = null;
  if (opts.withQuotedPost) {
    quoted = document.createElement('div');
    quoted.setAttribute('data-testid', 'composerReplyTo');
    const txt = document.createElement('div');
    txt.setAttribute('data-testid', 'postText');
    txt.textContent = 'Original post body';
    quoted.appendChild(txt);
    wrap.appendChild(quoted);
  }
  const compose = document.createElement('div');
  compose.setAttribute('data-testid', 'composerTextInput');
  compose.setAttribute('role', 'textbox');
  compose.setAttribute('contenteditable', 'true');
  wrap.appendChild(compose);
  document.body.appendChild(wrap);
  return { compose, quoted };
}

describe('findReplyComposer', () => {
  it('reply (compose + quoted post) → 둘 다 반환', () => {
    const { compose, quoted } = mountReplyFixture({ withQuotedPost: true });
    const found = findReplyComposer(document);
    expect(found?.composeEl).toBe(compose);
    expect(found?.originalPostEl).toBe(quoted);
  });
  it('새 글 (compose only, no quoted) → null', () => {
    mountReplyFixture({ withQuotedPost: false });
    expect(findReplyComposer(document)).toBeNull();
  });
  it('compose 자체가 없음 → null', () => {
    expect(findReplyComposer(document)).toBeNull();
  });
});
```

- [ ] **Step 3: 실패 확인**

```bash
cd extension && npm test compose-detector
```

Expected: FAIL — `findReplyComposer` not exported.

- [ ] **Step 4: 구현**

```ts
// extension/lib/compose-detector.ts
const COMPOSE_SELECTORS = [
  '[data-testid="composerTextInput"]',
  '[role="textbox"][contenteditable="true"]', // fallback
] as const;

const QUOTED_POST_SELECTORS = [
  '[data-testid="composerReplyTo"]',
  // 필요 시 Step 1 실측 결과 추가
] as const;

const PROCESSED_ATTR = 'data-translator-reply-mounted';

export interface ReplyComposerHit {
  composeEl: HTMLElement;
  originalPostEl: HTMLElement;
}

export function findReplyComposer(root: ParentNode): ReplyComposerHit | null {
  let compose: HTMLElement | null = null;
  for (const sel of COMPOSE_SELECTORS) {
    compose = root.querySelector<HTMLElement>(sel);
    if (compose) break;
  }
  if (!compose) return null;
  let quoted: HTMLElement | null = null;
  for (const sel of QUOTED_POST_SELECTORS) {
    quoted = root.querySelector<HTMLElement>(sel);
    if (quoted) break;
  }
  if (!quoted) return null;
  return { composeEl: compose, originalPostEl: quoted };
}

export function isReplyComposerProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(PROCESSED_ATTR);
}

export function markReplyComposerProcessed(el: HTMLElement): void {
  el.setAttribute(PROCESSED_ATTR, '1');
}
```

- [ ] **Step 5: 통과 확인**

```bash
cd extension && npm test compose-detector
```

Expected: PASS — 3 tests.

- [ ] **Step 6: commit**

```bash
git add extension/lib/compose-detector.ts extension/lib/compose-detector.test.ts
git commit -m "feat(extension): compose-detector for reply boxes with quoted post"
```

---

### Task 11: inject-reply-ui TDD

**Files:**
- Create: `extension/lib/inject-reply-ui.ts`
- Create: `extension/lib/inject-reply-ui.test.ts`

기존 `inject-ui.ts` 와 같은 패턴: Shadow DOM host, host에서 click/pointerdown/mousedown stopPropagation, "번역" 트리거 버튼, 미리보기 div. lang select 없음.

- [ ] **Step 1: 실패 테스트**

```ts
// extension/lib/inject-reply-ui.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountReplyTranslatorUI } from './inject-reply-ui';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function makeCompose(): HTMLElement {
  const c = document.createElement('div');
  c.setAttribute('data-testid', 'composerTextInput');
  document.body.appendChild(c);
  return c;
}

describe('mountReplyTranslatorUI', () => {
  it('compose 옆에 Shadow host 삽입', () => {
    const compose = makeCompose();
    const h = mountReplyTranslatorUI(compose);
    expect(compose.nextSibling).toBe(h.host);
    expect(h.host.shadowRoot).not.toBeNull();
  });

  it('"번역" 트리거 버튼 존재', () => {
    const h = mountReplyTranslatorUI(makeCompose());
    expect(h.trigger.tagName).toBe('BUTTON');
    expect(h.trigger.textContent).toBe('번역');
  });

  it('host click 은 부모로 버블링되지 않음 (stopPropagation)', () => {
    const parent = document.createElement('a');
    parent.href = '#';
    const compose = document.createElement('div');
    compose.setAttribute('data-testid', 'composerTextInput');
    parent.appendChild(compose);
    document.body.appendChild(parent);
    const onParent = vi.fn();
    parent.addEventListener('click', onParent);
    const h = mountReplyTranslatorUI(compose);
    h.trigger.click();
    expect(onParent).not.toHaveBeenCalled();
  });

  it('appendChunk 누적 / showError + retry / destroy', () => {
    const h = mountReplyTranslatorUI(makeCompose());
    h.show();
    h.appendChunk('안');
    h.appendChunk('녕');
    expect(h.result.textContent).toBe('안녕');
    let retried = false;
    h.showError('실패', () => {
      retried = true;
    });
    (h.result.querySelector('button.retry') as HTMLButtonElement).click();
    expect(retried).toBe(true);
    h.destroy();
    expect(document.body.contains(h.host)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd extension && npm test inject-reply-ui
```

Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```ts
// extension/lib/inject-reply-ui.ts
import injectedCss from '../styles/inject.css?raw';

export interface ReplyTranslatorHandle {
  host: HTMLElement;
  trigger: HTMLButtonElement;
  result: HTMLDivElement;
  show(): void;
  hide(): void;
  reset(): void;
  appendChunk(chunk: string): void;
  showError(message: string, onRetry: () => void): void;
  destroy(): void;
}

export function mountReplyTranslatorUI(composeEl: HTMLElement): ReplyTranslatorHandle {
  const host = document.createElement('div');
  host.className = 'flotter-reply-translator-host';
  const stop = (e: Event) => e.stopPropagation();
  host.addEventListener('click', stop);
  host.addEventListener('pointerdown', stop);
  host.addEventListener('mousedown', stop);
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

  const result = document.createElement('div') as HTMLDivElement;
  result.className = 'result';
  result.hidden = true;
  const resultText = document.createTextNode('');
  result.appendChild(resultText);

  shadow.appendChild(row);
  shadow.appendChild(result);

  composeEl.parentNode?.insertBefore(host, composeEl.nextSibling);

  function ensureResultText(): Text {
    if (resultText.parentNode !== result) {
      while (result.firstChild) result.removeChild(result.firstChild);
      resultText.data = '';
      result.appendChild(resultText);
    }
    return resultText;
  }

  return {
    host,
    trigger,
    result,
    show() {
      result.hidden = false;
    },
    hide() {
      result.hidden = true;
    },
    reset() {
      while (result.firstChild) result.removeChild(result.firstChild);
      resultText.data = '';
      result.appendChild(resultText);
      result.removeAttribute('data-state');
    },
    appendChunk(chunk) {
      result.removeAttribute('data-state');
      ensureResultText().appendData(chunk);
    },
    showError(message, onRetry) {
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
```

- [ ] **Step 4: 통과 확인**

```bash
cd extension && npm test inject-reply-ui
```

Expected: PASS — 4 tests.

- [ ] **Step 5: commit**

```bash
git add extension/lib/inject-reply-ui.ts extension/lib/inject-reply-ui.test.ts
git commit -m "feat(extension): mountReplyTranslatorUI Shadow DOM widget"
```

---

### Task 12: content.ts 에 reply 통합

**Files:**
- Modify: `extension/entrypoints/content.ts`

기존 post scan tick 마다 compose 도 함께 스캔해서 mount/destroy.

- [ ] **Step 1: content.ts 의 main() 안 observer tick 에 compose 처리 추가**

`attach(post)` 함수와 동일 레벨에 다음 헬퍼 추가:

```ts
import { findReplyComposer, isReplyComposerProcessed, markReplyComposerProcessed } from '@/lib/compose-detector';
import { mountReplyTranslatorUI, type ReplyTranslatorHandle } from '@/lib/inject-reply-ui';

const mountedReplies = new Map<HTMLElement, { handle: ReplyTranslatorHandle; originalPostEl: HTMLElement }>();

function attachReply(composeEl: HTMLElement, originalPostEl: HTMLElement): void {
  if (isReplyComposerProcessed(composeEl)) return;
  markReplyComposerProcessed(composeEl);
  const handle = mountReplyTranslatorUI(composeEl);
  setThemeTokens(handle.host, extractBskyTokens());
  mountedReplies.set(composeEl, { handle, originalPostEl });

  let abortCtl: AbortController | null = null;

  function runReplyTranslate(): void {
    const reply = composeEl.textContent?.trim() ?? '';
    if (!reply) {
      handle.showError('내용을 먼저 작성하세요.', () => runReplyTranslate());
      return;
    }
    const originalPost = extractPostText(originalPostEl);
    if (!originalPost) {
      handle.showError('원 포스트 텍스트를 찾을 수 없습니다.', () => runReplyTranslate());
      return;
    }
    handle.reset();
    handle.show();
    abortCtl?.abort();
    abortCtl = new AbortController();
    let acc = '';
    translateViaBackground(
      { type: 'translate', mode: 'reply', originalPost, reply },
      (chunk) => {
        if (acc.length === 0) handle.reset();
        acc += chunk;
        handle.appendChunk(chunk);
      },
      () => {
        // done
      },
      (e) => {
        let msg: string;
        if (e.code === 'claude_not_found') msg = 'claude CLI 미설치. `npm i -g @anthropic-ai/claude-code`.';
        else if (e.code === 'claude_auth') msg = 'claude 로그인 필요. 터미널에서 `claude login`.';
        else msg = `번역 실패 — ${e.message}.`;
        handle.showError(msg, () => runReplyTranslate());
      },
      abortCtl.signal,
    );
  }

  handle.trigger.addEventListener('click', () => runReplyTranslate());
}
```

그리고 observer tick (`scan(node)` 호출 직후) 와 initial scan 직후에 다음 한 줄 추가:

```ts
// post scan 직후
const reply = findReplyComposer(document);
if (reply) attachReply(reply.composeEl, reply.originalPostEl);

// mountedReplies 누수 정리 (post와 같은 패턴)
for (const [el, entry] of mountedReplies) {
  if (!el.isConnected) {
    entry.handle.destroy();
    mountedReplies.delete(el);
  }
}
```

- [ ] **Step 2: typecheck + test**

```bash
cd extension && npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 3: commit**

```bash
git add extension/entrypoints/content.ts
git commit -m "feat(extension): mount reply translator on Bluesky compose with quoted post"
```

---

## Phase 4 — 옵션 페이지 + 매니페스트 + 스크립트 정리

### Task 13: ClaudeStatus 컴포넌트 + App 정리

**Files:**
- Create: `extension/entrypoints/options/components/ClaudeStatus.tsx`
- Modify: `extension/entrypoints/options/App.tsx`
- Delete: `extension/entrypoints/options/components/EndpointEditor.tsx`, `AutoRestartToggle.tsx`, `ServerStatus.tsx`

- [ ] **Step 1: ClaudeStatus 작성**

```tsx
// extension/entrypoints/options/components/ClaudeStatus.tsx
import { useEffect, useState } from 'react';
import { diagnose } from '@/lib/nmh-client';

interface Diag {
  claudePath: string | null;
  version: string | null;
  loggedIn: boolean;
}

export function ClaudeStatus() {
  const [state, setState] = useState<'loading' | { kind: 'ok'; diag: Diag } | { kind: 'err'; message: string }>(
    'loading',
  );

  function refresh() {
    setState('loading');
    void diagnose().then((r) => {
      if (r.type === 'diagnose_result') {
        setState({ kind: 'ok', diag: { claudePath: r.claudePath, version: r.version, loggedIn: r.loggedIn } });
      } else {
        setState({ kind: 'err', message: r.message });
      }
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="card">
      <h2>🤖 Claude CLI</h2>
      {state === 'loading' ? (
        <p>진단 중...</p>
      ) : state.kind === 'err' ? (
        <p>
          진단 실패: {state.message}{' '}
          <button type="button" onClick={refresh}>
            다시
          </button>
        </p>
      ) : (
        <>
          <p>
            경로: <span className="code">{state.diag.claudePath ?? '(없음)'}</span>
          </p>
          <p>
            버전: <span className="code">{state.diag.version ?? '(미확인)'}</span>
          </p>
          {!state.diag.claudePath && (
            <p className="muted">
              설치: <span className="code">npm i -g @anthropic-ai/claude-code</span>
            </p>
          )}
          <button type="button" onClick={refresh}>
            다시 진단
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: App.tsx 교체**

```tsx
// extension/entrypoints/options/App.tsx
import { type Settings, loadSettings, saveSettings } from '@/lib/storage';
import { useEffect, useState } from 'react';
import { ClaudeStatus } from './components/ClaudeStatus';
import { LanguageSelector } from './components/LanguageSelector';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!settings) return;
    const prev = settings;
    const next = { ...settings, ...p };
    setSettings(next);
    try {
      await saveSettings(p);
    } catch (e) {
      console.error('[bsky-translator] settings 저장 실패', e);
      setSettings(prev);
    }
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
      </div>

      <ClaudeStatus />

      <p className="muted">
        ※ claude CLI는 한 번 <span className="code">claude login</span> 으로 인증해 두면 됩니다.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: 삭제**

```bash
git rm extension/entrypoints/options/components/EndpointEditor.tsx \
       extension/entrypoints/options/components/AutoRestartToggle.tsx \
       extension/entrypoints/options/components/ServerStatus.tsx
```

- [ ] **Step 4: typecheck + test + build**

```bash
cd extension && npm run typecheck && npm test && npm run build
```

Expected: 모두 PASS, `.output/chrome-mv3/options.html` 빌드.

- [ ] **Step 5: commit**

```bash
git add extension/entrypoints/options/
git commit -m "feat(extension): options page = LanguageSelector + ClaudeStatus only"
```

---

### Task 14: wxt.config.ts (manifest) 정리

**Files:**
- Modify: `extension/wxt.config.ts`

- [ ] **Step 1: 교체**

```ts
// extension/wxt.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    plugins: [react()],
    build: { minify: false, sourcemap: 'inline' },
  }),
  manifest: {
    name: 'Bluesky Translator',
    description: 'Translate Bluesky posts and replies via Claude CLI',
    version: '0.0.2',
    permissions: ['storage', 'nativeMessaging'],
    host_permissions: ['https://bsky.app/*'],
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

- [ ] **Step 2: build**

```bash
cd extension && npm run build
grep -c '127.0.0.1:11434' .output/chrome-mv3/manifest.json
```

Expected: 0.

- [ ] **Step 3: commit**

```bash
git add extension/wxt.config.ts
git commit -m "chore(extension): drop 127.0.0.1:11434 host permission; bump version"
```

---

### Task 15: install.sh / doctor.sh / uninstall.sh / README 갱신

**Files:**
- Modify: `install.sh`, `scripts/doctor.sh`, `uninstall.sh`, `README.md`

- [ ] **Step 1: install.sh 의 apfel 단계를 claude 점검으로 교체**

`step "2/7 의존성 설치"` 안의 apfel 설치 라인을 다음으로 교체:

```bash
# 기존: command -v apfel >/dev/null 2>&1 || brew install apfel
# 교체:
if ! command -v claude >/dev/null 2>&1; then
  red "claude CLI가 설치되어 있지 않습니다."
  echo "  설치: npm i -g @anthropic-ai/claude-code"
  echo "  설치 후 다시 실행하세요."
  exit 1
fi
# 인증은 한 번이라도 했는지 빠르게 점검 — 실패해도 경고만
claude --version >/dev/null 2>&1 || red "claude --version 실패 — 인증/설치 상태 점검하세요."
```

`green` 마무리 안내문에 `claude login` 단계 추가:

```bash
green ""
green "✓ 설치 완료. https://bsky.app/ 을 새로고침하세요."
green "  · claude 로그인 안 했으면 터미널에서: claude login"
green "  · 옵션 페이지: chrome-extension://$EXT_ID/options.html"
```

- [ ] **Step 2: scripts/doctor.sh 의 apfel 점검을 claude 점검으로 교체**

```bash
# 기존 apfel / curl /v1/models 라인 제거. 다음으로 교체:
command -v claude >/dev/null 2>&1 && ok "claude CLI 설치됨: $(claude --version 2>/dev/null | head -1)" || fail "claude 미설치 (npm i -g @anthropic-ai/claude-code)"
```

- [ ] **Step 3: uninstall.sh 에서 apfel 관련 처리 제거 (사용자 환경 변경 최소화)**

uninstall.sh 가 brew uninstall apfel 같은 라인을 갖고 있다면 제거. NMH manifest + INSTALL_DIR 정리만 남기기.

- [ ] **Step 4: README.md 업데이트**

기존 README 의 백엔드 설명 섹션을 다음으로 교체 (정확한 라인은 README 구조에 따라):

```markdown
## 백엔드

번역은 사용자 머신의 `claude` CLI를 통해 수행합니다. 설치 후 한 번 `claude login` 으로 인증해 두면 됩니다.
- 설치: `npm i -g @anthropic-ai/claude-code`
- 인증: `claude login`

## 답글 번역 (v0.0.2+)

외국어 포스트에 답글을 작성할 때 compose 박스 옆 "번역" 버튼을 누르면, 답글 텍스트가 **원 포스트의 언어**로 번역되어 compose 아래에 미리보기로 표시됩니다. compose 내용 자체는 바뀌지 않으니, 마음에 들면 직접 복사하여 붙여넣으세요.
```

스모크 체크리스트 섹션이 있다면 spec §7 Manual smoke 4개 항목으로 갱신.

- [ ] **Step 5: doctor 한 번 실행해서 통과 확인**

```bash
bash scripts/doctor.sh
```

Expected: claude 라인 ok, host dist / NMH manifest / extension dist 는 prod 설치 안 했으면 fail — 그건 정상.

- [ ] **Step 6: commit**

```bash
git add install.sh scripts/doctor.sh uninstall.sh README.md
git commit -m "chore: switch install/doctor/uninstall/README from apfel to claude CLI"
```

---

## Phase 5 — 검증

### Task 16: 전체 typecheck/test/build + 수동 스모크

**Files:** 없음 (검증만).

- [ ] **Step 1: 모든 워크스페이스 typecheck**

```bash
cd /Users/bright/Projects/bluesky-mac-translator
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 2: 모든 테스트**

```bash
pnpm -r test
```

Expected: PASS. extension 33+ tests, host 신규 테스트 포함.

- [ ] **Step 3: 빌드**

```bash
cd extension && npm run build
cd ../host && pnpm build
```

Expected: 양쪽 dist 정상.

- [ ] **Step 4: dev launcher + NMH manifest 확인 (이미 dev 환경에 있음)**

```bash
ls /Users/bright/Projects/bluesky-mac-translator/host/host-launcher.sh
ls "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.flotter.bsky_translator.json"
```

둘 다 존재.

- [ ] **Step 5: Chrome 에서 확장 reload + Bluesky 새 탭 → spec §7 Manual smoke 4 항목 실행**

1. 외국어 post 번역 → 한국어 미리보기 스트리밍 정상.
2. 외국인 post에 답글 작성 → "번역" → compose 아래 원 포스트 언어로 표시. compose 텍스트 그대로.
3. `claude logout` 후 다시 시도 → `claude_auth` 안내.
4. `PATH=/usr/bin` 에서 시도 → `claude_not_found` 안내. (PATH 복구 후 정상.)

각 항목 결과를 PR 본문에 메모.

- [ ] **Step 6: 최종 commit (의도적 변경 없으면 skip)**

문서 추가/수정이 더 필요하면 한 번 더 commit. 그렇지 않으면 PR로 직행.

---

## Notes

- spec §9 의 Open Question 셋(NDJSON 스키마, compose selector, quoted post selector) 은 Task 1 Step 1, Task 10 Step 1 에서 실측으로 해결한다. 추측 금지.
- 한 PR 안에서 묶지만, Phase 별로 commit 이 명확히 분리되어 있어 bisect/리뷰가 쉽다.
- 본 plan은 spec 의 모든 항목을 1:1 task로 커버한다:
  - §3 Architecture → Task 4 + 9
  - §4 Components (신규/변경/삭제) → Task 1–14 전반에 분산
  - §5 Protocol & Data Flow → Task 3 (types), Task 6 (client), Task 8 (background), Task 9/12 (content)
  - §6 Error Handling → Task 2 (host 매핑), Task 9/12 (content UI 메시지)
  - §7 Testing → Task 1/2/7/8/10/11 (단위), Task 16 (수동)
  - §8 Migration/Cleanup → Task 5/6/13/14/15
