import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { encode, decode, readMessages } from './protocol';
import type { Request, Response } from './types';

describe('protocol', () => {
  it('encode prefixes 4-byte little-endian length', () => {
    const buf = encode({ type: 'status' });
    const len = buf.readUInt32LE(0);
    expect(len).toBe(JSON.stringify({ type: 'status' }).length);
    expect(buf.subarray(4).toString('utf8')).toBe('{"type":"status"}');
  });

  it('decode round-trips a single message', () => {
    const msg: Response = { type: 'status', running: true, port: 11434, pid: 42 };
    const decoded = decode<Response>(encode(msg));
    expect(decoded).toEqual(msg);
  });

  it('readMessages yields each message from a chunked stream', async () => {
    const a: Request = { type: 'status' };
    const b: Request = { type: 'restart' };
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
