const COMPOSE_SELECTORS = [
  '[data-testid="composerTextInput"]',
  '[role="textbox"][contenteditable="true"]', // fallback
] as const;

const QUOTED_POST_SELECTORS = [
  '[data-testid="composerReplyTo"]',
  // 필요 시 Step 1 실측 결과 추가
] as const;

const PROCESSED_ATTR = 'data-translator-reply-mounted';

export interface ReplyComposerHit {
  composeEl: HTMLElement;
  originalPostEl: HTMLElement;
}

export function findReplyComposer(root: ParentNode): ReplyComposerHit | null {
  let compose: HTMLElement | null = null;
  for (const sel of COMPOSE_SELECTORS) {
    compose = root.querySelector<HTMLElement>(sel);
    if (compose) break;
  }
  if (!compose) return null;
  let quoted: HTMLElement | null = null;
  for (const sel of QUOTED_POST_SELECTORS) {
    quoted = root.querySelector<HTMLElement>(sel);
    if (quoted) break;
  }
  if (!quoted) return null;
  return { composeEl: compose, originalPostEl: quoted };
}

export function isReplyComposerProcessed(el: HTMLElement): boolean {
  return el.hasAttribute(PROCESSED_ATTR);
}

export function markReplyComposerProcessed(el: HTMLElement): void {
  el.setAttribute(PROCESSED_ATTR, '1');
}
