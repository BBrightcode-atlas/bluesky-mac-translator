import injectedCss from '../styles/inject.css?raw';
import { findPostTextNode } from './post-detector';
import { LANG_OPTIONS } from './prompts';

export interface TranslatorHandle {
  host: HTMLElement;
  trigger: HTMLButtonElement;
  lang: HTMLSelectElement;
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

  const lang = document.createElement('select');
  lang.className = 'lang';
  for (const opt of LANG_OPTIONS) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    lang.appendChild(optionEl);
  }
  row.appendChild(lang);

  const result = document.createElement('div') as HTMLDivElement;
  result.className = 'result';
  result.hidden = true;
  const resultText = document.createTextNode('');
  result.appendChild(resultText);

  shadow.appendChild(row);
  shadow.appendChild(result);

  const textNode = findPostTextNode(postEl);
  if (textNode?.parentNode) {
    textNode.parentNode.insertBefore(host, textNode.nextSibling);
  } else {
    postEl.appendChild(host);
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
    lang,
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
