interface AssistantEvent {
  type: 'assistant';
  message?: { content?: Array<{ type?: string; text?: string }> };
}

export function parseStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const ev = obj as AssistantEvent;
  if (ev.type !== 'assistant') return null;
  const parts = ev.message?.content ?? [];
  let acc = '';
  for (const p of parts) {
    if (p.type === 'text' && typeof p.text === 'string') acc += p.text;
  }
  return acc.length > 0 ? acc : null;
}
