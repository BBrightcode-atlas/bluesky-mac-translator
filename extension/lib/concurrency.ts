export class Semaphore {
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly cap: number) {}

  async acquire(): Promise<() => void> {
    const makeRelease = (): (() => void) => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.release();
      };
    };
    if (this.inFlight < this.cap) {
      this.inFlight += 1;
      return makeRelease();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.inFlight += 1;
        resolve(makeRelease());
      });
    });
  }

  private release(): void {
    this.inFlight -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}
