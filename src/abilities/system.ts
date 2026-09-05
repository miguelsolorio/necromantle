import { Vector3 } from '@babylonjs/core';
import type { ThirdPersonCamera } from '@/camera/thirdPerson';
import { rollDamage } from '@/combat/damage';
import type { Projectiles } from '@/combat/projectiles';
import type { Targeting } from '@/combat/targeting';
import { ABILITIES, ABILITY_ORDER, type AbilityDef, type AbilityId } from '@/content/abilities';
import type { EventBus } from '@/core/events';
import type { EnemyManager } from '@/enemies/manager';
import type { Input } from '@/input/input';
import type { Player } from '@/player/player';
import type { Vfx } from '@/vfx/vfx';
import type { World } from '@/world/world';
import { audio } from '@/audio';

export interface AbilityContext { player: Player; cam: ThirdPersonCamera; enemies: EnemyManager; projectiles: Projectiles; vfx: Vfx; targeting: Targeting; bus: EventBus; world: World }
export interface SlotState { id: AbilityId; def: AbilityDef; ready: boolean; cd: number; cdMax: number; noEnergy: boolean; locked: boolean }

const KEYS: Record<AbilityId, string> = { bolt: 'Mouse0', orb: 'Mouse2', rift: 'Digit1', nova: 'Digit2', frost: 'Digit3', cataclysm: 'Digit4' };

/** Cooldowns, costs, unlocks and the actual ability behaviours. Reads data from `content/abilities`. */
export class AbilitySystem {
  cooldowns: Record<AbilityId, number> = { bolt: 0, orb: 0, rift: 0, nova: 0, frost: 0, cataclysm: 0 };
  cdMult = 1;
  infiniteEnergy = false;
  unlockAll = false;
  private repeat: Record<AbilityId, number> = { bolt: 0, orb: 0, rift: 0, nova: 0, frost: 0, cataclysm: 0 };
  private tmp = new Vector3();

  constructor(private ctx: AbilityContext) {}

  setWorld(w: World): void { this.ctx.world = w; }

  unlocked(id: AbilityId): boolean { return this.unlockAll || this.ctx.player.level >= ABILITIES[id].unlockLevel; }

  slots(): SlotState[] {
    return ABILITY_ORDER.map((id) => {
      const def = ABILITIES[id];
      const locked = !this.unlocked(id) || id === 'frost' || id === 'cataclysm';
      const cd = this.cooldowns[id];
      const noEnergy = !this.infiniteEnergy && def.cost > this.ctx.player.energy;
      return { id, def, ready: !locked && cd <= 0 && !noEnergy, cd, cdMax: def.cooldown * this.cdMult, noEnergy, locked };
    });
  }

  update(dt: number, input: Input): void {
    for (const id of ABILITY_ORDER) { this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt); this.repeat[id] = Math.max(0, this.repeat[id] - dt); }
    const p = this.ctx.player;
    if (p.dead) return;
    for (const id of ABILITY_ORDER) {
      const key = KEYS[id];
      const held = key.startsWith('Mouse') ? input.buttonDown(+key.slice(5)) : input.isDown(key);
      const pressed = key.startsWith('Mouse') ? input.buttonPressed(+key.slice(5)) : input.wasPressed(key);
      const def = ABILITIES[id];
      if (def.castInterval > 0 ? held && this.repeat[id] <= 0 : pressed) {
        if (this.cast(id)) this.repeat[id] = def.castInterval / p.stats.attackSpeed;
      }
    }
    if (input.wasPressed('KeyQ')) { if (p.usePotion()) audio.play('potion'); else audio.play('denied'); }
  }

  cast(id: AbilityId): boolean {
    const { player, bus } = this.ctx;
    const def = ABILITIES[id];
    if (!this.unlocked(id) || id === 'frost' || id === 'cataclysm') { bus.emit('ability:denied', { id, reason: 'locked' }); return false; }
    if (this.cooldowns[id] > 0) { bus.emit('ability:denied', { id, reason: 'cooldown' }); return false; }
    if (player.castLock > 0 && id !== 'rift') return false;
    if (def.cost > 0 && !this.infiniteEnergy && !player.spendEnergy(def.cost)) { bus.emit('ability:denied', { id, reason: 'energy' }); return false; }
    this.cooldowns[id] = def.cooldown * this.cdMult;
    player.cast(def);
    bus.emit('ability:cast', { id });
    switch (id) {
      case 'bolt': this.bolt(def); break;
      case 'orb': this.orb(def); break;
      case 'nova': this.nova(def); break;
      case 'rift': this.rift(def); break;
    }
    return true;
  }

  private roll(def: AbilityDef, mult = 1) {
    const p = this.ctx.player;
    return rollDamage(def.damage.base, p.spellPower(), p.stats.critChance, p.stats.critDamage, def.damage.element, mult);
  }

  private bolt(def: AbilityDef): void {
    const { player, targeting, projectiles, enemies, vfx } = this.ctx;
    const from = player.staffTip();
    const dir = targeting.direction(from, this.tmp).clone();
    vfx.burst('arcaneSpark', from, 3);
    audio.play('boltCast', undefined, { pitch: 0.92 + Math.random() * 0.16, gain: 0.55 });
    projectiles.spawn({
      team: 'player', pos: from, dir, speed: def.speed, radius: def.radius, range: def.range, homing: def.homing, target: targeting.target, visual: 'bolt',
      onHitEnemy: (e, pos, d) => {
        const r = this.roll(def);
        enemies.damage(e, r.amount, { dir: d, knockback: def.knockback, crit: r.crit, element: r.element, pos });
        player.addEnergy(def.energyOnHit);
        vfx.boltImpact(pos, d);
        audio.play('boltImpact', pos, { gain: 0.7 });
        // minor splash on neighbours
        enemies.damageArea(pos, 1.1, (o) => (o === e ? 0 : Math.round(r.amount * 0.3)), { element: r.element });
      },
      onExpire: (pos) => { vfx.boltImpact(pos, dir); audio.play('boltImpact', pos, { gain: 0.5 }); },
    });
  }

  private orb(def: AbilityDef): void {
    const { player, targeting, projectiles, enemies, vfx, cam } = this.ctx;
    const from = player.staffTip();
    const dir = targeting.direction(from, this.tmp).clone(); dir.y *= 0.4; dir.normalize();
    audio.play('orbCast');
    vfx.burst('arcaneImpact', from, 14); vfx.lights.flash(from, this.ctx.vfx.lights ? player.staffLight.diffuse : player.staffLight.diffuse, 20, 0.25, 6);
    projectiles.spawn({
      team: 'player', pos: from, dir, speed: def.speed, radius: def.radius, range: def.range, homing: def.homing, target: targeting.target, visual: 'orb', pierce: true,
      onTick: (pos) => vfx.orbTravelTick(pos),
      onHitEnemy: (e, pos, d) => {
        const r = this.roll(def);
        enemies.damage(e, r.amount, { dir: d, knockback: def.knockback, crit: r.crit, element: r.element, pos });
        vfx.hitSpark(pos, 'arcane');
      },
      onExpire: (pos) => {
        vfx.orbExplode(pos, 3.2); cam.shake(0.18, 0.25); audio.play('orbExplode', pos);
        enemies.damageArea(pos, 3.2, () => this.roll(def, 0.8).amount, { knockback: 11, element: "arcane" });
      },
    });
  }

  private nova(def: AbilityDef): void {
    const { player, enemies, vfx, cam } = this.ctx;
    const at = player.position.clone();
    vfx.nova(at, def.radius);
    cam.shake(0.4, 0.32);
    audio.play('nova');
    const burnDps = Math.round(12 * player.spellPower());
    enemies.damageArea(at, def.radius, () => this.roll(def).amount, { knockback: def.knockback, element: 'fire', burn: { dps: burnDps, dur: 3 } });
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
