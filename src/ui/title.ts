import './title.css';
import { ABILITIES } from '@/content/abilities';
import type { ClassId } from '@/content/abilities';
import { CLASS_ORDER, CLASSES } from '@/content/classes';
import type { Settings, SlotInfo } from '@/persistence/save';
import { ICONS } from './icons';
import { audio } from '@/audio';
import { PLATFORM } from '@/core/platform';

export type TitleView = 'title' | 'select' | 'hidden';

export interface TitleHooks {
  slots(): SlotInfo[];
  lastPlayed(): ClassId | null;
  backend: string;
  onView(view: TitleView): void;
  onFocus(id: ClassId): void;
  onPreview(id: ClassId, clip: string): void;
  onBegin(id: ClassId, fresh: boolean): void;
  onDelete(id: ClassId): void;
  getSettings(): Settings;
  onSettings(s: Settings): void;
  /** The settings sheet was closed while it stood alone over the game (touch pause). */
  onResume?(): void;
}

const fmtTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

/**
 * Title screen and character select as an HTML overlay above the live hub scene. The 3D pedestals live in
 * `world/selectStage.ts`; this only owns the panels, the slot card, keyboard focus and the two modals.
 */
export class TitleScreen {
  private root: HTMLElement;
  private view: TitleView = 'hidden';
  private focused: ClassId = 'sorcerer';

  constructor(private hooks: TitleHooks) {
    this.root = document.createElement('div'); this.root.id = 'title';
    this.root.innerHTML = `
      <div class="veil"></div>
      <div class="view tv" data-view="title">
        <div class="tv-wordmark">NECROMANTLE</div>
        <div class="tv-sub">The dead of Hollowmere are not staying buried.</div>
        <div class="tv-menu"></div>
        <div class="status"></div>
      </div>
      <div class="view sv" data-view="select">
        <div class="sv-slot"></div>
        <div class="sv-panel"></div>
        <div class="sv-classes"></div>
        <button class="sv-back">Back</button>
      </div>
      <div class="tmodal settings"><div class="box"><h2>SETTINGS</h2>
        <label>Music <input type="range" min="0" max="1" step="0.05" data-set="music"><output></output></label>
        <label>Effects <input type="range" min="0" max="1" step="0.05" data-set="sfx"><output></output></label>
        <label class="touch-only">Look sensitivity <input type="range" min="0.5" max="2" step="0.1" data-set="look"><output></output></label>
        <label>Quality <select data-set="quality"><option value="auto">Auto</option><option value="low">Low</option><option value="high">High</option></select><span></span><span class="note">Auto picks Low on phones. Takes effect the next time the game loads.</span></label>
        <label>Ambient occlusion <input type="checkbox" data-set="ssao"><span></span></label>
        <button class="mute">Mute</button>
        <button class="close">Done</button></div></div>
      <div class="tmodal credits"><div class="box"><h2>CREDITS</h2>
        <p>Necromantle is an original vertical slice built on Babylon.js, rendered with WebGPU where the browser allows it.</p>
        <ul><li>Character and dungeon placeholders: KayKit Adventurers, Skeletons and Dungeon Remastered packs (CC0).</li>
        <li>Type: Cinzel, Crimson Pro and IBM Plex Mono via Google Fonts.</li>
        <li>Every sound and every note is synthesized at run time.</li></ul>
        <button class="close">Back</button></div></div>
      <div class="tmodal confirm"><div class="box"><h2>DELETE JOURNEY</h2><p class="tconfirm"></p><button class="primary danger" data-act="delete">Delete</button><button class="close">Keep it</button></div></div>
      <div class="backend"></div>`;
    document.body.appendChild(this.root);
    (this.root.querySelector('.backend') as HTMLElement).textContent = hooks.backend;
    this.root.querySelector('.sv-back')!.addEventListener('click', () => this.show('title'));
    for (const m of this.root.querySelectorAll('.tmodal')) m.querySelector('.close')!.addEventListener('click', () => this.closeModal(m));
    this.root.querySelector('.settings .mute')!.addEventListener('click', () => { audio.engine.toggleMute(); this.syncMute(); });
    this.root.querySelector('[data-act="delete"]')!.addEventListener('click', () => { this.hooks.onDelete(this.focused); this.root.querySelector('.confirm')!.classList.remove('on'); this.renderSelect(); });
    for (const input of this.root.querySelectorAll<HTMLElement>('.settings input, .settings select')) {
      const apply = () => { const s = this.readSettings(); this.hooks.onSettings(s); this.syncSettings(s); };
      input.addEventListener('input', apply); input.addEventListener('change', apply);
    }
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get current(): TitleView { return this.view; }

  show(view: TitleView): void {
    this.view = view;
    this.root.classList.toggle('on', view !== 'hidden');
    for (const v of this.root.querySelectorAll<HTMLElement>('.view')) v.classList.toggle('on', v.dataset.view === view);
    if (view === 'title') this.renderTitle();
    if (view === 'select') { this.focused = this.hooks.lastPlayed() ?? 'sorcerer'; this.renderSelect(); this.hooks.onFocus(this.focused); }
    this.hooks.onView(view);
  }

  setStatus(text: string): void { (this.root.querySelector('.status') as HTMLElement).textContent = text; }

  /** Settings as a sheet over the running game (touch pause button). `onResume` fires when it closes. */
  openSettings(): void {
    this.syncSettings(this.hooks.getSettings()); this.syncMute();
    this.root.classList.add('on', 'modal-only');
    this.root.querySelector('.settings')!.classList.add('on');
  }
  private closeModal(m: Element): void {
    m.classList.remove('on');
    if (this.root.classList.contains('modal-only')) { this.root.classList.remove('on', 'modal-only'); this.hooks.onResume?.(); }
  }
  private syncMute(): void { (this.root.querySelector('.settings .mute') as HTMLElement).textContent = audio.engine.muted ? 'Unmute' : 'Mute'; }

  private renderTitle(): void {
    const menu = this.root.querySelector('.tv-menu') as HTMLElement; menu.innerHTML = '';
    const last = this.hooks.lastPlayed(); const slot = last ? this.hooks.slots().find((s) => s.classId === last) : null;
    const btn = (label: string, hint: string | null, cls: string, act: () => void) => { const b = document.createElement('button'); b.className = cls; b.innerHTML = `${label}${hint ? `<span class="hint">${hint}</span>` : ''}`; b.addEventListener('click', act); menu.appendChild(b); return b; };
    if (slot && last) btn('Continue', `${CLASSES[last].name} · Level ${slot.level} · ${slot.areaName || 'Hollowmere'}`, 'primary', () => this.hooks.onBegin(last, false));
    btn(slot ? 'Choose a character' : 'New journey', null, slot ? '' : 'primary', () => this.show('select'));
    btn('Settings', null, '', () => { this.syncSettings(this.hooks.getSettings()); this.root.querySelector('.settings')!.classList.add('on'); });
    btn('Credits', null, '', () => this.root.querySelector('.credits')!.classList.add('on'));
    (menu.firstElementChild as HTMLElement)?.focus();
  }

  private renderSelect(): void {
    const slots = this.hooks.slots();
    const tabs = this.root.querySelector('.sv-classes') as HTMLElement; tabs.innerHTML = '';
    for (const id of CLASS_ORDER) {
      const def = CLASSES[id]; const slot = slots.find((s) => s.classId === id);
      const b = document.createElement('button'); b.className = `cls${id === this.focused ? ' focus' : ''}`; b.style.setProperty('--accent', def.accent);
      b.innerHTML = `<b>${def.name}${slot ? `<span class="lvl">LV ${slot.level}</span>` : ''}</b><small>${def.weaponLabel} · ${def.resource.name}${def.playable ? '' : ' · in development'}</small>`;
      b.addEventListener('mouseenter', () => this.focus(id)); b.addEventListener('focus', () => this.focus(id));
      // Mouse: click begins. Touch: the first tap focuses the class (its card shows Continue / Start over / Delete),
      // a tap on the focused class begins. Handled on pointerup because iOS withholds the compat click when the
      // hover handlers change content, and the compat mouseenter would otherwise focus before the click arrives.
      b.addEventListener('click', () => { if (PLATFORM.touch) return; this.focus(id); if (def.playable) this.hooks.onBegin(id, !slot); });
      let down: { x: number; y: number } | null = null;
      b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') down = { x: e.clientX, y: e.clientY }; });
      b.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse' || !down) return;
        const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12; down = null;
        if (!tap) return;
        if (this.focused === id) { if (def.playable) this.hooks.onBegin(id, !this.hooks.slots().some((s) => s.classId === id)); }
        else this.focus(id);
      });
      b.addEventListener('pointercancel', () => { down = null; });
      tabs.appendChild(b);
    }
    this.renderPanel(); this.renderSlot();
  }

  private focus(id: ClassId): void {
    if (this.focused === id) { return; }
    this.focused = id; this.hooks.onFocus(id);
    for (const b of this.root.querySelectorAll<HTMLElement>('.sv-classes .cls')) b.classList.toggle('focus', b.querySelector('b')?.textContent?.startsWith(CLASSES[id].name) ?? false);
    this.renderPanel(); this.renderSlot();
  }

  private renderPanel(): void {
    const def = CLASSES[this.focused]; const panel = this.root.querySelector('.sv-panel') as HTMLElement; panel.style.setProperty('--accent', def.accent);
    const cards = def.abilities.map((aid) => {
      const a = ABILITIES[aid];
      const cost = a.channel ? `${a.cost} ${def.resource.name}/s` : a.cost > 0 ? `${a.cost} ${def.resource.name}` : a.cooldown > 0 ? `${a.cooldown}s` : 'free';
      return `<div class="sv-ab" data-anim="${a.anim}"><div class="ico">${ICONS[aid] ?? ICONS.generic}</div><div><b>${a.name.toUpperCase()}</b><small>${a.description}</small></div><div class="meta"><em>${a.keyLabel}</em><br>${cost}<br>lv ${a.unlockLevel}</div></div>`;
    }).join('');
    panel.innerHTML = `<h2>${def.name.toUpperCase()}</h2><p class="blurb">${def.blurb}</p>
      <div class="res"><b>${def.resource.name}</b><span><i></i></span><span style="grid-column: 1 / -1">${def.resource.desc}</span></div>
      <div class="sv-abilities">${cards}</div>`;
    for (const c of panel.querySelectorAll<HTMLElement>('.sv-ab')) { const preview = () => this.hooks.onPreview(this.focused, c.dataset.anim!); c.addEventListener('mouseenter', preview); c.addEventListener('click', preview); }
  }

  private renderSlot(): void {
    const def = CLASSES[this.focused]; const slot = this.hooks.slots().find((s) => s.classId === this.focused);
    const el = this.root.querySelector('.sv-slot') as HTMLElement;
    const rows = slot ? `<div class="row"><span>Level</span><span>${slot.level}</span></div><div class="row"><span>Area</span><span>${slot.areaName || 'Hollowmere'}</span></div><div class="row"><span>Played</span><span>${fmtTime(slot.playTime)}</span></div><div class="row"><span>Last</span><span>${new Date(slot.savedAt).toLocaleDateString()}</span></div>` : `<div class="empty">No journey yet.</div>`;
    el.innerHTML = `<h3>${def.name.toUpperCase()}</h3>${rows}<div class="actions">
      ${def.playable ? (slot ? `<button class="primary" data-act="continue">Continue</button><button data-act="fresh">Start over</button><button class="danger" data-act="ask">Delete journey</button>` : `<button class="primary" data-act="fresh">Begin</button>`) : `<button disabled>In development</button>`}
    </div>`;
    el.querySelector('[data-act="continue"]')?.addEventListener('click', () => this.hooks.onBegin(this.focused, false));
    el.querySelector('[data-act="fresh"]')?.addEventListener('click', () => this.hooks.onBegin(this.focused, true));
    el.querySelector('[data-act="ask"]')?.addEventListener('click', () => { (this.root.querySelector('.tconfirm') as HTMLElement).textContent = `Delete the ${def.name}'s journey (level ${slot?.level ?? 1})? This cannot be undone.`; this.root.querySelector('.confirm')!.classList.add('on'); });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.view === 'hidden' && !this.root.classList.contains('modal-only')) return;
    if (this.root.querySelector('.tmodal.on')) { if (e.key === 'Escape') this.root.querySelectorAll('.tmodal.on').forEach((m) => this.closeModal(m)); return; }
    if (this.view === 'select') {
      const i = CLASS_ORDER.indexOf(this.focused);
      if (e.key === 'ArrowRight' || e.key === 'd') this.focus(CLASS_ORDER[(i + 1) % CLASS_ORDER.length]);
      else if (e.key === 'ArrowLeft' || e.key === 'a') this.focus(CLASS_ORDER[(i + CLASS_ORDER.length - 1) % CLASS_ORDER.length]);
      else if (e.key === 'Enter') { const def = CLASSES[this.focused]; if (def.playable) this.hooks.onBegin(this.focused, !this.hooks.slots().some((s) => s.classId === this.focused)); }
      else if (e.key === 'Escape') this.show('title');
    } else if (this.view === 'title' && e.key === 'Enter') { (this.root.querySelector('.tv-menu button') as HTMLElement)?.click(); }
  }

  private readSettings(): Settings {
    const q = (k: string) => this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`.settings [data-set="${k}"]`)!;
    return { music: +q('music').value, sfx: +q('sfx').value, ssao: (q('ssao') as HTMLInputElement).checked, look: +q('look').value, quality: q('quality').value as Settings['quality'] };
  }
  private syncSettings(s: Settings): void {
    for (const el of this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.settings [data-set]')) {
      const k = el.dataset.set as keyof Settings; const v = s[k];
      if (el instanceof HTMLSelectElement) { el.value = `${v ?? 'auto'}`; continue; }
      if (el.type === 'checkbox') { el.checked = !!v; continue; }
      const n = typeof v === 'number' ? v : k === 'look' ? 1 : 0;
      el.value = `${n}`;
      const o = el.parentElement!.querySelector('output'); if (o) o.textContent = k === 'look' ? `${n.toFixed(1)}×` : `${Math.round(n * 100)}%`;
    }
  }
}
