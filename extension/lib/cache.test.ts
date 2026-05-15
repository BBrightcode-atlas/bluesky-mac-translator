import { describe, expect, it } from 'vitest';
import { LruCache } from './cache';

describe('LruCache', () => {
  it('set/get round-trip', () => {
    const c = new LruCache<string>(3);
    c.set('a', '1');
    expect(c.get('a')).toBe('1');
  });
  it('miss는 undefined', () => {
    expect(new LruCache<string>(3).get('z')).toBeUndefined();
  });
  it('초과 시 가장 오래된 항목부터 evict', () => {
    const c = new LruCache<string>(2);
    c.set('a', '1');
    c.set('b', '2');
    c.set('c', '3');
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe('2');
  });
  it('get은 LRU 순서 갱신', () => {
    const c = new LruCache<string>(2);
    c.set('a', '1');
    c.set('b', '2');
    c.get('a');
    c.set('c', '3');
    expect(c.get('a')).toBe('1');
    expect(c.get('b')).toBeUndefined();
  });
});
