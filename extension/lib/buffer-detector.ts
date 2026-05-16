// Buffer (publish.buffer.com) detectors.
// Observed shapes (2026-05, via playwright DOM dump on a live session):
//
//  1) Publish composer (Create Post modal)
//     - editor:  [data-testid="composer-text-area"]  (Slate.js contenteditable)
//     - toolbar: [data-testid="integrations-bar"]    (mount target)
//
//  2) Community comment thread
//     - thread:  [data-testid="comment-thread-content"]
//     - item:    [data-testid="comment-item"]        (article; body = <span> sibling of <header>)
//     - reply:   [data-testid="reply-form-item"]
//       └ textarea[placeholder^="Type in your reply"]
//       └ footer:  [class*="replyFooter"] (mount target)

const COMPOSER_SELECTOR = '[data-testid="composer-text-area"]';
const COMMENT_ITEM_SELECTOR = '[data-testid="comment-item"]';
const REPLY_FORM_SELECTOR = '[data-testid="reply-form-item"]';

const COMPOSER_PROCESSED = 'data-translator-buffer-mounted';
const COMMENT_PROCESSED = 'data-translator-buffer-comment-mounted';
const REPLY_FORM_PROCESSED = 'data-translator-buffer-replyform-mounted';

// --- Composer (Create Post) ---

export function findBufferComposers(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(COMPOSER_SELECTOR));
}

export function isBufferComposerProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(COMPOSER_PROCESSED);
}

export function markBufferComposerProcessed(el: HTMLElement): void {
  el.setAttribute(COMPOSER_PROCESSED, '1');
}

// --- Community comments ---

export function findBufferComments(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(COMMENT_ITEM_SELECTOR));
}

export function isBufferCommentProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(COMMENT_PROCESSED);
}

export function markBufferCommentProcessed(el: HTMLElement): void {
  el.setAttribute(COMMENT_PROCESSED, '1');
}

/**
 * Extract the body text of a buffer comment. Skips the avatar (ASIDE), header
 * (author/timestamp/like-button), and reply footer. Returns the largest text
 * block — typically the comment body span — or null if empty.
 */
export function extractBufferCommentText(comment: HTMLElement): string | null {
  // Body is a direct child <span> of the content wrapper, placed after the
  // <header>. Querying for the *last* span inside the comment skips the
  // header's smaller spans and the "Like this comment" label.
  const spans = Array.from(comment.querySelectorAll<HTMLElement>(':scope > div span'));
  // Pick the span with the longest trimmed text — the body is always the
  // longest text node in a single-line author / time / body structure.
  let best: { el: HTMLElement; len: number } | null = null;
  for (const s of spans) {
    const t = (s.textContent || '').trim();
    if (t.length > 0 && (!best || t.length > best.len)) best = { el: s, len: t.length };
  }
  return best ? (best.el.textContent || '').trim() : null;
}

// --- Reply form (under a comment thread) ---

export interface ReplyFormHit {
  formEl: HTMLElement; // [data-testid="reply-form-item"]
  textarea: HTMLTextAreaElement;
  footer: HTMLElement | null; // [class*="replyFooter"] inside the form (preferred mount target)
  /** Closest comment whose body should be passed as the originalPost. */
  parentComment: HTMLElement | null;
}

export function findBufferReplyForm(root: ParentNode): ReplyFormHit | null {
  const formEl = root.querySelector<HTMLElement>(REPLY_FORM_SELECTOR);
  if (!formEl) return null;
  const textarea = formEl.querySelector<HTMLTextAreaElement>('textarea');
  if (!textarea) return null;
  const footer = formEl.querySelector<HTMLElement>('[class*="replyFooter"]');
  // Closest preceding comment-item in the thread is the "what we're replying
  // to" — we look up the thread container, then the last comment before the
  // reply form (or any comment if structure is single-comment).
  const thread = formEl.closest<HTMLElement>('[data-testid="comment-thread-content"]');
  const parentComment =
    thread?.querySelector<HTMLElement>(COMMENT_ITEM_SELECTOR) ?? null;
  return { formEl, textarea, footer, parentComment };
}

export function isBufferReplyFormProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(REPLY_FORM_PROCESSED);
}

export function markBufferReplyFormProcessed(el: HTMLElement): void {
  el.setAttribute(REPLY_FORM_PROCESSED, '1');
}
