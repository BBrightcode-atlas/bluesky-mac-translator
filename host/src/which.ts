import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export interface WhichOptions {
  path?: string;
  access?: (p: string) => void;
}

export function whichInPath(name: string, opts: WhichOptions = {}): string | null {
  const path = opts.path ?? process.env.PATH ?? '';
  if (!path) return null;
  const access = opts.access ?? ((p: string) => accessSync(p, constants.X_OK));
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const full = join(dir, name);
    try {
      access(full);
      return full;
    } catch {
      // try next
    }
  }
  return null;
}
