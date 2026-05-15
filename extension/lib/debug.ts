// Lightweight debug logger. Outputs to console only. Suppressed in production builds.
const ENABLED = false; // flip to true locally when investigating
export function dbg(step: string, data?: unknown): void {
  if (!ENABLED) return;
  try {
    console.log('[bmt-debug]', step, data ?? '');
  } catch {
    // ignore
  }
}
