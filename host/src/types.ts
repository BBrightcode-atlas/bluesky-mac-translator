// 'en' added in v0.0.3 for Buffer compose mode (user writes in their own language,
// translates outward to publish in English).
export type TargetLang = 'ko' | 'ja' | 'zh' | 'en';

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
