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
  // INTENTIONAL DUPLICATE of extension/lib/prompts.ts buildPostPrompt — extension and host
  // are independent builds and can't share imports. The Phase 2 Task 7 rewrite of
  // extension/lib/prompts.ts produces the same strings as this function. If you change one,
  // change the other in the same PR. Until Phase 2 lands, extension/lib/prompts.ts is still
  // the apfel-era SYSTEM_PROMPTS — temporary mismatch by design.
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
  // No explicit target-language arg: we rely on Claude to infer the original post's
  // language and translate the reply to match. Spec §5 Flow 2 — design decision.
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
