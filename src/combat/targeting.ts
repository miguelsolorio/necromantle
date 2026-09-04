import { Vector3 } from '@babylonjs/core';
import type { ThirdPersonCamera } from '@/camera/thirdPerson';
import type { Enemy } from '@/enemies/enemy';
import type { World } from '@/world/world';

/**
 * Generous soft-lock (design section 7): score every visible enemy by angle to the reticle, screen distance and
 * world distance. Player intent beats precision; nothing snaps the camera.
 */
export class Targeting {
  target: Enemy | null = null;
  /** World point attacks should travel toward. */
  readonly aimPoint = new Vector3();
  /** Centre of the enemy cluster nearest the reticle (for AoE). */
  readonly clusterPoint = new Vector3();
  maxAngle = 0.42;            // radians from the view axis
  private tmp = new Vector3();

  update(cam: ThirdPersonCamera, enemies: Enemy[], from: Vector3, world: World, range = 32): void {
    const ray = cam.aimRay(range + 10);
    let best: Enemy | null = null, bestScore = -Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const c = e.hitCenter();
      this.tmp.copyFrom(c).subtractInPlace(ray.origin);
      const dist = this.tmp.length();
      if (dist > range + 8) continue;
      const cos = Vector3.Dot(this.tmp.scale(1 / dist), ray.direction);
      const ang = Math.acos(Math.min(1, Math.max(-1, cos)));
      if (ang > this.maxAngle) continue;
      const worldDist = Vector3.Distance(from, c);
      // closer to the reticle matters most; nearer enemies win ties; elites get a nudge
      const score = -ang * 3.2 - worldDist * 0.045 + (e.elite ? 0.25 : 0);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    // line of sight check on the winner only
    if (best) {
      const blocked = world.obstruct(from.add(new Vector3(0, 1.2, 0)), best.hitCenter());
      if (blocked !== null && blocked < Vector3.Distance(from, best.hitCenter()) - 0.6) best = null;
    }
    this.target = best;
    if (best) {
      this.aimPoint.copyFrom(best.hitCenter());
      // cluster: average of enemies within 3 m of the target
      let n = 0; this.clusterPoint.setAll(0);
      for (const e of enemies) { if (e.alive && Vector3.Distance(e.position, best.position) < 3) { this.clusterPoint.addInPlace(e.position); n++; } }
      this.clusterPoint.scaleInPlace(1 / Math.max(1, n));
    } else {
      // no target: aim where the view ray meets the world, or a point out along the ray
      const hit = world.raycastStatic(ray);
      if (hit) this.aimPoint.copyFrom(hit); else this.aimPoint.copyFrom(ray.origin).addInPlace(ray.direction.scale(Math.min(range, 24)));
      if (this.aimPoint.y < from.y + 0.6) this.aimPoint.y = from.y + 1.0;
      this.clusterPoint.copyFrom(this.aimPoint);
    }
  }

  /** Direction from a muzzle point to the aim point, with a little lift so shots do not plough into the floor. */
  direction(from: Vector3, out = new Vector3()): Vector3 {
    out.copyFrom(this.aimPoint).subtractInPlace(from);
    if (out.lengthSquared() < 0.01) out.set(0, 0, 1);
    return out.normalize();
  }
}
