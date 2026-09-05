import { Vector3 } from '@babylonjs/core';
import type { AbilityDef, AbilityId } from '@/content/abilities';
import type { AbilityHost, AbilityImpl } from './system';
import { audio } from '@/audio';
import { PALETTE } from '@/content/palette';

/** Pale Reaver: great-axe momentum. Blood comes from hits and kills, drains slowly, and Frenzy is free when full. */
export function reaverAbilities(h: AbilityHost): Partial<Record<AbilityId, AbilityImpl>> {
  const { ctx } = h;
  const aim = (def: AbilityDef) => {
    const p = ctx.player; const t = ctx.targeting.target;
    const dir = ctx.cam.forward.clone(); dir.y = 0; dir.normalize();
    if (t && t.alive) { const d = t.position.subtract(p.position); d.y = 0; const len = d.length(); if (len < def.range + 2.5 && len > 0.01) { d.scaleInPlace(1 / len); if (Vector3.Dot(d, dir) > 0.3) dir.copyFrom(d); } }
    p.yaw = Math.atan2(dir.x, dir.z);
    if (t && t.alive) { const len = Vector3.Distance(t.position, p.position); if (len > def.range && len < def.range + 2) p.shove(dir.scale(Math.min(1.4, len - def.range + 0.3)), 0.12); }
    return dir;
  };
  const bleedDps = () => Math.round(9 * ctx.player.meleePower() * (ctx.player.powers.has('redHarvest') ? 2 : 1));

  return {
    rend: (def) => {
      const p = ctx.player; const dir = aim(def);
      ctx.vfx.slash(p.position, p.yaw, def.range, 'blood', (Math.random() - 0.5) * 0.6);
      const hits = ctx.enemies.queryArc(p.position, dir, def.range, def.arc ?? 150);
      for (const e of hits) {
        const r = h.roll(def); const d = e.position.subtract(p.position); d.y = 0; d.normalize();
        ctx.enemies.damage(e, r.amount, { dir: d, knockback: def.knockback, crit: r.crit, element: r.element, pos: e.hitCenter() });
        e.applyBleed(bleedDps(), 5);
        p.onHit(def.energyOnHit + p.bonus.energyOnHit);
      }
      audio.play(hits.length ? 'meleeHit' : 'meleeSwing', p.position, { pitch: 0.75 + Math.random() * 0.2 });
      if (hits.length) h.hitStop(0.03, 0.3);
    },
    whirl: (def) => {
      const p = ctx.player;
      ctx.vfx.slash(p.position, p.yaw + (p.swing++ % 2) * Math.PI, def.radius, 'blood');
      const n = ctx.enemies.damageArea(p.position, def.radius, () => h.roll(def).amount, { knockback: def.knockback, element: 'physical', bleed: { dps: bleedDps(), dur: 2 } });
      audio.play(n ? 'meleeHit' : 'meleeSwing', p.position, { pitch: 0.8, gain: 0.6 });
      if (n) p.onHit(1.5 * n);
    },
    leap: (def) => {
      const p = ctx.player; const at = h.groundTarget(def.range);
      const hop = at.subtract(p.position); hop.y = 0;
      p.invulnerable = 0.5; p.dash(hop, 0.42);
      audio.play('charge', p.position, { gain: 0.5, pitch: 1.5 });
      h.later(0.45, () => {
        const land = p.position.clone();
        ctx.vfx.stomp(land, def.radius); ctx.cam.shake(0.4, 0.3); h.hitStop(0.07, 0.1);
        audio.play('slam', land, { pitch: 1.1 });
        const n = ctx.enemies.damageArea(land, def.radius, () => h.roll(def).amount, { knockback: def.knockback, element: 'physical' });
        if (n) p.onHit(def.energyOnHit * n);
      });
    },
    frenzy: (def) => {
      const p = ctx.player; p.frenzyT = p.powers.has('ironLung') ? 10 : 6;
      ctx.vfx.lights.flash(p.chest(), PALETTE.healthBright, 30, 0.4, 6); ctx.vfx.burst('gore', p.chest(), 16);
      audio.play('eliteDeath', p.position, { pitch: 1.5, gain: 0.5 });
      void def;
    },
    bleedStorm: (def) => {
      const p = ctx.player;
      const near = ctx.enemies.queryNear(p.position, def.radius, []).filter((e) => e.alive && e.bleed > 0);
      for (const e of near) { const burst = Math.round(e.bleedDps * e.bleed * 1.2); e.bleed = 0; ctx.vfx.burst('gore', e.hitCenter(), 14); ctx.enemies.damage(e, burst, { element: 'bleed', pos: e.hitCenter(), crit: true }); p.onHit(def.energyOnHit); }
      ctx.vfx.slash(p.position, p.yaw, def.radius * 0.5, 'blood'); ctx.vfx.slash(p.position, p.yaw + Math.PI, def.radius * 0.5, 'blood');
      audio.play(near.length ? 'eliteDeath' : 'meleeSwing', p.position, { pitch: 0.9 });
      if (near.length) h.hitStop(0.08, 0.1);
    },
    harvest: (def) => {
      const p = ctx.player; p.harvestT = 8;
      ctx.vfx.lights.flash(p.chest(), PALETTE.health, 40, 0.6, 9); ctx.vfx.burst('heal', p.chest(), 30);
      audio.play('levelUp', p.position, { pitch: 0.7, gain: 0.6 });
      void def;
    },
  };
}
