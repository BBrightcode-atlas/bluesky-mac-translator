import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { parseStreamLine } from './claude-stream-parser';

type SpawnLikeChild = {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill(signal?: string): boolean | void;
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
};
type SpawnLike = (
  cmd: string,
  args: ReadonlyArray<string>,
  opts: { stdio: ReadonlyArray<string> },
) => SpawnLikeChild;

export interface RunClaudeArgs {
  prompt: string;
  signal: AbortSignal;
}

export interface RunClaudeCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: { code: 'claude_not_found' | 'claude_auth' | 'claude_failed'; message: string }) => void;
  spawner?: SpawnLike; // for testing
}

export function runClaude(args: RunClaudeArgs, cb: RunClaudeCallbacks): Promise<void> {
  const spawner: SpawnLike = cb.spawner ?? ((cmd, spawnArgs, opts) => {
    const proc = nodeSpawn(cmd, [...spawnArgs], { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    return {
      stdout: proc.stdout,
      stderr: proc.stderr,
      kill: (signal?: string) => proc.kill(signal as NodeJS.Signals | undefined),
      on: proc.on.bind(proc) as SpawnLikeChild['on'],
    };
  });
  return new Promise<void>((resolve) => {
    let child: SpawnLikeChild;
    try {
      child = spawner(
        'claude',
        // --bare skips hooks, LSP, plugin sync, CLAUDE.md auto-discovery, etc.
        // Measured ~2x faster cold start (5.3s → 2.7s) and prevents user's
        // SessionStart hooks from polluting the stream-json output.
        ['-p', args.prompt, '--bare', '--output-format', 'stream-json', '--verbose'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
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
      // keep rolling 4KB window of stderr so we don't unbounded-grow on long-running processes
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
