export const POST_SELECTORS = [
  '[data-testid^="feedItem-by-"]',
  '[data-testid^="postThreadItem-by-"]',
] as const;

const FALLBACK_SELECTOR = 'article[role="article"]';
const PROCESSED_ATTR = 'data-translator-injected';
const POST_TEXT_SELECTOR = '[data-testid="postText"]';

/**
 * Returns posts not yet marked as processed. The caller MUST call markProcessed()
 * on each returned element before the next invocation, or duplicates will be returned.
 */
export function findUnprocessedPosts(root: ParentNode): HTMLElement[] {
  const selector = POST_SELECTORS.join(',');
  const matches = Array.from(root.querySelectorAll<HTMLElement>(selector));
  // Fallback is exclusive, not additive: it only fires when ZERO testid posts exist.
  // A partial bsky DOM migration (some testid, some bare <article>) would silently
  // skip the bare ones — accepted tradeoff vs. the dedup complexity of merging results.
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
  // querySelector returns first match in document order. For quote-posts (a post
  // embedding another), the outer post's postText precedes the nested one — so this
  // correctly extracts the outer post's text.
  // Also support being called with the postText element itself (compose-detector
  // returns the postText node directly when scoped inside composePostView).
  const node = post.matches(POST_TEXT_SELECTOR) ? post : post.querySelector(POST_TEXT_SELECTOR);
  const text = node?.textContent?.trim() ?? '';
  return text.length > 0 ? text : null;
}

export function findPostTextNode(post: HTMLElement): Element | null {
  return post.querySelector(POST_TEXT_SELECTOR);
}
