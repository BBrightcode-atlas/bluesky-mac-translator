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
