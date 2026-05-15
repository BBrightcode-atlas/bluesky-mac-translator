import { beforeEach, describe, expect, it } from 'vitest';
import { findReplyComposer } from './compose-detector';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function mountReplyFixture(opts: { withQuotedPost: boolean }): { compose: HTMLElement; quoted: HTMLElement | null } {
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'dialog');
  let quoted: HTMLElement | null = null;
  if (opts.withQuotedPost) {
    quoted = document.createElement('div');
    quoted.setAttribute('data-testid', 'composerReplyTo');
    const txt = document.createElement('div');
    txt.setAttribute('data-testid', 'postText');
    txt.textContent = 'Original post body';
    quoted.appendChild(txt);
    wrap.appendChild(quoted);
  }
  const compose = document.createElement('div');
  compose.setAttribute('data-testid', 'composerTextInput');
  compose.setAttribute('role', 'textbox');
  compose.setAttribute('contenteditable', 'true');
  wrap.appendChild(compose);
  document.body.appendChild(wrap);
  return { compose, quoted };
}

describe('findReplyComposer', () => {
  it('reply (compose + quoted post) → 둘 다 반환', () => {
    const { compose, quoted } = mountReplyFixture({ withQuotedPost: true });
    const found = findReplyComposer(document);
    expect(found?.composeEl).toBe(compose);
    expect(found?.originalPostEl).toBe(quoted);
  });
  it('새 글 (compose only, no quoted) → null', () => {
    mountReplyFixture({ withQuotedPost: false });
    expect(findReplyComposer(document)).toBeNull();
  });
  it('compose 자체가 없음 → null', () => {
    expect(findReplyComposer(document)).toBeNull();
  });
});
