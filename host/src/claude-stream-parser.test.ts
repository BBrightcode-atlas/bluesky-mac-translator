import { describe, it, expect } from 'vitest';
import { parseStreamLine } from './claude-stream-parser';

describe('parseStreamLine', () => {
  it('빈 줄은 null', () => {
    expect(parseStreamLine('')).toBeNull();
  });

  it('JSON 아닌 줄은 null', () => {
    expect(parseStreamLine('not json')).toBeNull();
  });

  it('text delta가 있는 assistant 이벤트는 텍스트 반환', () => {
    // Actual schema captured from `claude --output-format stream-json --verbose`:
    // type: 'assistant', message.content[0].type === 'text', message.content[0].text === '안녕하세요'
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: '안녕하세요' }] },
    });
    expect(parseStreamLine(line)).toBe('안녕하세요');
  });

  it('system/result 이벤트는 null', () => {
    expect(parseStreamLine(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeNull();
    expect(parseStreamLine(JSON.stringify({ type: 'result' }))).toBeNull();
  });

  it('여러 text block은 이어붙여 반환', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] },
    });
    expect(parseStreamLine(line)).toBe('AB');
  });

  it('text block이 없으면 null', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'x' }] },
    });
    expect(parseStreamLine(line)).toBeNull();
  });
});
