import { Vector3 } from '@babylonjs/core';
import type { AbilityDef, AbilityId } from '@/content/abilities';
import type { AbilityHost, AbilityImpl } from './system';
import { audio } from '@/audio';
import { PALETTE } from '@/content/palette';

/** Grave Hunter: crossbow kiting. Focus fills while standing still and on kills; Fan of Bolts spends it. */
export function hunterAbilities(h: AbilityHost): Partial<Record<AbilityId, AbilityImpl>> {
  const { ctx } = h;
  const muzzle = () => ctx.player.staffTip();
  const fire = (def: AbilityDef, dir: Vector3, mult: number, pierce: boolean, homing = def.homing) => {
    const { player, projectiles, enemies, vfx, targeting } = ctx;
    projectiles.spawn({
      team: 'player', pos: muzzle(), dir, speed: def.speed, radius: def.radius, range: def.range, homing, target: targeting.target, visual: 'quarrel', pierce,
      onHitEnemy: (e, pos, d) => {
        const r = h.roll(def, mult);
        enemies.damage(e, r.amount, { dir: d, knockback: def.knockback, crit: r.crit, element: r.element, pos });
        player.onHit(def.energyOnHit + player.bonus.energyOnHit);
        vfx.quarrelImpact(pos, d); audio.play('boltImpact', pos, { gain: 0.45, pitch: 1.4 });
      },
      onExpire: (pos) => vfx.quarrelImpact(pos, dir),
    });
  };
  const rot = (v: Vector3, a: number) => new Vector3(v.x * Math.cos(a) + v.z * Math.sin(a), v.y, -v.x * Math.sin(a) + v.z * Math.cos(a));

  return {
    boltShot: (def) => {
      const dir = ctx.targeting.direction(muzzle(), new Vector3()).clone();
      audio.play('boltCast', undefined, { pitch: 1.5, gain: 0.4 });
      fire(def, dir, 1, true);
    },
    fanOfBolts: (def) => {
      const dir = ctx.targeting.direction(muzzle(), new Vector3()).clone(); dir.y = 0; dir.normalize();
      audio.play('boltCast', undefined, { pitch: 1.2, gain: 0.7 });
      const n = 7, arc = ((def.arc ?? 60) * Math.PI) / 180;
      for (let i = 0; i < n; i++) fire(def, rot(dir, -arc / 2 + (arc * i) / (n - 1)), 1, false, 0);
      ctx.cam.shake(0.06, 0.1);
    },
    vault: (def) => {
      const p = ctx.player;
      const away = ctx.cam.forward.clone().scale(-1); away.y = 0; away.normalize();
      p.invulnerable = 0.5; p.dash(away.scale(def.range), 0.28);
      ctx.vfx.burst('smoke', p.position.add(new Vector3(0, 0.3, 0)), 8);
      audio.play('rift', p.position, { pitch: 1.4, gain: 0.5 });
    },
    caltrops: (def) => {
      const at = h.groundTarget(def.range);
      ctx.areas.caltrops(at, def.radius, () => h.roll(def).amount, Math.round(8 * ctx.player.meleePower()));
      audio.play('meleeSwing', at, { pitch: 1.3, gain: 0.6 });
    },
    mark: (def) => {
      const t = ctx.targeting.target;
      if (!t || !t.alive) { audio.play('denied'); return; }
      t.markT = 8;
      ctx.vfx.lights.flash(t.hitCenter(), PALETTE.healthBright, 14, 0.3, 4);
      ctx.vfx.burst('arcaneSpark', t.hitCenter(), 10);
      audio.play('levelUp', t.position, { pitch: 1.6, gain: 0.35 });
      void def;
    },
    rainOfBolts: (def) => {
      const at = h.groundTarget(def.range);
      audio.play('cataclysmCast', at, { pitch: 1.3, gain: 0.7 });
      const strikes = 12;
      for (let i = 0; i < strikes; i++) h.later(0.3 + i * 0.22, () => {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * def.radius;
        const p = new Vector3(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r);
        const near = ctx.enemies.queryNear(at, def.radius, []).filter((e) => e.alive);
        if (near.length && Math.random() < 0.5) p.copyFrom(near[Math.floor(Math.random() * near.length)].position);
        ctx.vfx.rainStrike(p); audio.play('boltImpact', p, { gain: 0.35, pitch: 1.3 });
        ctx.enemies.damageArea(p, 1.6, () => h.roll(def).amount, { element: 'physical', knockback: def.knockback });
      });
    },
  };
}
