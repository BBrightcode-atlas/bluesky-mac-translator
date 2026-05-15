import injectedCss from '../styles/inject.css?raw';

export interface ReplyTranslatorHandle {
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

export function mountReplyTranslatorUI(composeEl: HTMLElement): ReplyTranslatorHandle {
  const host = document.createElement('div');
  host.className = 'flotter-reply-translator-host';
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

  const result = document.createElement('div') as HTMLDivElement;
  result.className = 'result';
  result.hidden = true;
  const resultText = document.createTextNode('');
  result.appendChild(resultText);

  shadow.appendChild(row);
  shadow.appendChild(result);

  composeEl.parentNode?.insertBefore(host, composeEl.nextSibling);

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
    },
    destroy() {
      host.remove();
    },
  };
}
