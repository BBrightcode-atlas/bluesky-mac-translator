// TEMPORARY diagnostic helper — sends events to apfel server on 127.0.0.1:11434
// (already in host_permissions — no manifest change needed) using a distinctive
// URL path. apfel 404s these but they're logged in apfel.log on the host side.
// Also mirrors to console.
export function dbg(step: string, data?: unknown): void {
  const ev = { step, t: Date.now(), data };
  try {
    console.log('[bmt-debug]', step, data ?? '');
  } catch {
    /* ignore */
  }
  // fire-and-forget — apfel will 404 but the request reaches apfel.log
  try {
    const tag = encodeURIComponent(step);
    const payload = encodeURIComponent(JSON.stringify(ev).slice(0, 400));
    void fetch(`http://127.0.0.1:11434/bmt-debug/${tag}?p=${payload}`, {
      method: 'GET',
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
