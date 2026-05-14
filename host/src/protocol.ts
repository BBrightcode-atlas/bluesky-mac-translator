import type { Readable } from 'node:stream';

export function encode(msg: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

export function decode<T>(buf: Buffer): T {
  const len = buf.readUInt32LE(0);
  return JSON.parse(buf.subarray(4, 4 + len).toString('utf8')) as T;
}

export async function* readMessages<T>(stream: Readable): AsyncGenerator<T> {
  let buf = Buffer.alloc(0);
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) break;
      const json = buf.subarray(4, 4 + len).toString('utf8');
      buf = buf.subarray(4 + len);
      yield JSON.parse(json) as T;
    }
  }
}
