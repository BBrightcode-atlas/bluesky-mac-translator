import injectedCss from '../styles/inject.css?raw';

export interface ReplyTranslatorHandle {
  host: HTMLElement;
  trigger: HTMLButtonElement;
  applyBtn: HTMLButtonElement;
  result: HTMLDivElement;
  show(): void;
  hide(): void;
  reset(): void;
  appendChunk(chunk: string): void;
  showError(message: string, onRetry: () => void): void;
  showApply(onApply: () => void): void;
  hideApply(): void;
  destroy(): void;
}

/**
 * Where to insert the translator host element relative to `el`.
 *  - 'after'  : host becomes el.nextSibling (default; works for bluesky reply).
 *  - 'append' : host becomes el's last child.
 */
export interface MountTarget {
  el: HTMLElement;
  position: 'after' | 'append';
}

export function mountReplyTranslatorUI(
  composeEl: HTMLElement,
  mountTarget?: MountTarget,
): ReplyTranslatorHandle {
  const host = document.createElement('div');
  host.className = 'flotter-reply-translator-host';
  // Force full-width block so flex-column parents (buffer reply form) don't
  // shrink the host to its content's intrinsic min-width, which would wrap
  // every Korean character onto its own line.
  host.style.display = 'block';
  host.style.width = '100%';
  host.style.minWidth = '0';
  const stop = (e: Event) => e.stopPropagation();
  host.addEventListener('click', stop);
  host.addEventListener('pointerdown', stop);
  host.addEventListener('mousedown', stop);
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

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'trigger apply';
  applyBtn.textContent = '반영하기';
  applyBtn.hidden = true;
  row.appendChild(applyBtn);

  // applyBtn click handler is set per-translation via showApply(); we keep a
  // single listener and dispatch to the most recently registered callback so
  // that re-translating doesn't accumulate stale closures.
  let onApplyCb: (() => void) | null = null;
  applyBtn.addEventListener('click', () => {
    onApplyCb?.();
  });

  const result = document.createElement('div') as HTMLDivElement;
  result.className = 'result';
  result.hidden = true;
  const resultText = document.createTextNode('');
  result.appendChild(resultText);

  shadow.appendChild(row);
  shadow.appendChild(result);

  const target: MountTarget = mountTarget ?? { el: composeEl, position: 'after' };
  if (target.position === 'append') {
    target.el.appendChild(host);
  } else {
    target.el.parentNode?.insertBefore(host, target.el.nextSibling);
  }

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
    applyBtn,
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
      applyBtn.hidden = true;
      onApplyCb = null;
    },
    appendChunk(chunk) {
      result.removeAttribute('data-state');
      ensureResultText().appendData(chunk);
    },
    showError(message, onRetry) {
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
      applyBtn.hidden = true;
      onApplyCb = null;
    },
    showApply(cb) {
      onApplyCb = cb;
      applyBtn.hidden = false;
    },
    hideApply() {
      applyBtn.hidden = true;
      onApplyCb = null;
    },
    destroy() {
      host.remove();
    },
  };
}
