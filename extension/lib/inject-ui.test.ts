import { beforeEach, describe, expect, it } from 'vitest';
import { mountTranslatorUI } from './inject-ui';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function makePostWithText(): HTMLElement {
  const post = document.createElement('div');
  post.setAttribute('data-testid', 'feedItem-by-x');
  const txt = document.createElement('div');
  txt.setAttribute('data-testid', 'postText');
  txt.textContent = 'hello';
  post.appendChild(txt);
  document.body.appendChild(post);
  return post;
}

describe('mountTranslatorUI', () => {
  it('Shadow DOM host를 postText 다음 형제로 삽입', () => {
    const post = makePostWithText();
    const handle = mountTranslatorUI(post);
    const postText = post.querySelector('[data-testid="postText"]') as HTMLElement;
    expect(postText.nextSibling).toBe(handle.host);
    expect(handle.host.shadowRoot).not.toBeNull();
  });

  it('트리거 버튼은 "번역"', () => {
    const handle = mountTranslatorUI(makePostWithText());
    expect(handle.trigger.textContent).toBe('번역');
    expect(handle.trigger.tagName).toBe('BUTTON');
    expect(handle.trigger.getAttribute('type')).toBe('button');
  });

  it('언어 select 옵션: ko/ja/zh', () => {
    const handle = mountTranslatorUI(makePostWithText());
    const values = Array.from(handle.lang.options).map((o) => o.value);
    expect(values).toEqual(['ko', 'ja', 'zh']);
  });

  it('result 박스는 초기에 hidden', () => {
    expect(mountTranslatorUI(makePostWithText()).result.hidden).toBe(true);
  });

  it('appendChunk는 textContent 누적 (HTML 파싱 안 함)', () => {
    const handle = mountTranslatorUI(makePostWithText());
    handle.show();
    handle.appendChunk('hi ');
    handle.appendChunk('<script>x</script>');
    expect(handle.result.textContent).toBe('hi <script>x</script>');
    expect(handle.result.querySelector('script')).toBeNull();
  });

  it('showError는 메시지 + 재시도 버튼', () => {
    const handle = mountTranslatorUI(makePostWithText());
    let clicked = false;
    handle.showError('실패', () => {
      clicked = true;
    });
    const retry = handle.result.querySelector('button.retry') as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    expect(handle.result.dataset.state).toBe('error');
    retry?.click();
    expect(clicked).toBe(true);
  });

  it('showError 후 reset → appendChunk 하면 에러 흔적 없이 깨끗하게 렌더', () => {
    const handle = mountTranslatorUI(makePostWithText());
    handle.showError('실패', () => {});
    expect(handle.result.dataset.state).toBe('error');
    handle.reset();
    handle.appendChunk('번역됨');
    expect(handle.result.textContent).toBe('번역됨');
    expect(handle.result.dataset.state).toBeUndefined();
    expect(handle.result.querySelector('button.retry')).toBeNull();
  });

  it('showError 직후 reset 없이 appendChunk 해도 에러 노드를 깨뜨리지 않고 self-heal', () => {
    const handle = mountTranslatorUI(makePostWithText());
    handle.showError('실패', () => {});
    // reset()을 건너뛰고 바로 appendChunk — ensureResultText가 result를 정리하고 재구성
    handle.appendChunk('회복');
    expect(handle.result.textContent).toBe('회복');
    expect(handle.result.querySelector('button.retry')).toBeNull();
    expect(handle.result.dataset.state).toBeUndefined();
  });

  it('reset은 result 내용을 비우고, destroy는 host를 DOM에서 제거', () => {
    const post = makePostWithText();
    const handle = mountTranslatorUI(post);
    handle.appendChunk('내용');
    handle.reset();
    expect(handle.result.textContent).toBe('');
    expect(post.contains(handle.host)).toBe(true);
    handle.destroy();
    expect(post.contains(handle.host)).toBe(false);
  });
});
