import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { decode, encode, readMessages } from './protocol';
import type { Request, Response } from './types';

describe('protocol', () => {
  it('encode prefixes 4-byte little-endian length', () => {
    const buf = encode({ type: 'diagnose' });
    const len = buf.readUInt32LE(0);
    expect(len).toBe(JSON.stringify({ type: 'diagnose' }).length);
    expect(buf.subarray(4).toString('utf8')).toBe('{"type":"diagnose"}');
  });

  it('decode round-trips a single message', () => {
    const msg: Response = { type: 'done' };
    const decoded = decode<Response>(encode(msg));
    expect(decoded).toEqual(msg);
  });

  it('readMessages yields each message from a chunked stream', async () => {
    const a: Request = { type: 'diagnose' };
    const b: Request = { type: 'diagnose' };
    const bufA = encode(a);
    const stream = Readable.from([
      bufA.subarray(0, 3),
      Buffer.concat([bufA.subarray(3), encode(b)]),
    ]);
    const out: Request[] = [];
    for await (const m of readMessages<Request>(stream)) out.push(m);
    expect(out).toEqual([a, b]);
  });

  it('readMessages handles an empty stream cleanly', async () => {
    const stream = Readable.from([] as Buffer[]);
    const out: unknown[] = [];
    for await (const m of readMessages(stream)) out.push(m);
    expect(out).toEqual([]);
  });

  it('decode throws a clear error on a truncated buffer', () => {
    const full = encode({ type: 'status' });
    expect(() => decode(full.subarray(0, 2))).toThrow(/too short for header/);
    expect(() => decode(full.subarray(0, 6))).toThrow(/too short for body/);
  });
});
