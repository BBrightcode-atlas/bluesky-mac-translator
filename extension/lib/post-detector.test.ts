import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractPostText,
  findPostTextNode,
  findUnprocessedPosts,
  isProcessed,
  markProcessed,
} from './post-detector';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function makePost(testid: string, postText?: string): HTMLElement {
  const post = document.createElement('div');
  post.setAttribute('data-testid', testid);
  if (postText !== undefined) {
    const t = document.createElement('div');
    t.setAttribute('data-testid', 'postText');
    t.textContent = postText;
    post.appendChild(t);
  }
  document.body.appendChild(post);
  return post;
}

describe('findUnprocessedPosts', () => {
  it('feedItem-by-* testid 매치', () => {
    makePost('feedItem-by-alice', 'hello');
    expect(findUnprocessedPosts(document.body)).toHaveLength(1);
  });

  it('postThreadItem-by-* testid 매치', () => {
    makePost('postThreadItem-by-bob', 'hi');
    expect(findUnprocessedPosts(document.body)).toHaveLength(1);
  });

  it('이미 마킹된 post는 제외', () => {
    const el = makePost('feedItem-by-alice', 'hi');
    markProcessed(el);
    expect(findUnprocessedPosts(document.body)).toHaveLength(0);
    expect(isProcessed(el)).toBe(true);
  });

  it('testid 매치가 0건이면 article[role="article"] fallback', () => {
    const article = document.createElement('article');
    article.setAttribute('role', 'article');
    const t = document.createElement('div');
    t.setAttribute('data-testid', 'postText');
    t.textContent = 'fallback post';
    article.appendChild(t);
    document.body.appendChild(article);
    const found = findUnprocessedPosts(document.body);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(article);
  });

  it('testid 매치가 있으면 fallback은 사용 안 함', () => {
    // testid post 1개 + bare article 1개가 동시에 있으면, fallback은 트리거되지 않고 testid만 반환
    makePost('feedItem-by-alice', 'has testid');
    const article = document.createElement('article');
    article.setAttribute('role', 'article');
    document.body.appendChild(article);
    const found = findUnprocessedPosts(document.body);
    expect(found).toHaveLength(1);
    expect(found[0]?.getAttribute('data-testid')).toBe('feedItem-by-alice');
  });
});

describe('extractPostText', () => {
  it('postText의 trimmed textContent', () => {
    const el = makePost('feedItem-by-alice', '  hello world  ');
    expect(extractPostText(el)).toBe('hello world');
  });

  it('postText 없으면 null', () => {
    const el = makePost('feedItem-by-alice');
    expect(extractPostText(el)).toBeNull();
  });

  it('빈 문자열이면 null', () => {
    const el = makePost('feedItem-by-alice', '   ');
    expect(extractPostText(el)).toBeNull();
  });

  it('postText element 자기 자신을 받으면 그 textContent 반환', () => {
    // compose-detector returns the postText element directly (scoped inside
    // composePostView). extractPostText must support self-match too.
    const t = document.createElement('div');
    t.setAttribute('data-testid', 'postText');
    t.textContent = 'direct postText';
    document.body.appendChild(t);
    expect(extractPostText(t)).toBe('direct postText');
  });

  it('postText 자식/자신이 없으면 element의 textContent fallback', () => {
    // current Bluesky reply modal: quoted post is a button with no postText
    // testid. extractPostText must still return non-null text.
    const btn = document.createElement('button');
    btn.textContent = 'Author Name. Post body text here.';
    document.body.appendChild(btn);
    expect(extractPostText(btn)).toBe('Author Name. Post body text here.');
  });
});

describe('findPostTextNode', () => {
  it('찾으면 element, 없으면 null', () => {
    const el = makePost('feedItem-by-alice', 'hi');
    expect(findPostTextNode(el)?.getAttribute('data-testid')).toBe('postText');
    const empty = makePost('feedItem-by-bob');
    expect(findPostTextNode(empty)).toBeNull();
  });
});
