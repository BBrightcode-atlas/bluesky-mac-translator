// Buffer (publish.buffer.com) composer detector.
// Observed shape (2026-05): each compose textarea is a Slate.js contenteditable
// DIV with `data-testid="composer-text-area"` (verified via playwright DOM dump).
// In thread mode a single modal can hold multiple composer-text-area elements
// (one per thread post), so we always return an array.

const COMPOSER_SELECTOR = '[data-testid="composer-text-area"]';
const PROCESSED_ATTR = 'data-translator-buffer-mounted';

export function findBufferComposers(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(COMPOSER_SELECTOR));
}

export function isBufferComposerProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(PROCESSED_ATTR);
}

export function markBufferComposerProcessed(el: HTMLElement): void {
  el.setAttribute(PROCESSED_ATTR, '1');
}
