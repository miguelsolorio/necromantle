import { AbstractMesh, Color3, Mesh, MeshBuilder, PBRMaterial, PointLight, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import type { AssetLoader } from '@/assets/loader';
import type { ThirdPersonCamera } from '@/camera/thirdPerson';
import { PLAYER, XP_TABLE } from '@/content/player';
import { CLASSES, type ClassDef } from '@/content/classes';
import { PALETTE } from '@/content/palette';
import type { AbilityDef } from '@/content/abilities';
import { clamp, damp, dampAngle, dirToYaw } from '@/core/mathx';
import type { EventBus } from '@/core/events';
import type { Input } from '@/input/input';
import type { RenderRig } from '@/rendering/setup';
import type { World } from '@/world/world';
import { Animator } from './animator';
import { audio } from '@/audio';

/** glTF characters from this pack face +Z after Babylon's handedness conversion; tune here if a model faces backwards. */
const MODEL_YAW_OFFSET = 0;

export interface Stats { vitality: number; power: number; intelligence: number; armor: number; critChance: number; critDamage: number; attackSpeed: number }

export class Player {
  readonly root: TransformNode;
  readonly collider: Mesh;
  readonly cls: ClassDef = CLASSES.sorcerer;
  model!: TransformNode;
  animator: Animator | null = null;
  readonly velocity = new Vector3();
  yaw = 0;
  level = 1;
  xp = 0;
  stats: Stats = { ...PLAYER.base };
  hpMax = 0; hp = 0;
  energyMax = CLASSES.sorcerer.resource.max; energy = CLASSES.sorcerer.resource.start;
  invulnerable = 0;
  stance = 0;             // seconds remaining in combat stance (faces camera, strafes)
  castLock = 0;           // seconds the player is held by a cast animation
  potionCd = 0;
  dead = false;
  moving = false;
  speedMult = 1;
  chilled = 0;
  private shoveVel = new Vector3();
  grounded = true;
  private vy = 0;
  private staffTipNode: TransformNode | null = null;
  private handNode: TransformNode | null = null;
  readonly staffLight: PointLight;
  private tmp = new Vector3();
  private tmpMove = new Vector3();
  private modelTint = new Color3(1, 1, 1);
  private stepTimer = 0;

  constructor(private scene: Scene, private bus: EventBus) {
    this.root = new TransformNode('player', scene);
    this.collider = MeshBuilder.CreateCapsule('player.collider', { radius: PLAYER.radius, height: PLAYER.height, subdivisions: 2, tessellation: 8 }, scene);
    this.collider.isVisible = false;
    this.collider.isPickable = false;
    this.collider.ellipsoid = new Vector3(PLAYER.radius, PLAYER.height / 2, PLAYER.radius);
    this.collider.ellipsoidOffset = new Vector3(0, PLAYER.height / 2, 0);
    this.collider.checkCollisions = true;
    this.collider.collisionGroup = 4; this.collider.collisionMask = 1 | 2;
    this.staffLight = new PointLight('player.staffLight', new Vector3(0, 1.8, 0), scene);
    this.staffLight.diffuse = PALETTE.arcane.clone();
    this.staffLight.specular = PALETTE.arcaneCore.scale(0.3);
    this.staffLight.intensity = 2.2;
    this.staffLight.range = 7;
    this.staffLight.renderPriority = 80;
    this.recalcStats();
    this.hp = this.hpMax;
  }

  get position(): Vector3 { return this.root.position; }

  async load(loader: AssetLoader, rig: RenderRig): Promise<void> {
    const inst = await loader.instanceCharacter(this.cls.model, this.cls.id);
    this.model = inst.root;
    this.model.parent = this.root;
    if (!inst.failed) {
      const scale = this.cls.height / 2.2;
      this.model.scaling.setAll(scale);
      this.animator = new Animator(inst.groups);
      this.animator.play(this.cls.anims.idle);
      this.handNode = inst.nodes.find((n) => n.name.endsWith('handslot.r')) ?? inst.nodes.find((n) => n.name.endsWith('hand.r')) ?? null;
      for (const m of inst.meshes) {
        rig.addCaster(m);
        m.receiveShadows = true;
        const mat = m.material as PBRMaterial | null;
        if (mat && mat instanceof PBRMaterial) { mat.metallic = 0; mat.roughness = 0.85; mat.specularIntensity = 0.3; mat.albedoColor = new Color3(0.95, 0.8, 1.05); mat.maxSimultaneousLights = 8; }
      }
      // The pack's Mage carries a wand, a two-handed staff and two spellbooks: keep the staff and the closed book only.
      let staffMesh: AbstractMesh | null = null;
      for (const m of inst.meshes) {
        const n = m.name.split('|').pop() ?? '';
        if (this.cls.hideMeshes.includes(n)) m.setEnabled(false);
        if (n === this.cls.weaponMesh) staffMesh = m;
      }
      const tip = new TransformNode('sorcerer.staffTip', this.scene);
      if (staffMesh) {
        // the staff's long axis is not necessarily local Y: take the far end of the longest axis, whichever end is higher in the bind pose
        const bb = staffMesh.getBoundingInfo().boundingBox;
        const ext = bb.maximum.subtract(bb.minimum); const mid = bb.minimum.add(bb.maximum).scale(0.5);
        const axis = ext.x > ext.y && ext.x > ext.z ? 'x' : ext.z > ext.y ? 'z' : 'y';
        const a = mid.clone(); const b = mid.clone();
        (a as any)[axis] = (bb.minimum as any)[axis]; (b as any)[axis] = (bb.maximum as any)[axis];
        staffMesh.computeWorldMatrix(true);
        const wm = staffMesh.getWorldMatrix();
        const hand = this.handNode ? this.handNode.getAbsolutePosition() : Vector3.Zero();
        // the grip is near the hand; the head is the end farthest from it
        const best = Vector3.Distance(Vector3.TransformCoordinates(a, wm), hand) > Vector3.Distance(Vector3.TransformCoordinates(b, wm), hand) ? a : b;
        tip.parent = staffMesh;
        tip.position.copyFrom(best);
      } else if (this.handNode) { tip.parent = this.handNode; tip.position.set(0, 1.5, 0); }
      this.staffTipNode = tip;
      // arcane crystal at the tip
      const crystal = MeshBuilder.CreateSphere('sorcerer.crystal', { diameter: 0.22, segments: 8 }, this.scene);
      const cm = new PBRMaterial('sorcerer.crystalMat', this.scene);
      cm.emissiveColor = PALETTE.arcaneCore.clone(); cm.albedoColor = Color3.Black(); cm.metallic = 0; cm.roughness = 0.3;
      crystal.material = cm; crystal.parent = tip; crystal.isPickable = false; rig.addGlow(crystal);
      if (staffMesh) crystal.scaling.setAll(1 / (this.cls.height / 2.2));
    }
  }

  recalcStats(): void {
    const l = this.level - 1;
    this.stats = {
      vitality: PLAYER.base.vitality + PLAYER.perLevel.vitality * l,
      power: PLAYER.base.power + PLAYER.perLevel.power * l,
      intelligence: PLAYER.base.intelligence + PLAYER.perLevel.intelligence * l,
      armor: PLAYER.base.armor + PLAYER.perLevel.armor * l,
      critChance: PLAYER.base.critChance, critDamage: PLAYER.base.critDamage, attackSpeed: PLAYER.base.attackSpeed,
    };
    this.hpMax = this.stats.vitality * PLAYER.hpPerVitality;
  }

  /** Multiplier applied to ability base damage. */
  spellPower(): number { return 1 + this.stats.intelligence / 60 + this.stats.power / 200; }

  staffTip(): Vector3 {
    if (this.staffTipNode) return this.staffTipNode.getAbsolutePosition();
    return this.root.position.add(new Vector3(Math.sin(this.yaw) * 0.6, 1.5, Math.cos(this.yaw) * 0.6));
  }
  chest(): Vector3 { return this.root.position.add(new Vector3(0, 1.1, 0)); }

  addXp(n: number): void {
    this.xp += n;
    while (this.level < XP_TABLE.length - 1 && this.xp >= XP_TABLE[this.level]) {
      this.xp -= XP_TABLE[this.level];
      this.level++;
      this.recalcStats();
      this.hp = this.hpMax; this.energy = this.energyMax;
      this.bus.emit('player:levelup', { level: this.level });
    }
  }
  xpToNext(): number { return XP_TABLE[Math.min(this.level, XP_TABLE.length - 1)]; }

  takeDamage(n: number, god = false): void {
    if (this.dead || this.invulnerable > 0 || god) return;
    const mitigated = n * (100 / (100 + this.stats.armor * 0.6));
    this.hp = Math.max(0, this.hp - mitigated);
    this.bus.emit('player:damaged', { amount: mitigated });
    this.animator?.once(this.cls.anims.hit, { speed: 1.6 });
    if (this.hp <= 0) this.die();
  }
  heal(n: number): void { const before = this.hp; this.hp = Math.min(this.hpMax, this.hp + n); this.bus.emit('player:healed', { amount: this.hp - before }); }
  addEnergy(n: number): void { this.energy = clamp(this.energy + n, 0, this.energyMax); }
  spendEnergy(n: number): boolean { if (this.energy < n) return false; this.energy -= n; return true; }
  usePotion(): boolean { if (this.potionCd > 0 || this.dead) return false; this.potionCd = PLAYER.potionCooldown; this.heal(this.hpMax * PLAYER.potionHeal); return true; }

  private die(): void {
    this.dead = true;
    this.animator?.clearOneShot();
    this.animator?.once(this.cls.anims.death, { speed: 1 });
    this.velocity.setAll(0);
  }
  respawn(at: Vector3): void {
    this.dead = false; this.hp = this.hpMax; this.energy = 40; this.invulnerable = 1.5;
    this.root.position.copyFrom(at); this.collider.position.copyFrom(at);
    this.animator?.clearOneShot(); this.animator?.play(this.cls.anims.idle);
  }

  /** Called by abilities. Plays the cast pose when standing, keeps the run when moving. */
  cast(def: AbilityDef): void {
    this.stance = PLAYER.combatStance;
    if (def.animLock > 0) this.castLock = def.animLock;
    if (this.animator && (!this.moving || def.animLock > 0)) {
      this.animator.clearOneShot();
      this.animator.once(def.anim, { speed: def.animLock > 0 ? 1.4 : 2.2 });
    }
  }

  /** External push (charges, pulls): applied over `duration` seconds through the collision sweep. */
  shove(delta: Vector3, duration = 0.25): void { this.shoveVel.copyFrom(delta).scaleInPlace(1 / duration); this.shoveT = duration; }
  private shoveT = 0;

  /** Instant displacement with collision sweep (Rift Step). Returns the actual landing point. */
  teleport(delta: Vector3): Vector3 {
    const steps = 6;
    const seg = delta.scale(1 / steps);
    for (let i = 0; i < steps; i++) { this.collider.computeWorldMatrix(true); this.collider.moveWithCollisions(seg); }
    this.root.position.copyFrom(this.collider.position);
    return this.root.position.clone();
  }

  update(dt: number, input: Input, cam: ThirdPersonCamera, world: World): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.stance = Math.max(0, this.stance - dt);
    this.castLock = Math.max(0, this.castLock - dt);
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.energy = clamp(this.energy + this.cls.resource.regen * dt, 0, this.energyMax);
    this.staffLight.position.copyFrom(this.staffTip());

    if (this.dead) { this.animator?.update(dt); return; }

    // desired velocity relative to camera
    const axis = input.moveAxis();
    const wantMove = (axis.x !== 0 || axis.z !== 0) && this.castLock <= 0;
    const inStance = this.stance > 0;
    const sprint = input.sprint && !inStance;
    const maxSpeed = (sprint ? PLAYER.sprintSpeed : inStance ? PLAYER.strafeSpeed : PLAYER.jogSpeed) * this.speedMult;
    this.tmpMove.set(cam.forward.x * axis.z + cam.right.x * axis.x, 0, cam.forward.z * axis.z + cam.right.z * axis.x);
    const target = wantMove ? this.tmpMove.normalize().scaleInPlace(maxSpeed) : Vector3.ZeroReadOnly;
    const rate = wantMove ? PLAYER.accel : PLAYER.decel;
    this.velocity.x = damp(this.velocity.x, target.x, rate / maxSpeed * 4, dt);
    this.velocity.z = damp(this.velocity.z, target.z, rate / maxSpeed * 4, dt);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.moving = speed > 0.3;
    if (this.moving && this.castLock <= 0 && this.animator?.busy) this.animator.clearOneShot();

    // facing
    const targetYaw = inStance ? cam.yaw : this.moving ? dirToYaw(this.velocity) : this.yaw;
    this.yaw = dampAngle(this.yaw, targetYaw, inStance ? 20 : PLAYER.turnRate, dt);
    this.model.rotation.y = this.yaw + MODEL_YAW_OFFSET;

    // ground and gravity
    const groundY = world.groundY(this.collider.position.x, this.collider.position.z, this.collider.position.y + 1);
    const feetY = this.collider.position.y;
    if (groundY !== null && feetY - groundY < 0.6 && this.vy <= 0) { this.grounded = true; this.vy = 0; }
    else { this.grounded = false; this.vy -= PLAYER.gravity * dt; }

    if (this.shoveT > 0) { this.shoveT -= dt; this.velocity.x += this.shoveVel.x * dt * 4; this.velocity.z += this.shoveVel.z * dt * 4; }
    if (this.chilled > 0) { this.chilled -= dt; if (this.chilled <= 0) this.speedMult = 1; }
    this.tmp.set(this.velocity.x * dt, this.vy * dt, this.velocity.z * dt);
    // Babylon caches world matrices per render id; several fixed steps per frame would otherwise collide from a stale position
    this.collider.computeWorldMatrix(true);
    this.collider.moveWithCollisions(this.tmp);
    if (this.grounded && groundY !== null) this.collider.position.y = damp(this.collider.position.y, groundY, 30, dt);
    if (this.collider.position.y < -20) this.collider.position.y = 5;
    this.root.position.copyFrom(this.collider.position);

    // footsteps keyed to the locomotion cadence
    if (this.moving && this.grounded) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = sprint ? 0.26 : inStance ? 0.36 : 0.32; audio.play('footstep', undefined, { pitch: 0.85 + Math.random() * 0.3, gain: sprint ? 0.5 : 0.35 }); }
    } else this.stepTimer = 0.05;
    // animation selection
    if (this.animator && !this.animator.busy) {
      const a = this.cls.anims;
      if (!this.moving) this.animator.play(a.idle);
      else if (inStance) {
        const rel = Math.atan2(this.velocity.x, this.velocity.z) - cam.yaw;
        const s = Math.sin(rel), c = Math.cos(rel);
        if (c < -0.5) this.animator.play(a.back, { speed: 1.4 });
        else if (Math.abs(s) > 0.6) this.animator.play(s > 0 ? a.strafeR : a.strafeL, { speed: 1.1 });
        else this.animator.play(a.run, { speed: 1.0 });
      } else if (sprint) this.animator.play(a.run, { speed: 1.35 });
      else this.animator.play(a.run, { speed: 1.0 });
    }
    this.animator?.update(dt);
  }
}
