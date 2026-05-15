// Real-world observation (Bluesky web, 2026-05): reply modal is wrapped in
// `[data-testid="composePostView"]`. The contenteditable inside it carries no
// testid/role/aria-placeholder, so we scope by composePostView first. The
// quoted original post inside the modal also reuses the standard
// `[data-testid="postText"]` element from feed posts.
const COMPOSE_VIEW_SELECTOR = '[data-testid="composePostView"]';

const PROCESSED_ATTR = 'data-translator-reply-mounted';

export interface ReplyComposerHit {
  composeEl: HTMLElement;
  originalPostEl: HTMLElement;
}

export function findReplyComposer(root: ParentNode): ReplyComposerHit | null {
  // 1) Locate the compose modal container. If absent, no reply UI is open.
  const composeView = root.querySelector<HTMLElement>(COMPOSE_VIEW_SELECTOR);
  if (!composeView) {
    // Test fixtures pre-dating composePostView: fall back to a broader heuristic
    // (any contenteditable + any postText element). Production Bluesky always has
    // composePostView, so this path mainly exists for the unit-test fixtures and
    // older DOM revisions.
    return findReplyComposerFallback(root);
  }

  // 2) compose box: first contenteditable inside the modal.
  const compose =
    composeView.querySelector<HTMLElement>('[contenteditable="true"]') ??
    composeView.querySelector<HTMLElement>('[role="textbox"]');
  if (!compose) return null;

  // 3) quoted original post: first postText inside the modal (it precedes the
  //    compose box in DOM order, so querySelector returns the quote, not the
  //    reply draft).
  const quoted = composeView.querySelector<HTMLElement>('[data-testid="postText"]');
  if (!quoted) return null;

  return { composeEl: compose, originalPostEl: quoted };
}

function findReplyComposerFallback(root: ParentNode): ReplyComposerHit | null {
  const compose =
    root.querySelector<HTMLElement>('[data-testid="composerTextInput"]') ??
    root.querySelector<HTMLElement>('[role="textbox"][contenteditable="true"]');
  if (!compose) return null;
  const quoted =
    root.querySelector<HTMLElement>('[data-testid="composerReplyTo"]') ??
    root.querySelector<HTMLElement>('[data-testid="postText"]');
  if (!quoted) return null;
  return { composeEl: compose, originalPostEl: quoted };
}

export function isReplyComposerProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(PROCESSED_ATTR);
}

export function markReplyComposerProcessed(el: HTMLElement): void {
  el.setAttribute(PROCESSED_ATTR, '1');
}
