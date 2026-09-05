import { AbstractMesh, AnimationGroup, Color3, Mesh, MeshBuilder, PBRMaterial, PointLight, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import type { AssetLoader } from '@/assets/loader';
import type { ThirdPersonCamera } from '@/camera/thirdPerson';
import { PLAYER, XP_TABLE } from '@/content/player';
import { CLASSES, type ClassDef } from '@/content/classes';
import type { Element } from '@/content/abilities';
import { type Item, type PowerId, type Slot } from '@/content/items';
import { PASSIVES, passiveSlots, type PassiveId } from '@/content/passives';
import { PALETTE } from '@/content/palette';
import type { AbilityDef } from '@/content/abilities';
import { clamp, damp, dampAngle, dirToYaw } from '@/core/mathx';
import type { EventBus } from '@/core/events';
import type { Input } from '@/input/input';
import type { RenderRig } from '@/rendering/setup';
import type { World } from '@/world/world';
import { addRim } from '@/rendering/rimPlugin';
import { Animator } from './animator';
import { audio } from '@/audio';

/** glTF characters from this pack face +Z after Babylon's handedness conversion; tune here if a model faces backwards. */
const MODEL_YAW_OFFSET = 0;

export interface Stats { vitality: number; power: number; intelligence: number; armor: number; critChance: number; critDamage: number; attackSpeed: number }
export type EquipKey = Slot | 'ring2';
export const EQUIP_KEYS: EquipKey[] = ['weapon', 'head', 'chest', 'gloves', 'boots', 'amulet', 'ring', 'ring2'];
export interface Bonus { arcane: number; fire: number; frost: number; physical: number; moveSpeed: number; energyRegen: number; energyOnHit: number; cooldown: number }

export class Player {
  readonly root: TransformNode;
  readonly collider: Mesh;
  cls: ClassDef = CLASSES.sorcerer;
  /** Swing counter for melee attack chains. */
  swing = 0;
  /** Seconds since the last hit dealt or taken; resources with `decay` drain once this passes 3 s. */
  sinceCombat = 99;
  /** The class rig; null between `unload` and the next `load`. */
  model: TransformNode | null = null;
  animator: Animator | null = null;
  readonly velocity = new Vector3();
  yaw = 0;
  level = 1;
  xp = 0;
  stats: Stats = { ...PLAYER.base };
  /** Equipment and bag. Stats are recomputed whenever they change. */
  equipment: Record<EquipKey, Item | null> = { weapon: null, head: null, chest: null, gloves: null, boots: null, amulet: null, ring: null, ring2: null };
  inventory: Item[] = [];
  readonly inventoryMax = 40;
  powers = new Set<PowerId>();
  /** Chosen passives by slot (slots open at levels 5 and 8). */
  passives: (PassiveId | null)[] = [null, null];
  momentum = 0;   // Arcane Momentum timer
  bonus: Bonus = { arcane: 0, fire: 0, frost: 0, physical: 0, moveSpeed: 0, energyRegen: 0, energyOnHit: 0, cooldown: 0 };
  weaponDamage = 20;
  hpMax = 0; hp = 0;
  energyMax = CLASSES.sorcerer.resource.max; energy = CLASSES.sorcerer.resource.start;

  /** Must be called before `load`. Resets the resource to the class's starting value. */
  setClass(cls: ClassDef): void { this.cls = cls; this.energyMax = cls.resource.max; this.energy = cls.resource.start; }
  /** Resource gain on a kill (Focus, Blood). */
  onKill(): void { this.energy = clamp(this.energy + this.cls.resource.onKill, 0, this.energyMax); this.sinceCombat = 0; }
  /** Resource gain on a hit dealt (all classes; abilities pass their own amount). */
  onHit(amount: number): void { this.energy = clamp(this.energy + amount, 0, this.energyMax); this.sinceCombat = 0; }
  invulnerable = 0;
  stance = 0;             // seconds remaining in combat stance (faces camera, strafes)
  castLock = 0;           // seconds the player is held by a cast animation
  potionCd = 0;
  dead = false;
  moving = false;
  speedMult = 1;
  /** Iron Ward absorb pool and its timer. */
  shield = 0; shieldT = 0;
  frenzyT = 0; harvestT = 0; whirlT = 0; leapT = 0;
  chilled = 0;
  private shoveVel = new Vector3();
  grounded = true;
  private vy = 0;
  private staffTipNode: TransformNode | null = null;
  private handNode: TransformNode | null = null;
  /** What `load` created, so `unload` can take it down again: the rig's clips, the tip crystal and the glow it joined. */
  private groups: Map<string, AnimationGroup> | null = null;
  private crystal: { mesh: Mesh; mat: PBRMaterial; rig: RenderRig } | null = null;
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
    this.model = inst.root; this.groups = inst.groups;
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
        if (mat && mat instanceof PBRMaterial) { mat.metallic = 0; mat.roughness = 0.85; mat.specularIntensity = 0.3; mat.albedoColor = new Color3(0.95, 0.8, 1.05); mat.maxSimultaneousLights = 8; addRim(mat, new Color3(0.5, 0.62, 1.0), 0.75, 2.6); }
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
      this.crystal = { mesh: crystal, mat: cm, rig };
      if (staffMesh) crystal.scaling.setAll(1 / (this.cls.height / 2.2));
      // only the Sorcerer's staff carries a lit crystal; the other classes' weapons stay dark
      if (this.cls.id !== 'sorcerer') { crystal.setEnabled(false); this.staffLight.intensity = 0; }
    }
  }

  /**
   * Take the rig down again (character change, start over): the clips, the crystal and its own material, then the
   * model hierarchy. The character's materials stay: they belong to the shared asset container, not to this instance.
   */
  unload(): void {
    this.animator?.dispose(); this.animator = null;
    if (this.groups) { for (const g of this.groups.values()) g.dispose(); this.groups = null; }
    if (this.crystal) { this.crystal.rig.glow.removeIncludedOnlyMesh(this.crystal.mesh); this.crystal.mesh.dispose(); this.crystal.mat.dispose(); this.crystal = null; }
    this.model?.dispose(false, false); this.model = null;
    this.staffTipNode = null; this.handNode = null;
    this.staffLight.intensity = 2.2;
  }

  /** Back to a fresh level-1 hero before a slot is restored: progression, bag, gear, passives and every combat timer. */
  reset(): void {
    this.level = 1; this.xp = 0; this.inventory = []; for (const k of EQUIP_KEYS) this.equipment[k] = null; this.passives = [null, null];
    this.dead = false; this.invulnerable = 0; this.stance = 0; this.castLock = 0; this.potionCd = 0; this.momentum = 0; this.sinceCombat = 99; this.swing = 0;
    this.shield = 0; this.shieldT = 0; this.frenzyT = 0; this.harvestT = 0; this.whirlT = 0; this.leapT = 0; this.chilled = 0; this.speedMult = 1;
    this.moving = false; this.grounded = true; this.vy = 0; this.velocity.setAll(0); this.shoveVel.setAll(0); this.shoveT = 0; this.dashVel.setAll(0); this.dashT = 0;
    this.hpMax = 0; this.recalcStats(); this.hp = this.hpMax; this.energy = this.cls.resource.start;
  }

  recalcStats(): void {
    const l = this.level - 1;
    const st: Stats = {
      vitality: PLAYER.base.vitality + PLAYER.perLevel.vitality * l,
      power: PLAYER.base.power + PLAYER.perLevel.power * l,
      intelligence: PLAYER.base.intelligence + PLAYER.perLevel.intelligence * l,
      armor: PLAYER.base.armor + PLAYER.perLevel.armor * l,
      critChance: PLAYER.base.critChance, critDamage: PLAYER.base.critDamage, attackSpeed: PLAYER.base.attackSpeed,
    };
    const b: Bonus = { arcane: 0, fire: 0, frost: 0, physical: 0, moveSpeed: 0, energyRegen: 0, energyOnHit: 0, cooldown: 0 };
    this.powers.clear();
    this.weaponDamage = 20;
    for (const key of EQUIP_KEYS) {
      const it = this.equipment[key]; if (!it) continue;
      if (it.base.stat === 'spellDamage') this.weaponDamage = it.base.value; else st.armor += it.base.value;
      for (const a of it.affixes) {
        switch (a.stat) {
          case 'intelligence': st.intelligence += a.value; break;
          case 'vitality': st.vitality += a.value; break;
          case 'power': st.power += a.value; break;
          case 'armor': st.armor += a.value; break;
          case 'critChance': st.critChance += a.value; break;
          case 'critDamage': st.critDamage += a.value; break;
          case 'attackSpeed': st.attackSpeed += a.value; break;
          case 'arcaneDamage': b.arcane += a.value; break;
          case 'fireDamage': b.fire += a.value; break;
          case 'frostDamage': b.frost += a.value; break;
          case 'physicalDamage': b.physical += a.value; break;
          case 'moveSpeed': b.moveSpeed += a.value; break;
          case 'energyRegen': b.energyRegen += a.value; break;
          case 'energyOnHit': b.energyOnHit += a.value; break;
          case 'cooldown': b.cooldown += a.value; break;
        }
      }
      if (it.power) this.powers.add(it.power.id);
    }
    b.cooldown = Math.min(0.4, b.cooldown);
    if (this.hasPassive('glassStar')) { b.arcane += 0.3; b.fire += 0.3; b.frost += 0.3; st.vitality = Math.round(st.vitality * 0.75); }
    this.energyMax = this.cls.resource.max + (this.hasPassive('deepWell') ? 40 : 0);
    if (this.hasPassive('deepWell')) b.energyRegen += 1.5;
    this.stats = st; this.bonus = b;
    const hpFrac = this.hpMax > 0 ? this.hp / this.hpMax : 1;
    this.hpMax = Math.round(this.stats.vitality * PLAYER.hpPerVitality);
    this.hp = Math.min(this.hpMax, Math.max(this.hp, Math.round(this.hpMax * hpFrac)));
  }

  hasPassive(id: PassiveId): boolean { return this.passives.includes(id); }
  setPassive(slot: number, id: PassiveId | null): boolean {
    if (slot >= passiveSlots(this.level)) return false;
    if (id && this.passives.some((p, i) => p === id && i !== slot)) return false;
    this.passives[slot] = id; this.recalcStats(); return true;
  }
  get passiveNames(): string { return this.passives.filter(Boolean).map((p) => PASSIVES[p!].name).join(', '); }

  /** Damage multiplier for an element from gear. */
  elementMult(el: Element): number { return 1 + (el === 'arcane' ? this.bonus.arcane : el === 'fire' ? this.bonus.fire : el === 'frost' ? this.bonus.frost : this.bonus.physical); }
  /** Physical scaling for the melee and crossbow classes: weapon-led, power-led, a little from intelligence. */
  meleePower(): number { return (0.5 + this.weaponDamage / 40) * (1 + this.stats.power / 60 + this.stats.intelligence / 200); }
  /** Damage scaling for an element: physical and bleed use melee power, the rest spell power. */
  powerFor(el: Element): number { return (el === 'physical' || el === 'bleed' ? this.meleePower() : this.spellPower()) * this.elementMult(el); }

  /** Put an item in the bag. False when full (the drop stays on the ground). */
  addItem(item: Item): boolean { if (this.inventory.length >= this.inventoryMax) return false; this.inventory.push(item); return true; }
  removeItem(uid: number): Item | null { const i = this.inventory.findIndex((x) => x.uid === uid); return i >= 0 ? this.inventory.splice(i, 1)[0] : null; }

  /** Equip from the bag; the replaced item goes back to the bag. Rings fill the first free ring slot. */
  /** Weapons and legendaries are class-bound; anything else fits every hero. */
  canEquip(item: Item): boolean { return !item.classId || item.classId === this.cls.id; }
  equip(item: Item): void {
    if (!this.canEquip(item)) return;
    let key: EquipKey = item.slot;
    if (item.slot === 'ring') key = !this.equipment.ring ? 'ring' : !this.equipment.ring2 ? 'ring2' : 'ring';
    this.removeItem(item.uid);
    const old = this.equipment[key];
    this.equipment[key] = item;
    if (old) this.inventory.push(old);
    this.recalcStats();
  }
  unequip(key: EquipKey): boolean {
    const it = this.equipment[key]; if (!it || this.inventory.length >= this.inventoryMax) return false;
    this.equipment[key] = null; this.inventory.push(it); this.recalcStats(); return true;
  }

  /** Multiplier applied to ability base damage: weapon, intelligence and power. */
  spellPower(): number { return (0.5 + this.weaponDamage / 40) * (1 + this.stats.intelligence / 60 + this.stats.power / 200); }

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
    this.sinceCombat = 0;
    if (this.cls.resource.onHurt > 0 && !this.dead && this.invulnerable <= 0) this.energy = clamp(this.energy + this.cls.resource.onHurt, 0, this.energyMax);
    if (this.dead || this.invulnerable > 0 || god) return;
    let mitigated = n * (100 / (100 + this.stats.armor * 0.6));
    if (this.shield > 0) { const used = Math.min(this.shield, mitigated); this.shield -= used; mitigated -= used; if (mitigated <= 0) { this.bus.emit('player:damaged', { amount: 0 }); return; } }
    this.hp = Math.max(0, this.hp - mitigated);
    this.bus.emit('player:damaged', { amount: mitigated });
    this.animator?.once(this.cls.anims.hit, { speed: 1.6 });
    if (this.hp <= 0) this.die();
  }
  heal(n: number): void { const before = this.hp; this.hp = Math.min(this.hpMax, this.hp + n); this.bus.emit('player:healed', { amount: this.hp - before }); }
  addEnergy(n: number): void { this.energy = clamp(this.energy + n, 0, this.energyMax); if (n > 0 && this.hasPassive('momentum')) this.momentum = 3; }
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
    if (!this.animator) return;
    if (def.channel) { this.whirlT = 0.3; if (!this.animator.current?.startsWith(def.anim)) this.animator.play(def.anim, { speed: 1.6 }); return; }
    if (this.moving && def.animLock <= 0 && !def.arc) return;
    this.animator.clearOneShot();
    const clip = def.arc && this.cls.chain.length ? this.cls.chain[this.swing++ % this.cls.chain.length] : def.anim;
    this.animator.once(clip, { speed: def.arc ? 1.9 : def.animLock > 0 ? 1.4 : 2.2 });
  }

  /** External push (charges, pulls): applied over `duration` seconds through the collision sweep. */
  /** Precise movement for leaps and dashes: the collider covers `delta` over `duration`, ignoring input and damping. */
  dash(delta: Vector3, duration: number): void { this.dashVel.copyFrom(delta).scaleInPlace(1 / duration); this.dashT = duration; this.leapT = duration; }
  private dashVel = new Vector3(); private dashT = 0;
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
    this.sinceCombat += dt;
    this.shieldT = Math.max(0, this.shieldT - dt); if (this.shieldT <= 0) this.shield = 0;
    this.frenzyT = Math.max(0, this.frenzyT - dt); this.harvestT = Math.max(0, this.harvestT - dt); this.whirlT = Math.max(0, this.whirlT - dt); this.leapT = Math.max(0, this.leapT - dt);
    const r = this.cls.resource;
    let gain = (r.regen + this.bonus.energyRegen) * dt;
    if (r.stillRegen > 0 && !this.moving && !this.dead) gain += r.stillRegen * dt;
    if (r.decay > 0 && this.sinceCombat > 3) gain -= r.decay * dt;
    this.energy = clamp(this.energy + gain, 0, this.energyMax);
    this.staffLight.position.copyFrom(this.staffTip());

    if (this.dead) { this.animator?.update(dt); return; }

    // desired velocity relative to camera
    const axis = input.moveAxis();
    const wantMove = (axis.x !== 0 || axis.z !== 0) && this.castLock <= 0 && this.leapT <= 0;
    const inStance = this.stance > 0;
    const sprint = input.sprint && !inStance;
    this.momentum = Math.max(0, this.momentum - dt);
    const maxSpeed = (sprint ? PLAYER.sprintSpeed : inStance ? PLAYER.strafeSpeed : PLAYER.jogSpeed) * this.speedMult * (this.whirlT > 0 ? 0.7 : 1) * (this.frenzyT > 0 ? 1.4 : 1) * (1 + this.bonus.moveSpeed + (this.momentum > 0 ? 0.3 : 0));
    this.tmpMove.set(cam.forward.x * axis.z + cam.right.x * axis.x, 0, cam.forward.z * axis.z + cam.right.z * axis.x);
    const target = wantMove ? this.tmpMove.normalize().scaleInPlace(maxSpeed) : Vector3.ZeroReadOnly;
    const rate = wantMove ? PLAYER.accel : PLAYER.decel;
    const dampRate = this.leapT > 0 || this.shoveT > 0 ? rate / maxSpeed : rate / maxSpeed * 4;
    this.velocity.x = damp(this.velocity.x, target.x, dampRate, dt);
    this.velocity.z = damp(this.velocity.z, target.z, dampRate, dt);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.moving = speed > 0.3;
    if (this.moving && this.castLock <= 0 && this.animator?.busy) this.animator.clearOneShot();

    // facing
    const targetYaw = inStance ? cam.yaw : this.moving ? dirToYaw(this.velocity) : this.yaw;
    this.yaw = dampAngle(this.yaw, targetYaw, inStance ? 20 : PLAYER.turnRate, dt);
    if (this.model) this.model.rotation.y = this.yaw + MODEL_YAW_OFFSET;

    // ground and gravity
    const groundY = world.groundY(this.collider.position.x, this.collider.position.z, this.collider.position.y + 1);
    const feetY = this.collider.position.y;
    if (groundY !== null && feetY - groundY < 0.6 && this.vy <= 0) { this.grounded = true; this.vy = 0; }
    else { this.grounded = false; this.vy -= PLAYER.gravity * dt; }

    if (this.shoveT > 0) { this.shoveT -= dt; this.velocity.x += this.shoveVel.x * dt * 4; this.velocity.z += this.shoveVel.z * dt * 4; }
    if (this.dashT > 0) { this.dashT -= dt; this.velocity.x = this.dashVel.x; this.velocity.z = this.dashVel.z; }
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
