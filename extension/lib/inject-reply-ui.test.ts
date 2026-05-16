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

  it('반영하기 버튼: 초기 hidden, showApply로 visible 되고 클릭 시 콜백 호출', () => {
    const h = mountReplyTranslatorUI(makeCompose());
    expect(h.applyBtn.hidden).toBe(true);
    expect(h.applyBtn.textContent).toBe('반영하기');
    let applied = 0;
    h.showApply(() => {
      applied++;
    });
    expect(h.applyBtn.hidden).toBe(false);
    h.applyBtn.click();
    expect(applied).toBe(1);
  });

  it('반영하기 콜백은 최신 showApply만 호출됨 (stale closure 안 쌓임)', () => {
    const h = mountReplyTranslatorUI(makeCompose());
    let stale = 0;
    let fresh = 0;
    h.showApply(() => {
      stale++;
    });
    h.showApply(() => {
      fresh++;
    });
    h.applyBtn.click();
    expect(stale).toBe(0);
    expect(fresh).toBe(1);
  });

  it('mountTarget 옵션: 외부 wrapper의 nextSibling으로 mount (buffer UploadDropzone 케이스)', () => {
    const compose = document.createElement('div');
    compose.setAttribute('data-testid', 'composerTextInput');
    const wrapper = document.createElement('div');
    wrapper.className = 'publish_composerUploadDropzone_A-5Be';
    wrapper.appendChild(compose);
    const outer = document.createElement('div');
    outer.appendChild(wrapper);
    document.body.appendChild(outer);

    const h = mountReplyTranslatorUI(compose, { el: wrapper, position: 'after' });
    expect(wrapper.nextSibling).toBe(h.host);
    expect(wrapper.contains(h.host)).toBe(false); // dropzone 밖
    expect(outer.contains(h.host)).toBe(true);
  });

  it('mountTarget position=append: target의 마지막 자식', () => {
    const compose = document.createElement('div');
    compose.setAttribute('data-testid', 'composerTextInput');
    const card = document.createElement('div');
    card.appendChild(compose);
    document.body.appendChild(card);
    const h = mountReplyTranslatorUI(compose, { el: card, position: 'append' });
    expect(card.lastChild).toBe(h.host);
  });
});
