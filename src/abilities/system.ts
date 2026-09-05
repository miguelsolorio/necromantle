import { Vector3 } from '@babylonjs/core';
import type { ThirdPersonCamera } from '@/camera/thirdPerson';
import { rollDamage } from '@/combat/damage';
import type { Projectiles } from '@/combat/projectiles';
import type { Targeting } from '@/combat/targeting';
import { ABILITIES, ABILITY_ORDER, SLOT_KEYS, type AbilityDef, type AbilityId } from '@/content/abilities';
import type { EventBus } from '@/core/events';
import type { EnemyManager } from '@/enemies/manager';
import type { Input } from '@/input/input';
import type { Player } from '@/player/player';
import type { Vfx } from '@/vfx/vfx';
import type { World } from '@/world/world';
import type { Areas } from '@/combat/areas';
import { audio } from '@/audio';
import { knightAbilities } from './knight';
import { hunterAbilities } from './hunter';
import { reaverAbilities } from './reaver';

export interface AbilityContext { player: Player; cam: ThirdPersonCamera; enemies: EnemyManager; projectiles: Projectiles; vfx: Vfx; targeting: Targeting; bus: EventBus; world: World; areas: Areas }
/** What class ability modules get: the shared context plus the damage roll, ground targeting and a delayed-call scheduler. */
export interface AbilityHost {
  ctx: AbilityContext;
  roll(def: AbilityDef, mult?: number): { amount: number; crit: boolean; element: import('@/content/abilities').Element };
  groundTarget(range: number): Vector3;
  later(seconds: number, fn: () => void): void;
  hitStop(seconds: number, scale?: number): void;
}
export type AbilityImpl = (def: AbilityDef) => void;

export interface SlotState { id: AbilityId; def: AbilityDef; ready: boolean; cd: number; cdMax: number; noEnergy: boolean; locked: boolean }

const zero = (): Record<AbilityId, number> => Object.fromEntries(ABILITY_ORDER.map((id) => [id, 0])) as Record<AbilityId, number>;

/** Cooldowns, costs, unlocks and the actual ability behaviours. Reads data from `content/abilities`. */
export class AbilitySystem {
  cooldowns: Record<AbilityId, number> = zero();
  /** Extra stored uses (Boots of the Fold give Rift Step a second charge). */
  charges: Record<AbilityId, number> = zero();
  cdMult = 1;
  infiniteEnergy = false;
  unlockAll = false;
  private repeat: Record<AbilityId, number> = zero();
  private tmp = new Vector3();

  /** Ability behaviours keyed by id; a class lists which ids it owns (content/classes.ts). */
  private impl: Partial<Record<AbilityId, AbilityImpl>> = {
    bolt: (d) => this.bolt(d), orb: (d) => this.orb(d), nova: (d) => this.nova(d), rift: (d) => this.rift(d), frost: (d) => this.frost(d), cataclysm: (d) => this.cataclysm(d),
  };
  private timers: { t: number; fn: () => void }[] = [];
  /** Set by the game so abilities can request hit-stop. */
  onHitStop: (seconds: number, scale: number) => void = () => {};

  constructor(private ctx: AbilityContext) {
    const host: AbilityHost = { ctx, roll: (d, m) => this.roll(d, m), groundTarget: (r) => this.groundTarget(r), later: (sec, fn) => this.timers.push({ t: sec, fn }), hitStop: (sec, scale = 0.15) => this.onHitStop(sec, scale) };
    Object.assign(this.impl, knightAbilities(host), hunterAbilities(host), reaverAbilities(host));
  }

  setWorld(w: World): void { this.ctx.world = w; }

  /** A run ended: every cooldown, stored charge, repeat timer and pending delayed call goes. */
  reset(): void { this.cooldowns = zero(); this.charges = zero(); this.repeat = zero(); this.timers.length = 0; }

  unlocked(id: AbilityId): boolean { return this.unlockAll || this.ctx.player.level >= ABILITIES[id].unlockLevel; }

  private maxCharges(id: AbilityId): number { return id === 'rift' && this.ctx.player.powers.has('fold') ? 2 : 1; }
  private cooldownOf(def: AbilityDef): number { return def.cooldown * this.cdMult * (1 - this.ctx.player.bonus.cooldown) * (def.id === 'nova' && this.ctx.player.hasPassive('emberVeil') ? 0.65 : 1) * (def.id === 'frenzy' && this.ctx.player.powers.has('ironLung') ? 0.5 : 1); }
  /** Red Harvest: a kill by bleed refunds Bleed Storm. */
  onKill(bleeding: boolean): void { if (bleeding && this.ctx.player.powers.has('redHarvest')) this.cooldowns.bleedStorm = 0; }

  slots(): SlotState[] {
    return this.ctx.player.cls.abilities.map((id) => {
      const def = ABILITIES[id];
      const locked = !this.unlocked(id);
      const cd = this.charges[id] > 0 ? 0 : this.cooldowns[id];
      const noEnergy = !this.infiniteEnergy && def.cost > this.ctx.player.energy;
      return { id, def, ready: !locked && cd <= 0 && !noEnergy, cd, cdMax: this.cooldownOf(def), noEnergy, locked };
    });
  }

  update(dt: number, input: Input): void {
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    for (const id of ABILITY_ORDER) {
      this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt); this.repeat[id] = Math.max(0, this.repeat[id] - dt);
      // refill stored charges one per cooldown period
      const max = this.maxCharges(id);
      if (max > 1 && this.charges[id] < max - 1 && this.cooldowns[id] <= 0) { this.charges[id]++; if (this.charges[id] < max - 1) this.cooldowns[id] = this.cooldownOf(ABILITIES[id]); }
      if (max <= 1) this.charges[id] = 0;
    }
    const p = this.ctx.player;
    if (p.dead) return;
    for (const id of p.cls.abilities) {
      const key = SLOT_KEYS[ABILITIES[id].slot];
      const held = key.startsWith('Mouse') ? input.buttonDown(+key.slice(5)) : input.isDown(key);
      const pressed = key.startsWith('Mouse') ? input.buttonPressed(+key.slice(5)) : input.wasPressed(key);
      const def = ABILITIES[id];
      if (def.castInterval > 0 ? held && this.repeat[id] <= 0 : pressed) {
        if (this.cast(id)) this.repeat[id] = def.castInterval / (p.stats.attackSpeed * (p.frenzyT > 0 ? 1.4 : 1));
      }
    }
    if (input.wasPressed('KeyQ')) { if (p.usePotion()) audio.play('potion'); else audio.play('denied'); }
  }

  cast(id: AbilityId): boolean {
    const { player, bus } = this.ctx;
    const def = ABILITIES[id];
    if (!this.unlocked(id)) { bus.emit('ability:denied', { id, reason: 'locked' }); return false; }
    if (this.cooldowns[id] > 0 && this.charges[id] <= 0) { bus.emit('ability:denied', { id, reason: 'cooldown' }); return false; }
    if (player.castLock > 0 && id !== 'rift' && id !== 'vault') return false;
    if (player.leapT > 0) return false;
    const free = def.id === 'frenzy' && player.energy >= player.energyMax - 0.01;
    if (def.cost > 0 && !this.infiniteEnergy && !free && !player.spendEnergy(def.cost)) { bus.emit('ability:denied', { id, reason: 'energy' }); return false; }
    if (this.cooldowns[id] > 0 && this.charges[id] > 0) this.charges[id]--; else this.cooldowns[id] = this.cooldownOf(def);
    player.cast(def);
    bus.emit('ability:cast', { id });
    const impl = this.impl[id];
    if (impl) impl(def); else console.warn(`[abilities] no implementation for ${id}`);
    return true;
  }

  private roll(def: AbilityDef, mult = 1) {
    const p = this.ctx.player;
    return rollDamage(def.damage.base, p.powerFor(def.damage.element), p.stats.critChance, p.stats.critDamage, def.damage.element, mult);
  }

  private bolt(def: AbilityDef): void {
    const { player, targeting, projectiles, enemies, vfx } = this.ctx;
    const from = player.staffTip();
    const dir = targeting.direction(from, this.tmp).clone();
    vfx.burst('arcaneSpark', from, 3);
    audio.play('boltCast', undefined, { pitch: 0.92 + Math.random() * 0.16, gain: 0.55 });
    const twin = player.level >= 7;
    for (const side of twin ? [-1, 1] : [0]) {
    const d0 = side === 0 ? dir : new Vector3(dir.x * Math.cos(side * 0.05) + dir.z * Math.sin(side * 0.05), dir.y, -dir.x * Math.sin(side * 0.05) + dir.z * Math.cos(side * 0.05));
    const p0 = side === 0 ? from : from.add(new Vector3(-dir.z * side * 0.25, 0, dir.x * side * 0.25));
    projectiles.spawn({
      team: 'player', pos: p0, dir: d0, speed: def.speed, radius: def.radius, range: def.range, homing: def.homing, target: targeting.target, visual: 'bolt',
      onHitEnemy: (e, pos, d) => {
        const r = this.roll(def, twin ? 0.7 : 1);
        enemies.damage(e, r.amount, { dir: d, knockback: def.knockback, crit: r.crit, element: r.element, pos });
        player.addEnergy(def.energyOnHit + player.bonus.energyOnHit);
        vfx.boltImpact(pos, d);
        audio.play('boltImpact', pos, { gain: 0.7 });
        if (player.powers.has('hollowCrown')) this.chainBolt(def, e, pos);
        // minor splash on neighbours
        enemies.damageArea(pos, 1.1, (o) => (o === e ? 0 : Math.round(r.amount * 0.3)), { element: r.element });
      },
      onExpire: (pos) => { vfx.boltImpact(pos, dir); audio.play('boltImpact', pos, { gain: 0.5 }); },
    });
    }
  }

  /** Hollow Crown: a second, weaker bolt leaps from the struck enemy to the nearest other enemy. */
  private chainBolt(def: AbilityDef, from: import('@/enemies/enemy').Enemy, pos: Vector3): void {
    const { enemies, projectiles, vfx } = this.ctx;
    const near = enemies.queryNear(pos, 9, []).filter((o) => o !== from && o.alive);
    if (!near.length) return;
    near.sort((a, b) => Vector3.Distance(a.position, pos) - Vector3.Distance(b.position, pos));
    const target = near[0];
    const dir = target.hitCenter().subtract(pos).normalize();
    projectiles.spawn({ team: 'player', pos: pos.clone(), dir, speed: def.speed * 1.2, radius: def.radius, range: 12, homing: 0.4, target, visual: 'bolt',
      onHitEnemy: (e2, p2, d2) => { const r = this.roll(def, 0.7); enemies.damage(e2, r.amount, { dir: d2, knockback: def.knockback, crit: r.crit, element: r.element, pos: p2 }); vfx.boltImpact(p2, d2); },
      onExpire: (p2) => vfx.boltImpact(p2, dir) });
  }

  private orb(def: AbilityDef): void {
    const { player, targeting, projectiles, enemies, vfx, cam } = this.ctx;
    const from = player.staffTip();
    const dir = targeting.direction(from, this.tmp).clone(); dir.y *= 0.4; dir.normalize();
    audio.play('orbCast');
    vfx.burst('arcaneImpact', from, 14); vfx.lights.flash(from, player.staffLight.diffuse, 20, 0.25, 6);
    let pierced = 0;
    projectiles.spawn({
      team: 'player', pos: from, dir, speed: def.speed, radius: def.radius, range: def.range, homing: def.homing, target: targeting.target, visual: 'orb', pierce: true,
      onTick: (pos) => vfx.orbTravelTick(pos),
      onHitEnemy: (e, pos, d) => {
        const r = this.roll(def);
        enemies.damage(e, r.amount, { dir: d, knockback: def.knockback, crit: r.crit, element: r.element, pos });
        vfx.hitSpark(pos, 'arcane');
        if (player.powers.has('starfall')) { pierced++; if (pierced === 4) this.starfall(def, pos, d); }
      },
      onExpire: (pos) => {
        const blast = player.level >= 9 ? 5 : 3.2;
        vfx.orbExplode(pos, blast); cam.shake(player.level >= 9 ? 0.3 : 0.18, 0.25); audio.play('orbExplode', pos);
        enemies.damageArea(pos, blast, () => this.roll(def, player.level >= 9 ? 1.1 : 0.8).amount, { knockback: 11, element: 'arcane' });
      },
    });
  }

  /** Starfall Circlet: after four pierces the orb splits into three smaller orbs fanning forward. */
  private starfall(def: AbilityDef, pos: Vector3, dir: Vector3): void {
    const { enemies, projectiles, vfx } = this.ctx;
    vfx.orbExplode(pos, 1.5);
    for (const spread of [-0.45, 0, 0.45]) {
      const d = new Vector3(dir.x * Math.cos(spread) + dir.z * Math.sin(spread), dir.y * 0.5, -dir.x * Math.sin(spread) + dir.z * Math.cos(spread)).normalize();
      projectiles.spawn({ team: 'player', pos: pos.clone(), dir: d, speed: def.speed * 1.3, radius: def.radius * 0.6, range: 12, visual: 'orb', pierce: true,
        onHitEnemy: (e, p, dd) => { const r = this.roll(def, 0.45); enemies.damage(e, r.amount, { dir: dd, knockback: 3, crit: r.crit, element: r.element, pos: p }); vfx.hitSpark(p, 'arcane'); },
        onExpire: (p) => { vfx.orbExplode(p, 1.6); enemies.damageArea(p, 1.6, () => this.roll(def, 0.4).amount, { knockback: 5, element: 'arcane' }); } });
    }
  }

  private nova(def: AbilityDef): void {
    const { player, enemies, vfx, cam } = this.ctx;
    const at = player.position.clone();
    vfx.nova(at, def.radius);
    cam.shake(0.4, 0.32);
    audio.play('nova');
    const burnDps = Math.round(12 * player.spellPower());
    const burnDur = 3 + (player.hasPassive('emberVeil') ? 2 : 0);
    enemies.damageArea(at, def.radius, () => this.roll(def).amount, { knockback: def.knockback, element: 'fire', burn: { dps: burnDps, dur: burnDur } });
    if (player.powers.has('ashen')) this.ctx.areas.burn(at, def.radius * 0.8, () => this.roll(def, 0.15).amount, burnDps);
  }

  /** Ground target: the enemy cluster nearest the reticle, clamped to range. */
  private groundTarget(range: number): Vector3 {
    const { player, targeting, world } = this.ctx;
    const p = targeting.clusterPoint.clone();
    const d = new Vector3(p.x - player.position.x, 0, p.z - player.position.z); const len = d.length();
    if (len > range) { d.scaleInPlace(range / len); p.x = player.position.x + d.x; p.z = player.position.z + d.z; }
    const gy = world.groundY(p.x, p.z, player.position.y + 3);
    p.y = gy ?? player.position.y;
    return p;
  }

  private frost(def: AbilityDef): void {
    const at = this.groundTarget(def.range);
    this.ctx.areas.frost(at, def, () => this.roll(def).amount);
  }

  private cataclysm(def: AbilityDef): void {
    const at = this.groundTarget(def.range);
    this.ctx.areas.storm(at, def, () => this.roll(def).amount);
    this.ctx.cam.shake(0.35, 0.5);
  }

  private rift(def: AbilityDef): void {
    const { player, cam, vfx, world } = this.ctx;
    // horizontal aim: where the camera looks, flattened; fall back to the camera forward
    const dir = cam.forward.clone();
    const from = player.position.clone();
    const to = player.teleport(dir.scale(def.range));
    const gy = world.groundY(to.x, to.z, to.y + 1.5);
    if (gy !== null) { player.collider.position.y = gy; player.position.y = gy; }
    player.invulnerable = 0.3;
    player.yaw = cam.yaw;
    vfx.rift(from, player.position.clone());
    audio.play('rift');
  }
}
