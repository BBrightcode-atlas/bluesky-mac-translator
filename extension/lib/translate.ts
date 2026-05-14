import { buildRequest } from './prompts';
import type { TargetLang } from './storage';

export class TranslateError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = 'TranslateError';
  }
}

export async function* translateStream(
  text: string,
  lang: TargetLang,
  endpoint: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const url = `${endpoint.replace(/\/$/, '')}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequest(text, lang)),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new TranslateError(res.status);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed line
        }
      }
    }
  } finally {
    await reader.cancel();
  }
}
