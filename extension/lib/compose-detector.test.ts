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

// Mirrors the real Bluesky reply modal shape observed 2026-05:
// composePostView wraps the entire modal; inside it there's a plain
// contenteditable DIV (no testid/role/aria) and a [data-testid="postText"]
// for the quoted original post.
function mountRealBlueskyReplyFixture(): { compose: HTMLElement; quoted: HTMLElement } {
  const view = document.createElement('div');
  view.setAttribute('data-testid', 'composePostView');
  const postText = document.createElement('div');
  postText.setAttribute('data-testid', 'postText');
  postText.textContent = 'Original post body';
  view.appendChild(postText);
  const compose = document.createElement('div');
  compose.setAttribute('contenteditable', 'true');
  view.appendChild(compose);
  document.body.appendChild(view);
  return { compose, quoted: postText };
}

describe('findReplyComposer', () => {
  it('실제 Bluesky 모달 (composePostView + 평범한 contenteditable + postText) → 둘 다 반환', () => {
    const { compose, quoted } = mountRealBlueskyReplyFixture();
    const found = findReplyComposer(document);
    expect(found?.composeEl).toBe(compose);
    expect(found?.originalPostEl).toBe(quoted);
  });

  it('reply (compose + quoted post) → 둘 다 반환 (legacy fallback selectors)', () => {
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
