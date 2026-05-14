export const POST_SELECTORS = [
  '[data-testid^="feedItem-by-"]',
  '[data-testid^="postThreadItem-by-"]',
] as const;

const FALLBACK_SELECTOR = 'article[role="article"]';
const PROCESSED_ATTR = 'data-translator-injected';
const POST_TEXT_SELECTOR = '[data-testid="postText"]';

export function findUnprocessedPosts(root: ParentNode): HTMLElement[] {
  const selector = POST_SELECTORS.join(',');
  const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
  if (matches.length === 0) {
    return Array.from(root.querySelectorAll<HTMLElement>(FALLBACK_SELECTOR)).filter(
      (el) => !isProcessed(el),
    );
  }
  return matches.filter((el) => !isProcessed(el));
}

export function isProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(PROCESSED_ATTR);
}

export function markProcessed(el: HTMLElement): void {
  el.setAttribute(PROCESSED_ATTR, '1');
}

export function extractPostText(post: HTMLElement): string | null {
  const node = post.querySelector(POST_TEXT_SELECTOR);
  const text = node?.textContent?.trim() ?? '';
  return text.length > 0 ? text : null;
}

export function findPostTextNode(post: HTMLElement): Element | null {
  return post.querySelector(POST_TEXT_SELECTOR);
}
