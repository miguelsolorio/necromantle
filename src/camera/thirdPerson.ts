import { Matrix, Ray, Scene, TargetCamera, Vector3 } from '@babylonjs/core';
import { CAMERA } from '@/content/player';
import { clamp, damp, lerp } from '@/core/mathx';

export type Obstruct = (from: Vector3, to: Vector3) => number | null;

/**
 * Over-the-shoulder spring-arm camera (reference rules R-01/R-02): mouse yaw/pitch, shoulder offset,
 * combat blend that pulls back and widens, sphere-cast obstruction and additive shake.
 */
export class ThirdPersonCamera {
  readonly camera: TargetCamera;
  yaw = Math.PI;
  pitch: number = CAMERA.defaultPitch;
  /** 0 = exploration, 1 = heavy combat. Set by the game from nearby enemy count. */
  combatTarget = 0;
  combat = 0;
  distanceOverride: number | null = null;
  /** Title and select screens: the camera glides to a fixed pose and ignores the player. */
  cinematic: { pos: Vector3; target: Vector3 } | null = null;
  private cinePos = new Vector3(); private cineLook = new Vector3(); private cineInit = false;
  fovOverride: number | null = null;
  private dist: number = CAMERA.exploreDistance;
  private shakeAmt = 0;
  private shakeT = 0;
  private shakeDur = 0;
  private tmpDir = new Vector3();
  private tmpRight = new Vector3();
  private orbit = new Vector3();
  private desired = new Vector3();
  private look = new Vector3();
  readonly forward = new Vector3(0, 0, 1);
  readonly right = new Vector3(1, 0, 0);

  constructor(private scene: Scene) {
    this.camera = new TargetCamera('tpc', new Vector3(0, 3, -8), scene);
    this.camera.minZ = 0.15;
    this.camera.maxZ = 600;
    this.camera.fov = (CAMERA.exploreFov * Math.PI) / 180;
    this.camera.inertia = 0;
  }

  shake(amount: number, duration = 0.25): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeDur = duration; this.shakeT = duration;
  }

  update(dt: number, feet: Vector3, mouse: { dx: number; dy: number }, obstruct: Obstruct): void {
    if (this.cinematic) {
      if (!this.cineInit) { this.cinePos.copyFrom(this.cinematic.pos); this.cineLook.copyFrom(this.cinematic.target); this.cineInit = true; }
      const k = 1 - Math.exp(-dt * 1.6);
      this.cinePos.addInPlace(this.cinematic.pos.subtract(this.cinePos).scale(k));
      this.cineLook.addInPlace(this.cinematic.target.subtract(this.cineLook).scale(k));
      this.camera.position.copyFrom(this.cinePos); this.camera.setTarget(this.cineLook);
      this.camera.fov = damp(this.camera.fov, (CAMERA.exploreFov * Math.PI) / 180, 4, dt);
      return;
    }
    this.cineInit = false;
    this.yaw += mouse.dx * CAMERA.sensitivity;
    this.pitch = clamp(this.pitch + mouse.dy * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
    this.combat = damp(this.combat, this.combatTarget, 2.2, dt);

    // horizontal basis
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const targetDist = this.distanceOverride ?? lerp(CAMERA.exploreDistance, CAMERA.combatDistance, this.combat);
    const fov = this.fovOverride ?? lerp(CAMERA.exploreFov, CAMERA.combatFov, this.combat);
    this.camera.fov = damp(this.camera.fov, (fov * Math.PI) / 180, 4, dt);

    // pivot at chest height, pushed to the left shoulder so the character sits on the left third
    const pivotH = CAMERA.pivotHeight + this.combat * 0.4;
    this.orbit.copyFrom(feet).addInPlaceFromFloats(0, pivotH, 0).addInPlace(this.right.scale(CAMERA.shoulder));

    // camera direction from yaw/pitch (pitch positive = looking down)
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.tmpDir.set(-this.forward.x * cp, sp, -this.forward.z * cp); // from orbit toward camera
    this.desired.copyFrom(this.orbit).addInPlace(this.tmpDir.scale(targetDist));

    // obstruction: pull in fast, ease out slow
    const hit = obstruct(this.orbit, this.desired);
    let allowed = targetDist;
    if (hit !== null) allowed = Math.max(1.2, hit - CAMERA.collisionPad);
    this.dist = allowed < this.dist ? allowed : damp(this.dist, allowed, 3, dt);

    this.camera.position.copyFrom(this.orbit).addInPlace(this.tmpDir.scale(this.dist));
    this.look.copyFrom(this.orbit).addInPlace(this.forward.scale(6)).addInPlaceFromFloats(0, -sp * 6 * 0.35, 0);

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmt * (this.shakeT / this.shakeDur);
      this.camera.position.addInPlaceFromFloats((Math.random() - 0.5) * k, (Math.random() - 0.5) * k * 0.7, (Math.random() - 0.5) * k);
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
    this.camera.setTarget(this.look);
    this.tmpRight.copyFrom(this.right);
  }

  /** Ray from the camera along its view direction (screen centre). */
  aimRay(length = 80): Ray {
    const dir = this.camera.getDirection(Vector3.Forward());
    return new Ray(this.camera.position.clone(), dir, length);
  }

  /** Project a world point to CSS pixels. */
  project(p: Vector3, out: { x: number; y: number; z: number; visible: boolean }): void {
    const engine = this.scene.getEngine();
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();
    const v = Vector3.Project(p, Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(w, h));
    const s = engine.getHardwareScalingLevel();
    out.x = v.x * s; out.y = v.y * s; out.z = v.z;
    out.visible = v.z > 0 && v.z < 1 && v.x >= -50 && v.x <= w + 50 && v.y >= -50 && v.y <= h + 50;
  }
}
