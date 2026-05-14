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
