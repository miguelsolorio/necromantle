import type { AnimationGroup } from '@babylonjs/core';

interface Track { group: AnimationGroup; weight: number; target: number }

/** Cross-fading animation player over glTF AnimationGroups. One primary clip at a time plus a fading tail. */
export class Animator {
  private tracks = new Map<string, Track>();
  current: string | null = null;
  private oneShot: string | null = null;
  private fadeSpeed = 1 / 0.12;

  constructor(private groups: Map<string, AnimationGroup>) {}

  has(name: string): boolean { return this.groups.has(name); }

  /** Loop `name`, cross-fading from whatever is playing. Returns false if the clip is missing. */
  play(name: string, opts: { speed?: number; fade?: number } = {}): boolean {
    if (this.oneShot) return false;
    if (this.current === name) { const t = this.tracks.get(name); if (t) t.group.speedRatio = opts.speed ?? 1; return true; }
    return this.start(name, true, opts);
  }

  /** Play once at full weight, then return to the loop. `lock` blocks other one-shots until done. */
  once(name: string, opts: { speed?: number; fade?: number; onEnd?: () => void } = {}): boolean {
    const g = this.groups.get(name);
    if (!g) { opts.onEnd?.(); return false; }
    this.oneShot = name;
    const ok = this.start(name, false, opts);
    if (!ok) { this.oneShot = null; opts.onEnd?.(); return false; }
    g.onAnimationGroupEndObservable.addOnce(() => { if (this.oneShot === name) this.oneShot = null; opts.onEnd?.(); });
    return true;
  }

  /** Cancel any one-shot immediately (used when a cast is interrupted by movement). */
  clearOneShot(): void { this.oneShot = null; }
  get busy(): boolean { return this.oneShot !== null; }

  private start(name: string, loop: boolean, opts: { speed?: number; fade?: number }): boolean {
    const g = this.groups.get(name);
    if (!g) return false;
    this.fadeSpeed = 1 / (opts.fade ?? 0.12);
    for (const t of this.tracks.values()) t.target = 0;
    let t = this.tracks.get(name);
    if (!t) { t = { group: g, weight: 0, target: 1 }; this.tracks.set(name, t); }
    t.target = 1;
    g.stop();
    g.start(loop, opts.speed ?? 1);
    g.setWeightForAllAnimatables(t.weight);
    this.current = name;
    return true;
  }

  update(dt: number): void {
    for (const [name, t] of this.tracks) {
      const next = t.target > t.weight ? Math.min(t.target, t.weight + dt * this.fadeSpeed) : Math.max(t.target, t.weight - dt * this.fadeSpeed);
      if (next !== t.weight) {
        t.weight = next;
        if (t.group.isPlaying) t.group.setWeightForAllAnimatables(next);
      }
      if (t.weight <= 0 && t.target <= 0) { t.group.stop(); this.tracks.delete(name); }
    }
  }

  dispose(): void { for (const t of this.tracks.values()) t.group.stop(); this.tracks.clear(); }
}
