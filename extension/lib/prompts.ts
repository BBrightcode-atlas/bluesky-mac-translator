import type { ComposeTargetLang, TargetLang } from './storage';

// Reading direction: foreign post → user's language. Limited to the three
// most common destination languages our users want to read in.
export const LANG_OPTIONS: ReadonlyArray<{ value: TargetLang; label: string }> = [
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
] as const;

// Composing direction: user's own text → foreign language for publishing.
// English is the typical default, with the same three CJK languages available.
export const COMPOSE_LANG_OPTIONS: ReadonlyArray<{ value: ComposeTargetLang; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ko', label: '한국어' },
] as const;

const LANG_NAMES: Record<TargetLang | ComposeTargetLang, string> = {
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
  zh: 'Simplified Chinese (简体中文)',
  en: 'English',
};

export function buildPostPrompt(text: string, targetLang: TargetLang | ComposeTargetLang): string {
  return [
    `You are a translator for social media posts.`,
    `Translate the user's text into natural, casual ${LANG_NAMES[targetLang]} as it would be written by a native SNS user.`,
    `Rules: Output ONLY the translation. No prefix, no quotes, no explanation.`,
    `Preserve @mentions, URLs, #hashtags, and emoji verbatim.`,
    `Match the original tone (casual, joking, serious, etc).`,
    ``,
    `Source text:`,
    text,
  ].join('\n');
}

export function buildReplyPrompt(args: { originalPost: string; reply: string }): string {
  return [
    `You are a translator for Bluesky reply composition.`,
    `Below is the ORIGINAL POST a user is replying to, followed by their REPLY draft.`,
    `Translate the REPLY into the SAME LANGUAGE as the ORIGINAL POST.`,
    `Rules: Output ONLY the translated reply. No prefix, no quotes, no explanation.`,
    `Preserve @mentions, URLs, #hashtags, and emoji verbatim. Match SNS casual tone.`,
    ``,
    `--- ORIGINAL POST ---`,
    args.originalPost,
    `--- REPLY (translate this) ---`,
    args.reply,
  ].join('\n');
}
