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
