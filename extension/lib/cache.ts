export class LruCache<V> {
  private readonly max: number;
  private readonly map = new Map<string, V>();

  constructor(max: number) {
    this.max = max;
  }

  get(k: string): V | undefined {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }

  set(k: string, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
