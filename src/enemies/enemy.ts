import { AbstractMesh, Color3, Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import type { EnemyDef } from '@/content/enemies';
import type { EliteModId } from '@/content/elites';
import { Animator } from '@/player/animator';
import type { CharacterInstance } from '@/assets/loader';
import { damp, dampAngle, distXZ, pick, rand } from '@/core/mathx';

const MODEL_YAW_OFFSET = 0;
export type EnemyState = 'spawning' | 'chase' | 'windup' | 'recover' | 'stagger' | 'charge' | 'dead';

/** One enemy: kinematic capsule, animator, small state machine. Movement targets come from the manager. */
export class Enemy {
  readonly root: TransformNode;
  readonly collider: Mesh;
  model: TransformNode | null = null;
  meshes: AbstractMesh[] = [];
  animator: Animator | null = null;
  def!: EnemyDef;
  elite = false;
  mod: EliteModId | null = null;
  modTimer = 0;
  behaviourTimer = 0;
  /** Aura multipliers applied by a nearby necromancer this step. */
  auraSpeed = 1; auraDamage = 1;
  /** Charge state (brute): direction and remaining distance. */
  charge: { dir: Vector3; left: number } | null = null;
  alive = false;
  state: EnemyState = 'dead';
  hp = 0; hpMax = 0;
  yaw = 0;
  radius = 0.4; height = 1.8;
  readonly velocity = new Vector3();
  readonly knock = new Vector3();
  timer = 0;            // state timer
  attackCd = 0;
  burn = 0; burnDps = 0; burnTick = 0;
  chill = 0;            // seconds of slow remaining
  frozen = 0;           // seconds locked solid
  chillExposure = 0;    // time spent chilled recently; freezes weaker enemies past a threshold
  private arc: Vector3 | null = null; // ragdoll-lite launch on a lethal heavy hit
  private arcGround = 0;
  slot = 0;             // ring slot index assigned by manager
  flash = 0;
  deathTimer = 0;
  lastHitDir = new Vector3(0, 0, 1);
  private tinted = false;
  readonly seek = new Vector3();  // desired position (from manager)
  private tmp = new Vector3();
  private center = new Vector3();
  id = 0;

  constructor(private scene: Scene) {
    this.root = new TransformNode('enemy', scene);
    this.collider = MeshBuilder.CreateCapsule('enemy.collider', { radius: 0.4, height: 1.8, subdivisions: 1, tessellation: 6 }, scene);
    this.collider.isVisible = false; this.collider.isPickable = false; this.collider.checkCollisions = true;
    this.collider.collisionGroup = 2; this.collider.collisionMask = 1;
    this.collider.ellipsoid = new Vector3(0.4, 0.9, 0.4); this.collider.ellipsoidOffset = new Vector3(0, 0.9, 0);
  }

  get position(): Vector3 { return this.root.position; }
  hitCenter(): Vector3 { return this.center.copyFrom(this.root.position).addInPlaceFromFloats(0, this.height * 0.55, 0); }

  /** Bind a model instance (once per pooled enemy; models are reused across spawns of the same archetype). */
  bindModel(inst: CharacterInstance, def: EnemyDef): void {
    this.model = inst.root; this.model.parent = this.root; this.meshes = inst.meshes;
    this.model.scaling.setAll(def.height / 2.17);
    this.animator = new Animator(inst.groups);
    for (const m of this.meshes) { m.receiveShadows = true; }
  }

  get plateTitle(): string { return this.elite ? this.def.eliteName : this.def.name; }

  bossPhase = 0;
  slamTimer = 0;

  spawn(def: EnemyDef, pos: Vector3, elite: boolean, id: number, mod: EliteModId | null = null): void {
    this.def = def; this.elite = elite; this.id = id; this.mod = elite ? mod : null; this.bossPhase = 0; this.slamTimer = 5; this.modTimer = 2 + Math.random() * 2; this.behaviourTimer = (def.behaviourCooldown ?? 4) * (0.5 + Math.random() * 0.5); this.charge = null; this.auraSpeed = 1; this.auraDamage = 1;
    const bossy = def.behaviour === 'boss';
    this.radius = def.radius * (elite && !bossy ? 1.3 : 1); this.height = def.height * (elite && !bossy ? 1.3 : 1);
    this.collider.ellipsoid.set(this.radius, this.height / 2, this.radius); this.collider.ellipsoidOffset.set(0, this.height / 2, 0);
    if (this.model) this.model.scaling.setAll((def.height / 2.17) * (elite && !bossy ? 1.3 : 1));
    this.hpMax = Math.round(def.hp * (elite && !bossy ? 4.5 : 1)); this.hp = this.hpMax;
    this.root.position.copyFrom(pos); this.collider.position.copyFrom(pos);
    this.yaw = rand(0, Math.PI * 2);
    this.velocity.setAll(0); this.knock.setAll(0);
    this.alive = true; this.state = 'spawning'; this.timer = 0; this.attackCd = rand(0.3, 1.2);
    this.burn = 0; this.chill = 0; this.frozen = 0; this.chillExposure = 0; this.arc = null; this.flash = 0; this.deathTimer = 0;
    this.root.rotation.x = 0;
    this.root.setEnabled(true); this.collider.setEnabled(true);
    for (const m of this.meshes) m.setEnabled(true);
    if (this.animator) {
      this.animator.clearOneShot();
      const ok = this.animator.once(def.anims.spawn, { speed: 1.6, onEnd: () => { if (this.state === 'spawning') this.state = 'chase'; } });
      if (!ok) this.state = 'chase';
    } else this.state = 'chase';
  }

  /** Chill slows; enough exposure freezes anything that is not elite or heavy. */
  applyChill(duration: number): void {
    this.chill = Math.max(this.chill, duration);
    this.chillExposure += 0.5;
    if (this.chillExposure >= 1.0 && this.frozen <= 0 && !this.elite && this.def.mass < 2 && this.def.behaviour !== 'boss') { this.frozen = 2.5; this.chillExposure = 0; this.state = 'stagger'; this.timer = 2.5; this.animator?.clearOneShot(); }
  }

  /** Damage with an optional knockback impulse (m/s). Returns true if this hit killed it. */
  hurt(amount: number, dir: Vector3 | null, knockback: number): boolean {
    if (!this.alive) return false;
    if (this.frozen > 0) amount *= 1.25;
    this.hp -= amount;
    this.flash = 0.07;
    if (dir) { this.lastHitDir.copyFrom(dir); this.lastHitDir.y = 0; this.lastHitDir.normalize(); }
    if (knockback > 0 && dir) {
      const k = knockback / (this.elite ? this.def.mass * 2 : this.def.mass);
      this.knock.addInPlace(this.tmp.copyFrom(this.lastHitDir).scaleInPlace(k));
    }
    if (this.hp <= 0) { this.die(dir && knockback >= 6 ? this.lastHitDir.scale(knockback * 0.6) : null); return true; }
    // stagger on heavy hits (relative to max hp) or big knockback
    if ((amount > this.hpMax * 0.18 || knockback >= 6) && this.state !== 'windup') {
      this.state = 'stagger'; this.timer = knockback >= 6 ? 0.55 : 0.32;
      this.animator?.clearOneShot(); this.animator?.once(this.def.anims.hit, { speed: 1.5, onEnd: () => { if (this.state === 'stagger') this.state = 'chase'; } });
    }
    return false;
  }

  applyBurn(dps: number, duration: number): void { this.burn = Math.max(this.burn, duration); this.burnDps = Math.max(this.burnDps, dps); }

  private die(launch: Vector3 | null = null): void {
    this.alive = false; this.state = 'dead'; this.hp = 0; this.deathTimer = 0;
    if (launch) { this.arc = new Vector3(launch.x, 4.5 + Math.random() * 2, launch.z); this.arcGround = this.root.position.y; }
    this.frozen = 0; this.chill = 0;
    this.collider.checkCollisions = false; this.collider.setEnabled(false);
    this.animator?.clearOneShot();
    this.animator?.once(pick(this.def.anims.death), { speed: 1.3 });
  }

  /** Pool recycle. */
  hide(): void {
    this.root.setEnabled(false); this.collider.setEnabled(false); this.collider.checkCollisions = true;
    for (const m of this.meshes) m.setEnabled(false);
    this.root.position.y = -200; this.collider.position.y = -200;
  }

  faceToward(p: Vector3, dt: number, rate = this.def.turnRate): void {
    const yaw = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
    this.yaw = dampAngle(this.yaw, yaw, rate, dt);
  }

  /** Integrate movement toward `seek` (set by manager), plus knockback and separation push. */
  integrate(dt: number, groundY: number | null, push: Vector3): void {
    const def = this.def;
    const canMove = (this.state === 'chase' || (this.state === 'charge' && !!this.charge)) && this.frozen <= 0;
    const slow = this.frozen > 0 ? 0 : this.chill > 0 ? 0.45 : 1;
    this.tmp.copyFrom(this.seek).subtractInPlace(this.root.position); this.tmp.y = 0;
    const d = this.tmp.length();
    let desiredX = 0, desiredZ = 0;
    if (this.charge) { desiredX = this.charge.dir.x * 13; desiredZ = this.charge.dir.z * 13; }
    else if (canMove && d > 0.25) { const s = Math.min(def.speed, d * 3) * slow * this.auraSpeed; desiredX = (this.tmp.x / d) * s; desiredZ = (this.tmp.z / d) * s; }
    const accel = this.charge ? 30 : def.accel / def.speed * 3;
    this.velocity.x = damp(this.velocity.x, desiredX, accel, dt);
    this.velocity.z = damp(this.velocity.z, desiredZ, accel, dt);
    this.knock.scaleInPlace(Math.exp(-6 * dt));
    if (this.knock.lengthSquared() < 0.01) this.knock.setAll(0);
    this.tmp.set((this.velocity.x + this.knock.x + push.x) * dt, 0, (this.velocity.z + this.knock.z + push.z) * dt);
    this.collider.computeWorldMatrix(true); // see Player.update: per-render-id matrix cache
    this.collider.moveWithCollisions(this.tmp);
    if (groundY !== null) this.collider.position.y = damp(this.collider.position.y, groundY, 20, dt);
    this.root.position.copyFrom(this.collider.position);
    if (this.model) this.model.rotation.y = this.yaw + MODEL_YAW_OFFSET;
  }

  updateAnimation(dt: number): void {
    if (!this.animator) return;
    if (this.frozen > 0) { this.frozen -= dt; this.animator.setSpeedScale(0); if (this.frozen <= 0 && this.alive) { this.animator.setSpeedScale(1); this.state = 'chase'; } }
    else this.animator.setSpeedScale(this.chill > 0 ? 0.6 : 1);
    if (this.chill > 0) { this.chill -= dt; if (this.chill <= 0) this.chillExposure = 0; }
    if (this.alive && !this.animator.busy && this.frozen <= 0) {
      const sp = Math.hypot(this.velocity.x, this.velocity.z);
      if (this.state === 'chase' && sp > 0.6) this.animator.play(this.def.anims.run, { speed: Math.max(0.8, sp / this.def.speed) * (this.def.speed > 4 ? 1.25 : 1) });
      else this.animator.play(this.def.anims.idle);
    }
    this.animator.update(dt);
    // emissive status tint: hit flash (white-violet), frozen (ice), chilled (pale blue), burning (ember flicker)
    const wasFlashing = this.flash > 0;
    if (this.flash > 0) this.flash -= dt;
    const k = Math.max(0, this.flash / 0.07);
    const status = this.frozen > 0 ? [0.12, 0.42, 0.6] : this.chill > 0 ? [0.04, 0.16, 0.26] : this.burn > 0 ? [0.35 + 0.2 * Math.sin(this.burnTick * 40), 0.1, 0.0] : null;
    if (wasFlashing || status || this.tinted) {
      for (const m of this.meshes) {
        const mat = m.material as PBRMaterial | null;
        if (!mat || !(mat instanceof PBRMaterial) || /eyes/i.test(m.name)) continue;
        const base = (mat.metadata?.baseEmissive as Color3 | undefined) ?? Color3.Black();
        mat.emissiveColor.set(base.r + 0.55 * k + (status?.[0] ?? 0), base.g + 0.45 * k + (status?.[1] ?? 0), base.b + 0.75 * k + (status?.[2] ?? 0));
      }
      this.tinted = !!status || k > 0;
    }
    if (this.elite && this.alive) { const ring = this.root.getChildMeshes().find((m) => m.name.startsWith('aura.')); if (ring) ring.rotation.y += dt * 0.8; }
    // ragdoll-lite: a lethal heavy hit launches the corpse in an arc before it settles
    if (this.arc) {
      this.arc.y -= 22 * dt;
      this.root.position.addInPlace(this.tmp.copyFrom(this.arc).scaleInPlace(dt));
      this.root.rotation.x += dt * 5;
      if (this.root.position.y <= this.arcGround) { this.root.position.y = this.arcGround; this.arc = null; }
    }
    if (!this.alive) {
      this.deathTimer += dt;
      if (this.deathTimer > 2.2) this.root.position.y -= dt * 0.7; // sink
    }
  }
}
