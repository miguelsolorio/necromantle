import { Vector3 } from '@babylonjs/core';
import type { ThirdPersonCamera } from '@/camera/thirdPerson';
import type { AbilityDef } from '@/content/abilities';
import type { EnemyManager } from '@/enemies/manager';
import type { RenderRig } from '@/rendering/setup';
import type { AreaVisual, Vfx } from '@/vfx/vfx';
import { audio } from '@/audio';

interface Area { kind: 'frost' | 'storm' | 'burn' | 'caltrops'; pos: Vector3; radius: number; t: number; dur: number; tick: number; visual: AreaVisual; damage: () => number; knockback: number; burnDps?: number }

/**
 * Persistent ground effects. Frost Field ticks chill (and freezes weak enemies that linger);
 * Cataclysm rains strikes across its area and pushes the room's lighting toward arcane while it lasts.
 */
export class Areas {
  private list: Area[] = [];
  private stormLevel = 0;
  constructor(private enemies: EnemyManager, private vfx: Vfx, private cam: ThirdPersonCamera, private rig: RenderRig) {}

  frost(pos: Vector3, def: AbilityDef, damage: () => number): void {
    this.list.push({ kind: 'frost', pos: pos.clone(), radius: def.radius, t: 0, dur: 6, tick: 0, visual: this.vfx.frostField(pos, def.radius), damage, knockback: 0 });
    audio.play('frostCast', pos);
  }

  storm(pos: Vector3, def: AbilityDef, damage: () => number): void {
    this.list.push({ kind: 'storm', pos: pos.clone(), radius: def.radius, t: 0, dur: 6, tick: 0.2, visual: this.vfx.stormRing(pos, def.radius), damage, knockback: def.knockback });
    audio.play('cataclysmCast', pos);
    this.cam.shake(0.3, 0.5);
  }

  /** Ashen Grimoire: burning ground that keeps setting enemies alight. */
  caltrops(pos: Vector3, radius: number, damage: () => number, bleedDps: number, dur = 4): void {
    this.list.push({ kind: 'caltrops', pos: pos.clone(), radius, t: 0, dur, tick: 0, visual: this.vfx.caltrops(pos, radius), damage, knockback: 0, burnDps: bleedDps });
  }
  burn(pos: Vector3, radius: number, damage: () => number, burnDps: number): void {
    this.list.push({ kind: 'burn', pos: pos.clone(), radius, t: 0, dur: 6, tick: 0, visual: this.vfx.burningGround(pos, radius), damage, knockback: 0, burnDps });
  }

  get stormActive(): boolean { return this.list.some((a) => a.kind === 'storm'); }

  update(dt: number): void {
    let stormNow = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.t += dt; a.tick -= dt;
      const life = a.t / a.dur;
      a.visual.update(dt, life);
      if (a.kind === 'burn') {
        if (a.tick <= 0 && life < 0.92) { a.tick = 0.5; this.enemies.damageArea(a.pos, a.radius, () => a.damage(), { element: 'fire', burn: { dps: a.burnDps ?? 10, dur: 2 } }); }
      } else if (a.kind === 'caltrops') {
        if (a.tick <= 0 && life < 0.95) { a.tick = 0.5; this.enemies.damageArea(a.pos, a.radius, () => a.damage(), { element: 'bleed', bleed: { dps: a.burnDps ?? 8, dur: 3 }, slow: { k: 0.5, dur: 0.8 } }); }
      } else if (a.kind === 'frost') {
        if (a.tick <= 0 && life < 0.9) {
          a.tick = 0.5;
          this.enemies.damageArea(a.pos, a.radius, () => a.damage(), { element: 'frost', chill: 0.9 });
        }
      } else {
        stormNow = Math.max(stormNow, life < 0.8 ? 1 : (1 - life) / 0.2);
        if (a.tick <= 0 && life < 0.92) {
          a.tick = 0.32;
          const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * a.radius;
          const at = new Vector3(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
          // bias every other strike toward an enemy so the storm feels aimed
          const near = this.enemies.queryNear(a.pos, a.radius, []);
          if (near.length && Math.random() < 0.55) { const e = near[Math.floor(Math.random() * near.length)]; at.copyFrom(e.position); }
          this.vfx.strike(at);
          audio.play('strike', at, { pitch: 0.85 + Math.random() * 0.3 });
          this.cam.shake(0.14, 0.2);
          this.enemies.damageArea(at, 2.6, () => a.damage(), { element: 'arcane', knockback: a.knockback });
        }
      }
      if (a.t >= a.dur) { a.visual.dispose(); this.list.splice(i, 1); }
    }
    this.stormLevel += (stormNow - this.stormLevel) * Math.min(1, dt * 6);
    this.rig.setStormTint(this.stormLevel);
  }

  clear(): void { for (const a of this.list) a.visual.dispose(); this.list.length = 0; }
}
