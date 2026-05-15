import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { runClaude } from './claude-spawn';

function fakeChild(stdoutLines: string[], opts: { exitCode?: number; stderr?: string; spawnError?: NodeJS.ErrnoException } = {}) {
  const ee = new EventEmitter();
  const stdout = Readable.from(stdoutLines.map((l) => `${l}\n`));
  const stderr = Readable.from([opts.stderr ?? '']);
  const kill = vi.fn();
  Object.assign(ee, { stdout, stderr, kill });
  setTimeout(() => {
    if (opts.spawnError) {
      ee.emit('error', opts.spawnError);
      return;
    }
    ee.emit('close', opts.exitCode ?? 0);
  }, 0);
  return ee as typeof ee & { stdout: Readable; stderr: Readable; kill: typeof kill };
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
        spawner: spawner,
      },
    );
    expect(chunks).toEqual(['안', '녕']);
    expect(events).toEqual(['done']);
    expect(spawner).toHaveBeenCalledWith(
      'claude',
      ['-p', 'hi', '--bare', '--output-format', 'stream-json', '--verbose'],
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
        spawner: spawner,
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
        spawner: spawner,
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
        spawner: spawner,
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
