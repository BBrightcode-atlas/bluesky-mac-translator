import { spawn as nodeSpawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { apfelLogPath, log } from './logger';
import { RestartGate } from './restart-gate';
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
  private spawnInFlight: Promise<{ pid: number; port: number }> | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private monitorFails = 0;
  private readonly gate = new RestartGate();

  constructor(opts: ApfelManagerOptions) {
    this.port = opts.port;
    this.healthTimeoutMs = opts.healthTimeoutMs ?? 300;
    this.startTimeoutMs = opts.startTimeoutMs ?? 5000;
    this.which = opts.which ?? whichInPath;
    this.spawnImpl =
      opts.spawnImpl ?? ((cmd, args, o) => nodeSpawn(cmd, args, o) as unknown as SpawnedChild);
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
    if (this.spawnInFlight) return this.spawnInFlight;
    this.spawnInFlight = this.doSpawn();
    try {
      return await this.spawnInFlight;
    } finally {
      this.spawnInFlight = null;
    }
  }

  private async doSpawn(): Promise<{ pid: number; port: number }> {
    const bin = this.findApfelBinary();
    if (!bin) throw new ApfelError('apfel_not_installed', 'apfel binary not found in PATH');

    mkdirSync(dirname(apfelLogPath), { recursive: true });
    const logFd = openSync(apfelLogPath, 'a');
    try {
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
    } finally {
      closeSync(logFd);
    }
  }

  async stop(): Promise<void> {
    const c = this.child;
    if (!c || c.exitCode !== null) {
      this.child = null;
      return;
    }
    c.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const timer = setTimeout(() => {
        if (c.exitCode === null) c.kill('SIGKILL');
        finish();
      }, 3000);
      c.on('exit', () => {
        clearTimeout(timer);
        finish();
      });
    });
    this.child = null;
  }

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
      log('warn', 'restart blocked', {
        reason: decision.reason ?? 'backoff',
        waitMs: decision.waitMs,
      });
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
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
