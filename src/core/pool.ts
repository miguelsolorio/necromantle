/** Minimal object pool. `create` builds, `reset` prepares for reuse. */
export class Pool<T> {
  private free: T[] = [];
  readonly active = new Set<T>();
  constructor(private create: () => T, private onRelease?: (t: T) => void, prewarm = 0) {
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }
  get(): T {
    const t = this.free.pop() ?? this.create();
    this.active.add(t);
    return t;
  }
  release(t: T): void {
    if (!this.active.delete(t)) return;
    this.onRelease?.(t);
    this.free.push(t);
  }
}
