import type { Vector3 } from '@babylonjs/core';
import type { ThirdPersonCamera } from '@/camera/thirdPerson';
import type { SlotState } from '@/abilities/system';
import type { Enemy } from '@/enemies/enemy';
import type { Player } from '@/player/player';
import { ICONS } from './icons';
import { ELITE_MODS } from '@/content/elites';
import { CLASSES, type ClassDef } from '@/content/classes';
import { audio } from '@/audio';

interface Num { el: HTMLSpanElement; t: number; busy: boolean }

/** DOM HUD: orbs, skill bar, XP, area text, floating numbers, enemy bars, soft-lock ring. */
export class Hud {
  root: HTMLElement;
  private hpFill: HTMLElement; private hpVal: HTMLElement; private enFill: HTMLElement; private enVal: HTMLElement;
  private slots = new Map<string, { el: HTMLElement; cd: HTMLElement; wasReady: boolean }>();
  private xp: HTMLElement; private lvl: HTMLElement;
  private area: HTMLElement; private objective: HTMLElement; private lock: HTMLElement; private lockhint: HTMLElement; private toastEl: HTMLElement; private deadEl: HTMLElement;
  private potion!: { el: HTMLElement; cd: HTMLElement };
  private nums: Num[] = [];
  private bars = new Map<number, HTMLElement>();
  private barPool: HTMLElement[] = [];
  private lootEls = new Map<number, HTMLElement>();
  private lootPool: HTMLElement[] = [];
  private proj = { x: 0, y: 0, z: 0, visible: false };
  private toastT = 0;
  private hurtT = 0;
  private hurtVig: HTMLElement;
  private promptEl: HTMLElement;
  hidden = false;

  constructor(private cam: ThirdPersonCamera) {
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <div class="areaname"><span data-area>THE OUTER COURT</span><small data-sub>HOLLOWMERE · NIGHT</small></div>
      <div class="objective"><span data-obj-title>THE SEXTON'S KEY</span><span data-obj>Reach the cathedral door</span></div>
      <div class="reticle"></div><div class="softlock"></div>
      <div class="lockhint">CLICK TO PLAY<small>WASD move · mouse aim · LMB bolt · RMB orb · 1 rift step · 2 flame nova · shift sprint · Q potion · F1 dev panel</small></div>
      <div class="toast"></div>
      <div class="prompt"></div>
      <div class="bossbar"><div class="name"></div><div class="bar"><i></i></div></div>
      <div class="fade"></div>
      <div class="hurtvig"></div>
      <div class="dead">YOU HAVE FALLEN<small>PRESS R TO RISE AGAIN</small></div>
      <div class="hudbottom">
        <div class="hud-orb health"><div class="fill"></div><div class="gloss"></div><div class="val">0</div></div>
        <div class="bar"><div class="skillbar"></div><div class="xpbar"><i></i><div class="lvl">1</div></div></div>
        <div class="hud-orb energy"><div class="fill"></div><div class="gloss"></div><div class="val">0</div></div>
      </div>`;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.hpFill = q('.hud-orb.health .fill'); this.hpVal = q('.hud-orb.health .val');
    this.enFill = q('.hud-orb.energy .fill'); this.enVal = q('.hud-orb.energy .val');
    this.xp = q('.xpbar i'); this.lvl = q('.xpbar .lvl');
    this.area = q('[data-area]'); this.objective = q('[data-obj]'); this.lock = q('.softlock'); this.lockhint = q('.lockhint'); this.toastEl = q(".toast"); this.deadEl = q(".dead"); this.hurtVig = q(".hurtvig"); this.promptEl = q(".prompt");
    this.setClass(CLASSES.sorcerer);
    for (let i = 0; i < 48; i++) { const el = document.createElement('span'); el.className = 'dmg'; this.root.appendChild(el); this.nums.push({ el, t: 0, busy: false }); }
  }

  /** Rebuild the skill bar and recolour the resource orb for a class. */
  setClass(cls: ClassDef): void {
    const bar = this.root.querySelector('.skillbar') as HTMLElement; bar.innerHTML = ''; this.slots.clear();
    for (const id of cls.abilities) {
      const el = document.createElement('div'); el.className = 'slot'; el.innerHTML = `${ICONS[id] ?? ICONS.generic}<div class="cdv" style="display:none"></div><div class="key"></div>`;
      bar.appendChild(el);
      this.slots.set(id, { el, cd: el.querySelector('.cdv')!, wasReady: false });
    }
    const div = document.createElement('div'); div.className = 'slot divider'; bar.appendChild(div);
    const pot = document.createElement('div'); pot.className = 'slot ready'; pot.innerHTML = `${ICONS.potion}<div class="cdv" style="display:none"></div><div class="key">Q</div>`; bar.appendChild(pot);
    this.potion = { el: pot, cd: pot.querySelector('.cdv')! };
    const orb = this.root.querySelector('.hud-orb.energy') as HTMLElement;
    orb.classList.remove('fury', 'focus', 'blood'); if (cls.resource.hudClass !== 'energy') orb.classList.add(cls.resource.hudClass);
    orb.title = cls.resource.name;
  }

  setHidden(h: boolean): void { this.hidden = h; this.root.classList.toggle('hidden', h); }
  setArea(name: string, sub: string): void { this.area.textContent = name; (this.root.querySelector('[data-sub]') as HTMLElement).textContent = sub; }
  setObjective(text: string): void { this.objective.textContent = text; }
  /** Contextual key prompt near the reticle; pass null to hide. */
  /** Boss health bar top centre; pass null to hide. */
  setBoss(name: string | null, frac = 1): void { const el = this.root.querySelector('.bossbar') as HTMLElement; el.classList.toggle('on', !!name); if (name) { (el.querySelector('.name') as HTMLElement).textContent = name; (el.querySelector('i') as HTMLElement).style.width = `${Math.max(0, frac * 100).toFixed(1)}%`; } }
  fade(on: boolean): void { (this.root.querySelector('.fade') as HTMLElement).classList.toggle('on', on); }
  prompt(text: string | null): void { this.promptEl.textContent = text ?? ""; this.promptEl.classList.toggle("on", !!text); }
  hurt(): void { this.hurtT = 0.35; this.hurtVig.classList.add("on"); }
  toast(title: string, sub = "", dur = 2.6): void { this.toastEl.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`; this.toastEl.classList.add('on'); this.toastT = dur; }

  number(pos: Vector3, text: string, kind: 'normal' | 'crit' | 'fire' | 'frost' | 'heal' = 'normal'): void {
    this.cam.project(pos, this.proj);
    if (!this.proj.visible) return;
    let n = this.nums.find((x) => !x.busy);
    if (!n) { if (kind !== 'crit') return; n = this.nums.reduce((a, b) => (a.t > b.t ? a : b)); }
    n.busy = true; n.t = 0;
    const el = n.el;
    el.className = `dmg ${kind === 'normal' ? '' : kind}`;
    el.textContent = text;
    el.style.left = `${this.proj.x + (Math.random() - 0.5) * 30}px`; el.style.top = `${this.proj.y - 20 + (Math.random() - 0.5) * 20}px`;
    void el.offsetWidth; el.classList.add('on');
  }

  /** Rarity-coloured labels over settled loot. */
  updateLoot(views: { id: number; pos: Vector3; text: string; color: string; big: boolean }[]): void {
    const seen = new Set<number>();
    for (const v of views) {
      this.cam.project(v.pos, this.proj);
      if (!this.proj.visible) continue;
      seen.add(v.id);
      let el = this.lootEls.get(v.id);
      if (!el) { el = this.lootPool.pop() ?? (() => { const d = document.createElement('div'); d.className = 'lootlbl'; this.root.appendChild(d); return d; })(); el.textContent = v.text; el.style.setProperty('--c', v.color); el.classList.toggle('big', v.big); el.classList.add('on'); this.lootEls.set(v.id, el); }
      el.style.left = `${this.proj.x}px`; el.style.top = `${this.proj.y - 18}px`;
    }
    for (const [id, el] of this.lootEls) if (!seen.has(id)) { el.classList.remove('on'); this.lootEls.delete(id); this.lootPool.push(el); }
  }

  update(dt: number, player: Player, slots: SlotState[], target: Enemy | null, enemies: Enemy[], locked: boolean): void {
    if (this.hidden) return;
    const hpF = player.hpMax > 0 ? player.hp / player.hpMax : 0;
    this.hpFill.style.height = `${(hpF * 100).toFixed(1)}%`; this.hpVal.textContent = `${Math.ceil(player.hp)}`;
    this.enFill.style.height = `${((player.energy / player.energyMax) * 100).toFixed(1)}%`; this.enVal.textContent = `${Math.floor(player.energy)}`;
    this.xp.style.width = `${Math.min(100, (player.xp / player.xpToNext()) * 100).toFixed(1)}%`; this.lvl.textContent = `${player.level}`;
    for (const s of slots) {
      const ui = this.slots.get(s.id)!;
      ui.el.querySelector('.key')!.textContent = s.def.keyLabel;
      ui.el.classList.toggle('locked', s.locked);
      ui.el.classList.toggle('noenergy', !s.locked && s.noEnergy && s.cd <= 0);
      ui.el.classList.toggle('ready', s.ready);
      const showCd = !s.locked && s.cd > 0 && s.cdMax > 0.5;
      ui.cd.style.display = showCd ? 'grid' : 'none';
      if (showCd) { ui.cd.style.setProperty('--sweep', `${(100 * (s.cd / s.cdMax)).toFixed(1)}%`); ui.cd.textContent = s.cd >= 1 ? `${Math.ceil(s.cd)}` : s.cd.toFixed(1); }
      if (s.ready && !ui.wasReady && !s.locked && s.cdMax > 0.5) { ui.el.classList.remove('flash'); void ui.el.offsetWidth; ui.el.classList.add('flash'); audio.play('ready'); }
      ui.wasReady = s.ready;
    }
    const pc = player.potionCd;
    this.potion.cd.style.display = pc > 0 ? 'grid' : 'none';
    if (pc > 0) { this.potion.cd.style.setProperty('--sweep', `${(100 * pc / 20).toFixed(1)}%`); this.potion.cd.textContent = `${Math.ceil(pc)}`; }
    // soft-lock ring
    if (target && target.alive) { this.cam.project(target.hitCenter(), this.proj); if (this.proj.visible) { this.lock.classList.add('on'); this.lock.style.left = `${this.proj.x}px`; this.lock.style.top = `${this.proj.y}px`; } else this.lock.classList.remove('on'); }
    else this.lock.classList.remove('on');
    this.lockhint.style.display = locked ? 'none' : 'block';
    this.deadEl.classList.toggle('on', player.dead);
    // numbers
    for (const n of this.nums) { if (!n.busy) continue; n.t += dt; if (n.t > 1.15) { n.busy = false; n.el.classList.remove('on'); n.el.textContent = ''; } }
    if (this.hurtT > 0) { this.hurtT -= dt; if (this.hurtT <= 0) this.hurtVig.classList.remove("on"); }
    this.hurtVig.classList.toggle("low", !player.dead && hpF < 0.3);
    // toast
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
    // enemy bars
    const seen = new Set<number>();
    for (const e of enemies) {
      if (!e.alive || (e.hp >= e.hpMax && !e.elite)) continue;
      this.cam.project(e.hitCenter().add(new (e.hitCenter().constructor as any)(0, e.height * 0.55, 0)), this.proj);
      if (!this.proj.visible || this.proj.z > 0.9995) continue;
      seen.add(e.id);
      let bar = this.bars.get(e.id);
      if (!bar) {
        bar = this.barPool.pop() ?? (() => { const b = document.createElement('div'); b.className = 'ebar'; b.innerHTML = '<i></i><div class="plate"></div>'; this.root.appendChild(b); return b; })();
        this.bars.set(e.id, bar); bar.classList.add('on'); bar.classList.toggle('elite', e.elite);
        (bar.querySelector('.plate') as HTMLElement).innerHTML = e.elite ? `${e.plateTitle.toUpperCase()}<small>${e.mod ? ELITE_MODS[e.mod].label : 'Elite'}</small>` : '';
      }
      bar.style.left = `${this.proj.x}px`; bar.style.top = `${this.proj.y}px`;
      (bar.firstElementChild as HTMLElement).style.width = `${Math.max(0, (e.hp / e.hpMax) * 100).toFixed(1)}%`;
    }
    for (const [id, bar] of this.bars) if (!seen.has(id)) { bar.classList.remove('on'); this.bars.delete(id); this.barPool.push(bar); }
  }
}
