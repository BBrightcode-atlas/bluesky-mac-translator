import { describe, expect, it, vi } from 'vitest';
import { whichInPath } from './which';

describe('whichInPath', () => {
  it('실행 가능 파일이 PATH 첫 디렉토리에 있으면 그 경로 반환', () => {
    const access = vi.fn().mockImplementation((p: string) => {
      if (p === '/a/foo') return; // OK
      throw new Error('ENOENT');
    });
    expect(whichInPath('foo', { path: '/a:/b', access })).toBe('/a/foo');
  });

  it('나중 디렉토리에 있으면 그 경로 반환', () => {
    const access = vi.fn().mockImplementation((p: string) => {
      if (p === '/b/foo') return;
      throw new Error('ENOENT');
    });
    expect(whichInPath('foo', { path: '/a:/b:/c', access })).toBe('/b/foo');
  });

  it('어디에도 없으면 null', () => {
    const access = vi.fn().mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(whichInPath('foo', { path: '/a:/b', access })).toBeNull();
  });

  it('빈 PATH 처리', () => {
    expect(whichInPath('foo', { path: '', access: vi.fn() })).toBeNull();
  });
});
