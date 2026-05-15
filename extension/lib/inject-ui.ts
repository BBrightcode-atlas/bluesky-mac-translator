import injectedCss from '../styles/inject.css?raw';
import { findPostTextNode } from './post-detector';

export interface TranslatorHandle {
  host: HTMLElement;
  trigger: HTMLButtonElement;
  result: HTMLDivElement;
  show(): void;
  hide(): void;
  reset(): void;
  appendChunk(chunk: string): void;
  showError(message: string, onRetry: () => void): void;
  destroy(): void;
}

export function mountTranslatorUI(postEl: HTMLElement): TranslatorHandle {
  const host = document.createElement('div');
  host.className = 'flotter-translator-host';
  // post 카드 전체가 클릭 가능한 link이므로 UI 내부 이벤트가
  // 부모로 버블링되면 상세 페이지로 navigate된다. host에서 일괄 차단.
  const stopBubble = (e: Event) => e.stopPropagation();
  host.addEventListener('click', stopBubble);
  host.addEventListener('pointerdown', stopBubble);
  host.addEventListener('mousedown', stopBubble);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = injectedCss;
  shadow.appendChild(style);

  const row = document.createElement('div');
  row.className = 'row';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'trigger';
  trigger.textContent = '번역';
  row.appendChild(trigger);

  const result = document.createElement('div') as HTMLDivElement;
  result.className = 'result';
  result.hidden = true;
  const resultText = document.createTextNode('');
  result.appendChild(resultText);

  shadow.appendChild(row);
  shadow.appendChild(result);

  // Mount strategy (in priority order):
  //   1. If Bluesky's built-in "Translate" link (Google Translate redirect) is
  //      rendered inside this post, hide it and place our host in its parent —
  //      this is the spot users already expect "번역" to be, and keeps us in
  //      line with bsky's own typography.
  //   2. Otherwise, mount inside postText as its last child (keeps feed and
  //      thread main posts visually consistent — postText sibling drifts far
  //      below the body on thread cards).
  // Note: extractPostText() runs BEFORE mount in attach(), so the source text
  // captured for translation never includes our UI's textContent.
  const bskyTranslateLink = findBskyTranslateLink(postEl);
  if (bskyTranslateLink?.parentNode) {
    bskyTranslateLink.style.display = 'none';
    bskyTranslateLink.parentNode.insertBefore(host, bskyTranslateLink.nextSibling);
  } else {
    const textNode = findPostTextNode(postEl);
    if (textNode) {
      textNode.appendChild(host);
    } else {
      postEl.appendChild(host);
    }
  }

  // showError replaces result's children with a span+button (removing resultText).
  // ensureResultText re-establishes resultText as result's only child so that a
  // subsequent appendChunk never clobbers an error span or prepends stale text.
  function ensureResultText(): Text {
    if (resultText.parentNode !== result) {
      while (result.firstChild) result.removeChild(result.firstChild);
      resultText.data = '';
      result.appendChild(resultText);
    }
    return resultText;
  }

  return {
    host,
    trigger,
    result,
    show() {
      result.hidden = false;
    },
    hide() {
      result.hidden = true;
    },
    reset() {
      while (result.firstChild) result.removeChild(result.firstChild);
      resultText.data = '';
      result.appendChild(resultText);
      result.removeAttribute('data-state');
    },
    appendChunk(chunk: string) {
      result.removeAttribute('data-state');
      ensureResultText().appendData(chunk);
    },
    showError(message: string, onRetry: () => void) {
      while (result.firstChild) result.removeChild(result.firstChild);
      result.dataset.state = 'error';
      const span = document.createElement('span');
      span.textContent = message;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'retry';
      retry.textContent = '다시 시도';
      retry.addEventListener('click', () => onRetry());
      result.appendChild(span);
      result.appendChild(document.createTextNode(' '));
      result.appendChild(retry);
      result.hidden = false;
    },
    destroy() {
      host.remove();
    },
  };
}

export function setThemeTokens(host: HTMLElement, tokens: Record<string, string>): void {
  for (const [k, v] of Object.entries(tokens)) {
    host.style.setProperty(k, v);
  }
}

// Bluesky renders a built-in "Translate" link (opens Google Translate) inside
// each post. We hide it and take its slot so our inline translation appears
// where the user already expects to click. The aria-label is locale-specific —
// keep this list in sync with supported user locales.
const BSKY_TRANSLATE_ARIA_LABELS = ['번역', 'Translate', '翻译', '翻訳'] as const;

export function findBskyTranslateLink(postEl: HTMLElement): HTMLElement | null {
  for (const label of BSKY_TRANSLATE_ARIA_LABELS) {
    const a = postEl.querySelector<HTMLElement>(`a[aria-label="${label}"]`);
    if (a) return a;
  }
  return null;
}
