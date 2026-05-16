import { beforeEach, describe, expect, it } from 'vitest';
import {
  findBufferComposers,
  isBufferComposerProcessed,
  markBufferComposerProcessed,
} from './buffer-detector';

beforeEach(() => {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
});

function makeComposer(text = ''): HTMLElement {
  const c = document.createElement('div');
  c.setAttribute('data-testid', 'composer-text-area');
  c.setAttribute('contenteditable', 'true');
  c.setAttribute('data-slate-editor', 'true');
  c.textContent = text;
  document.body.appendChild(c);
  return c;
}

describe('findBufferComposers', () => {
  it('단일 composer 반환', () => {
    const c = makeComposer('hi');
    expect(findBufferComposers(document)).toEqual([c]);
  });

  it('thread 모드: 여러 composer 모두 반환', () => {
    const a = makeComposer('post 1');
    const b = makeComposer('post 2');
    const c = makeComposer('post 3');
    expect(findBufferComposers(document)).toEqual([a, b, c]);
  });

  it('composer 없으면 빈 배열', () => {
    expect(findBufferComposers(document)).toEqual([]);
  });
});

describe('processed 가드', () => {
  it('mark 후 isProcessed true', () => {
    const c = makeComposer();
    expect(isBufferComposerProcessed(c)).toBe(false);
    markBufferComposerProcessed(c);
    expect(isBufferComposerProcessed(c)).toBe(true);
  });
});
