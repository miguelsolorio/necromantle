import { Vector3 } from '@babylonjs/core';
import type { AbilityDef, AbilityId } from '@/content/abilities';
import type { AbilityHost, AbilityImpl } from './system';
import { audio } from '@/audio';
import { PALETTE } from '@/content/palette';

/**
 * Sepulcher Knight: sword-and-shield melee. Cleave chains three swings (the third throws the pack back),
 * Judgement leaps and slams, Shield Rush is a lane charge, Iron Ward absorbs and taunts, Grave Stomp
 * staggers a ring, Bulwark drags everything in and roots it.
 */
export function knightAbilities(h: AbilityHost): Partial<Record<AbilityId, AbilityImpl>> {
  const { ctx } = h;
  const facing = () => { const y = ctx.player.yaw; return new Vector3(Math.sin(y), 0, Math.cos(y)); };
  /** Aim melee at the soft target when it sits inside the arc, otherwise straight ahead of the camera. */
  const aim = (def: AbilityDef) => {
    const p = ctx.player; const t = ctx.targeting.target;
    const dir = ctx.cam.forward.clone(); dir.y = 0; dir.normalize();
    if (t && t.alive) { const d = t.position.subtract(p.position); d.y = 0; const len = d.length(); if (len < def.range + 2.5 && len > 0.01) { d.scaleInPlace(1 / len); if (Vector3.Dot(d, dir) > 0.3) dir.copyFrom(d); } }
    p.yaw = Math.atan2(dir.x, dir.z);
    // lunge magnetism: step toward a target just out of reach
    if (t && t.alive) { const len = Vector3.Distance(t.position, p.position); if (len > def.range && len < def.range + 1.8) p.shove(dir.scale(Math.min(1.2, len - def.range + 0.3)), 0.12); }
    return dir;
  };
  const swing = (def: AbilityDef, mult: number, knockback: number, tint: 'steel' | 'blood' = 'steel') => {
    const p = ctx.player; const dir = aim(def);
    ctx.vfx.slash(p.position, p.yaw, def.range, tint, (Math.random() - 0.5) * 0.5);
    const hits = ctx.enemies.queryArc(p.position, dir, def.range, def.arc ?? 120);
    for (const e of hits) {
      const r = h.roll(def, mult);
      const d = e.position.subtract(p.position); d.y = 0; d.normalize();
      ctx.enemies.damage(e, r.amount, { dir: d, knockback, crit: r.crit, element: r.element, pos: e.hitCenter() });
      p.onHit(def.energyOnHit + p.bonus.energyOnHit);
    }
    audio.play(hits.length ? 'meleeHit' : 'meleeSwing', p.position, { pitch: 0.9 + Math.random() * 0.2 });
    if (hits.length) h.hitStop(0.03, 0.3);
    return hits;
  };

  return {
    cleave: (def) => {
      const third = ctx.player.swing % 3 === 0; // swing was incremented by player.cast
      swing(def, third ? 1.35 : 1, third ? 6.5 : def.knockback);
      if (third) ctx.cam.shake(0.08, 0.12);
    },
    judgement: (def) => {
      const p = ctx.player; const dir = aim(def);
      const t = ctx.targeting.target; const dist = t && t.alive ? Math.min(def.range, Vector3.Distance(t.position, p.position) - 1.2) : Math.min(def.range, 4);
      const hop = dir.scale(Math.max(0, dist));
      p.invulnerable = 0.35; p.dash(hop, 0.3);
      audio.play('meleeSwing', p.position, { pitch: 0.7 });
      h.later(0.32, () => {
        const at = p.position.clone();
        ctx.vfx.stomp(at, def.radius); ctx.cam.shake(0.45, 0.3); h.hitStop(0.08, 0.1);
        audio.play('slam', at);
        ctx.enemies.damageArea(at, def.radius, () => h.roll(def).amount, { knockback: def.knockback, element: 'physical' });
      });
    },
    shieldRush: (def) => {
      const p = ctx.player; const dir = aim(def);
      p.invulnerable = 0.5; p.dash(dir.scale(def.range), 0.38);
      audio.play('charge', p.position, { gain: 0.7, pitch: 1.2 });
      ctx.vfx.burst('smoke', p.position.add(new Vector3(0, 0.3, 0)), 8);
      const from = p.position.clone();
      h.later(0.2, () => {
        const hits = ctx.enemies.queryLane(from, dir, def.range + 1, def.radius);
        for (const e of hits) { const r = h.roll(def); const d = dir.clone(); ctx.enemies.damage(e, r.amount, { dir: d, knockback: def.knockback, crit: r.crit, element: 'physical', pos: e.hitCenter() }); p.onHit(def.energyOnHit); }
        if (hits.length) { audio.play('meleeHit', p.position); h.hitStop(0.05, 0.2); }
      });
    },
    ironWard: (def) => {
      const p = ctx.player;
      p.shield = Math.round(p.hpMax * 0.3); p.shieldT = 6;
      ctx.vfx.wardRing(p.root, 6);
      audio.play('frostCast', p.position, { pitch: 0.6, gain: 0.8 });
      ctx.enemies.damageArea(p.position, def.radius, () => 0, { taunt: 4 });
    },
    graveStomp: (def) => {
      const p = ctx.player;
      ctx.vfx.stomp(p.position, def.radius); ctx.cam.shake(0.3, 0.25);
      audio.play('slam', p.position, { pitch: 1.3, gain: 0.8 });
      const n = ctx.enemies.damageArea(p.position, def.radius, () => h.roll(def).amount, { knockback: def.knockback, element: 'physical', slow: { k: 0.5, dur: 1.5 } });
      if (n) p.onHit(def.energyOnHit * n);
    },
    bulwark: (def) => {
      const p = ctx.player; const at = p.position.clone();
      audio.play('cataclysmCast', at, { pitch: 0.7 });
      ctx.vfx.lights.flash(at.add(new Vector3(0, 1.5, 0)), PALETTE.arcaneCore, 40, 0.5, 12);
      const near = ctx.enemies.queryNear(at, def.radius, []).filter((e) => e.alive);
      for (const e of near) {
        const d = at.subtract(e.position); d.y = 0; const len = d.length();
        if (len > 3) { const pull = d.scale((len - 2.6) / len); ctx.vfx.chain(e.position, at); e.root.position.addInPlace(pull); e.collider.position.copyFrom(e.root.position); }
        e.applyRoot(2);
        const r = h.roll(def); ctx.enemies.damage(e, r.amount, { crit: r.crit, element: 'physical', pos: e.hitCenter() });
      }
      if (near.length) { p.onHit(def.energyOnHit * near.length); ctx.cam.shake(0.2, 0.3); }
    },
  };
}
