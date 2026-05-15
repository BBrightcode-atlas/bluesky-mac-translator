import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountReplyTranslatorUI } from './inject-reply-ui';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function makeCompose(): HTMLElement {
  const c = document.createElement('div');
  c.setAttribute('data-testid', 'composerTextInput');
  document.body.appendChild(c);
  return c;
}

describe('mountReplyTranslatorUI', () => {
  it('compose 옆에 Shadow host 삽입', () => {
    const compose = makeCompose();
    const h = mountReplyTranslatorUI(compose);
    expect(compose.nextSibling).toBe(h.host);
    expect(h.host.shadowRoot).not.toBeNull();
  });

  it('"번역" 트리거 버튼 존재', () => {
    const h = mountReplyTranslatorUI(makeCompose());
    expect(h.trigger.tagName).toBe('BUTTON');
    expect(h.trigger.textContent).toBe('번역');
  });

  it('host click 은 부모로 버블링되지 않음 (stopPropagation)', () => {
    const parent = document.createElement('a');
    parent.href = '#';
    const compose = document.createElement('div');
    compose.setAttribute('data-testid', 'composerTextInput');
    parent.appendChild(compose);
    document.body.appendChild(parent);
    const onParent = vi.fn();
    parent.addEventListener('click', onParent);
    const h = mountReplyTranslatorUI(compose);
    h.trigger.click();
    expect(onParent).not.toHaveBeenCalled();
  });

  it('appendChunk 누적 / showError + retry / destroy', () => {
    const h = mountReplyTranslatorUI(makeCompose());
    h.show();
    h.appendChunk('안');
    h.appendChunk('녕');
    expect(h.result.textContent).toBe('안녕');
    let retried = false;
    h.showError('실패', () => {
      retried = true;
    });
    (h.result.querySelector('button.retry') as HTMLButtonElement).click();
    expect(retried).toBe(true);
    h.destroy();
    expect(document.body.contains(h.host)).toBe(false);
  });
});
