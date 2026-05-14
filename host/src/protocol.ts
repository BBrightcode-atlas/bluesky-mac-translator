import type { Readable } from 'node:stream';

export function encode(msg: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8');
  if (json.length > 1_048_576) {
    throw new Error(`NMH message exceeds 1MB limit: ${json.length} bytes`);
  }
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

export function decode<T>(buf: Buffer): T {
  if (buf.length < 4) throw new Error('decode: buffer too short for header');
  const len = buf.readUInt32LE(0);
  if (buf.length < 4 + len) {
    throw new Error(`decode: buffer too short for body (need ${4 + len}, got ${buf.length})`);
  }
  return JSON.parse(buf.subarray(4, 4 + len).toString('utf8')) as T;
}

export async function* readMessages<T>(stream: Readable): AsyncGenerator<T> {
  let buf = Buffer.alloc(0);
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (len > 1_048_576) {
        throw new Error(`NMH message exceeds 1MB limit: ${len} bytes`);
      }
      if (buf.length < 4 + len) break;
      const json = buf.subarray(4, 4 + len).toString('utf8');
      buf = buf.subarray(4 + len);
      yield JSON.parse(json) as T;
    }
  }
}
