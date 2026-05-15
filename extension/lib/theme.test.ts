import { describe, expect, it } from 'vitest';
import { extractBskyTokens } from './theme';

describe('extractBskyTokens', () => {
  it('기본 토큰을 모두 반환', () => {
    const t = extractBskyTokens();
    expect(t['--bsky-link']).toBeTruthy();
    expect(t['--bsky-text']).toBeTruthy();
    expect(t['--bsky-border']).toBeTruthy();
    expect(t['--bsky-secondary-bg']).toBeTruthy();
    expect(t['--bsky-error-bg']).toBeTruthy();
    expect(t['--bsky-error-text']).toBeTruthy();
  });
});
