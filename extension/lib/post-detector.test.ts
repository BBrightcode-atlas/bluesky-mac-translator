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
});

describe('findPostTextNode', () => {
  it('찾으면 element, 없으면 null', () => {
    const el = makePost('feedItem-by-alice', 'hi');
    expect(findPostTextNode(el)?.getAttribute('data-testid')).toBe('postText');
    const empty = makePost('feedItem-by-bob');
    expect(findPostTextNode(empty)).toBeNull();
  });
});
