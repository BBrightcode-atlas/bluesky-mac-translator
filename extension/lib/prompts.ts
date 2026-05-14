import type { TargetLang } from './storage';

export const SYSTEM_PROMPTS: Record<TargetLang, string> = {
  ko: "You are a translator. Translate the user's text into natural Korean (한국어). Output only the translation, no explanations, no quotes.",
  ja: "You are a translator. Translate the user's text into natural Japanese (日本語). Output only the translation, no explanations, no quotes.",
  zh: "You are a translator. Translate the user's text into natural Simplified Chinese (简体中文). Output only the translation, no explanations, no quotes.",
};

export const LANG_OPTIONS: ReadonlyArray<{ value: TargetLang; label: string }> = [
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
] as const;

export interface ChatRequest {
  model: string;
  messages: ReadonlyArray<{ role: 'system' | 'user'; content: string }>;
  stream: true;
  temperature: number;
}

export function buildRequest(text: string, lang: TargetLang): ChatRequest {
  return {
    model: 'apple-on-device',
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS[lang] },
      { role: 'user', content: text },
    ],
    stream: true,
    temperature: 0.2,
  };
}
