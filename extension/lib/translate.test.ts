import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslateError, translateStream } from './translate';

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('translateStream', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('delta.content 토큰 순서대로 yield', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"안"}}]}\n',
        'data: {"choices":[{"delta":{"content":"녕"}}]}\n',
        'data: [DONE]\n',
      ]),
    );
    const tokens: string[] = [];
    for await (const t of translateStream('hi', 'ko', 'http://x', new AbortController().signal)) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['안', '녕']);
  });

  it('chunk 경계가 라인 중간이어도 정확히 파싱', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"안"}}]}\ndata: {"cho',
        'ices":[{"delta":{"content":"녕"}}]}\n',
        'data: [DONE]\n',
      ]),
    );
    const tokens: string[] = [];
    for await (const t of translateStream('hi', 'ko', 'http://x', new AbortController().signal)) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['안', '녕']);
  });

  it('깨진 JSON 라인은 스킵', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        'data: {not json}\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
        'data: [DONE]\n',
      ]),
    );
    const tokens: string[] = [];
    for await (const t of translateStream('hi', 'ko', 'http://x', new AbortController().signal)) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['ok']);
  });

  it('non-2xx는 TranslateError', async () => {
    fetchMock.mockResolvedValueOnce(new Response('err', { status: 500 }));
    await expect(async () => {
      for await (const _t of translateStream(
        'hi',
        'ko',
        'http://x',
        new AbortController().signal,
      )) {
        /* drain */
      }
    }).rejects.toBeInstanceOf(TranslateError);
  });
});
