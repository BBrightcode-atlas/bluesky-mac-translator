interface EnsureResponse {
  ok: boolean;
  error?: string;
}

export async function ensureServerReady(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ kind: 'ensure_ready' })) as EnsureResponse;
  if (!res?.ok) {
    throw new Error(res?.error ?? 'NMH ensure_ready 실패');
  }
}
