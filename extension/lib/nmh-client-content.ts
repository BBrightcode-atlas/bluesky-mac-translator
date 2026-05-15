interface EnsureResponse {
  ok: boolean;
  error?: string;
  code?: string;
}

export class EnsureServerError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'EnsureServerError';
  }
}

export async function ensureServerReady(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ kind: 'ensure_ready' })) as EnsureResponse;
  if (!res?.ok) {
    throw new EnsureServerError(res?.error ?? 'NMH ensure_ready 실패', res?.code);
  }
}
