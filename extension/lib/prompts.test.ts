import { describe, expect, it } from 'vitest';
import { buildPostPrompt, buildReplyPrompt } from './prompts';

describe('buildPostPrompt', () => {
  it('targetLang 별 언어명을 명시', () => {
    expect(buildPostPrompt('hi', 'ko')).toContain('Korean (한국어)');
    expect(buildPostPrompt('hi', 'ja')).toContain('Japanese (日本語)');
    expect(buildPostPrompt('hi', 'zh')).toContain('Simplified Chinese (简体中文)');
  });
  it('Output only the translation 지시', () => {
    const p = buildPostPrompt('hi', 'ko');
    expect(p).toMatch(/Output ONLY the translation/i);
    expect(p).toMatch(/Preserve @mentions, URLs, #hashtags, and emoji/);
  });
  it('소스 텍스트가 끝에 오고 변조 없음', () => {
    const p = buildPostPrompt('@alice https://x.test #tag 😀', 'ko');
    expect(p.endsWith('@alice https://x.test #tag 😀')).toBe(true);
  });
});

describe('buildReplyPrompt', () => {
  it('원 포스트와 답글을 구분된 섹션으로', () => {
    const p = buildReplyPrompt({ originalPost: 'Hello world', reply: '안녕' });
    expect(p).toContain('--- ORIGINAL POST ---\nHello world');
    expect(p).toContain('--- REPLY (translate this) ---\n안녕');
  });
  it('"SAME LANGUAGE as the ORIGINAL POST" 지시 포함', () => {
    expect(buildReplyPrompt({ originalPost: 'a', reply: 'b' })).toMatch(/SAME LANGUAGE as the ORIGINAL POST/);
  });
});
