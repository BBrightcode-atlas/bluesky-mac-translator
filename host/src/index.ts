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
