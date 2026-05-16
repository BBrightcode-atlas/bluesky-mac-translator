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

  // 3) quoted original post. Observed Bluesky shape: the quoted post is a
  //    `[role="button"]` containing a `[data-testid="userAvatarImage"]` of the
  //    quoted author. There's no postText testid on this path. Prefer the
  //    button (so its full textContent — author name + body — reaches the LLM
  //    and gives it stronger language signal). Fall back to postText if a
  //    future DOM revision adds it back.
  const quoted = findQuotedOriginalPost(composeView);
  if (!quoted) return null;

  return { composeEl: compose, originalPostEl: quoted };
}

function findQuotedOriginalPost(composeView: HTMLElement): HTMLElement | null {
  // Preferred: postText element directly (legacy + future DOM).
  const direct = composeView.querySelector<HTMLElement>('[data-testid="postText"]');
  if (direct) return direct;

  // Current Bluesky: first userAvatarImage's closest role=button.
  const firstAvatar = composeView.querySelector<HTMLElement>('[data-testid="userAvatarImage"]');
  if (firstAvatar) {
    const btn = firstAvatar.closest<HTMLElement>('[role="button"]');
    if (btn && composeView.contains(btn)) return btn;
  }
  return null;
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

// Bluesky's "new post" modal — same composePostView shell, same contenteditable
// editor, but NO quoted post block (composerReplyTo / userAvatarImage button).
// We return the compose element only; the caller mounts a generic compose
// translator (settings.bufferTargetLang as target language, same as Buffer).
const NEW_POST_PROCESSED_ATTR = 'data-translator-newpost-mounted';

export function findNewPostComposer(root: ParentNode): HTMLElement | null {
  const composeView = root.querySelector<HTMLElement>(COMPOSE_VIEW_SELECTOR);
  if (!composeView) return null;
  const compose =
    composeView.querySelector<HTMLElement>('[contenteditable="true"]') ??
    composeView.querySelector<HTMLElement>('[role="textbox"]');
  if (!compose) return null;
  // If a quoted post is present, this is a reply — let findReplyComposer
  // handle it instead. We only return for the genuinely new-post case.
  if (findQuotedOriginalPost(composeView)) return null;
  return compose;
}

export function isNewPostComposerProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(NEW_POST_PROCESSED_ATTR);
}

export function markNewPostComposerProcessed(el: HTMLElement): void {
  el.setAttribute(NEW_POST_PROCESSED_ATTR, '1');
}
