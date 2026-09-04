import { AbstractMesh, Ray, Scene, Vector3 } from '@babylonjs/core';

const isStatic = (m: AbstractMesh) => !!m.metadata?.static && m.isEnabled();

/** Static-world queries shared by the player, enemies, camera and projectiles. Scenes extend it. */
export class World {
  playerStart = new Vector3(0, 0, -14);
  playerYaw = 0;
  spawnPoints: Vector3[] = [];
  private down = new Vector3(0, -1, 0);
  private ray = new Ray(Vector3.Zero(), Vector3.Down(), 6);
  constructor(readonly scene: Scene) {}

  /** Height of the walkable surface below (x, z), searching down from `fromY`. */
  groundY(x: number, z: number, fromY: number): number | null {
    this.ray.origin.set(x, fromY, z); this.ray.direction.copyFrom(this.down); this.ray.length = 8;
    const hit = this.scene.pickWithRay(this.ray, isStatic);
    return hit?.hit && hit.pickedPoint ? hit.pickedPoint.y : null;
  }

  /** Distance to the first static surface between two points, or null if clear. */
  obstruct(from: Vector3, to: Vector3, pad = 0): number | null {
    const dir = to.subtract(from); const len = dir.length();
    if (len < 0.0001) return null;
    dir.scaleInPlace(1 / len);
    const r = new Ray(from, dir, len + pad);
    const hit = this.scene.pickWithRay(r, isStatic);
    return hit?.hit ? hit.distance : null;
  }

  raycastStatic(ray: Ray): Vector3 | null {
    const hit = this.scene.pickWithRay(ray, isStatic);
    return hit?.hit && hit.pickedPoint ? hit.pickedPoint : null;
  }

  /** A spawn point on a ring around `center` that is on the ground. */
  randomSpawn(center: Vector3, minR: number, maxR: number): Vector3 {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
      const x = center.x + Math.sin(a) * r, z = center.z + Math.cos(a) * r;
      const y = this.groundY(x, z, center.y + 4);
      if (y !== null && Math.abs(y - center.y) < 2.5) return new Vector3(x, y, z);
    }
    return center.clone();
  }
}
