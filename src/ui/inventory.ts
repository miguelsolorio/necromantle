import { RARITY, SLOT_LABEL, STAT_LABEL, WEAPON_LABEL, type Item } from '@/content/items';
import { CLASSES } from '@/content/classes';
import { itemScore } from '@/loot/generator';
import { EQUIP_KEYS, type EquipKey, type Player } from '@/player/player';
import { audio } from '@/audio';
import { IMPROVEMENTS, PASSIVES, PASSIVE_ORDER, passiveSlots } from '@/content/passives';
import { ABILITIES } from '@/content/abilities';
import { ICONS } from './icons';
import { PLATFORM } from '@/core/platform';

const SLOT_ICON: Record<string, string> = {
  weapon: '<svg viewBox="0 0 40 40"><path d="M12 34 L28 6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="29" cy="7" r="5" fill="currentColor"/></svg>',
  head: '<svg viewBox="0 0 40 40"><path d="M8 30 Q20 -4 32 30 Z" fill="currentColor"/></svg>',
  chest: '<svg viewBox="0 0 40 40"><path d="M10 8 h20 l4 8 v18 h-28 v-18z" fill="currentColor"/></svg>',
  gloves: '<svg viewBox="0 0 40 40"><path d="M12 8 h6 v10 h4 v-10 h6 v20 l-4 6 h-10 l-4 -6z" fill="currentColor"/></svg>',
  boots: '<svg viewBox="0 0 40 40"><path d="M12 6 h10 v16 l10 6 v6 h-22z" fill="currentColor"/></svg>',
  amulet: '<svg viewBox="0 0 40 40"><circle cx="20" cy="14" r="10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M14 22 l6 12 l6 -12z" fill="currentColor"/></svg>',
  ring: '<svg viewBox="0 0 40 40"><circle cx="20" cy="22" r="10" fill="none" stroke="currentColor" stroke-width="5"/><rect x="16" y="6" width="8" height="8" fill="currentColor"/></svg>',
};

type Tab = 'bag' | 'gear' | 'skills';
interface CardAction { label: string; cls: string; act: () => void }

/**
 * Inventory screen from the storyboard: paper doll left, 10×4 bag right, hover compares with the equipped item.
 * On touch the same card opens as a bottom sheet with Equip / Drop / Unequip buttons (no hover, no right click);
 * phones split the panel into GEAR / BAG / SKILLS tabs.
 */
export class InventoryUI {
  readonly el: HTMLElement;
  private skills: HTMLElement; private tab: Tab = PLATFORM.phone ? 'gear' : 'bag';
  private doll: HTMLElement; private grid: HTMLElement; private stats: HTMLElement; private tip: HTMLElement; private passives: HTMLElement;
  private pickSlot = 0;
  /** Touch: uid of the item whose card is open. */
  private selected: number | null = null;
  open = false;
  constructor(private player: Player, private onChange: () => void, private onToggle: (open: boolean) => void) {
    this.el = document.createElement('div'); this.el.className = 'inv';
    const tabs = PLATFORM.phone
      ? `<span class="tab on" data-tab="gear">GEAR</span><span class="tab" data-tab="bag">BAG</span><span class="tab" data-tab="skills">SKILLS</span>`
      : `<span class="tab on" data-tab="bag">INVENTORY</span><span class="tab" data-tab="skills">SKILLS</span>`;
    const hint = PLATFORM.touch ? 'TAP AN ITEM FOR ITS CARD · EQUIP OR DROP FROM THERE' : 'LEFT CLICK EQUIP · RIGHT CLICK DROP · I OR ESC CLOSE';
    this.el.innerHTML = `<div class="inv-panel"><div class="inv-title">${tabs}<span class="x" title="Close">✕</span></div><div class="inv-doll"><div class="inv-stand"></div><div class="inv-slots"></div><div class="inv-stats"></div></div><div class="inv-bag"><div class="inv-grid"></div><div class="inv-passives"></div><div class="inv-hint">${hint}</div></div><div class="inv-skills"></div><div class="inv-tip"></div></div>`;
    document.getElementById('hud')!.appendChild(this.el);
    this.skills = this.el.querySelector('.inv-skills')!;
    for (const t of this.el.querySelectorAll<HTMLElement>('.inv-title .tab')) t.onclick = () => { this.tab = t.dataset.tab as Tab; this.hideTip(); this.refresh(); };
    this.el.querySelector('.inv-title .x')!.addEventListener('click', () => this.close());
    this.doll = this.el.querySelector('.inv-slots')!; this.grid = this.el.querySelector('.inv-grid')!; this.stats = this.el.querySelector('.inv-stats')!; this.tip = this.el.querySelector('.inv-tip')!; this.passives = this.el.querySelector('.inv-passives')!;
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    if (PLATFORM.touch) this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); }); // tap the dark backdrop to leave
    else this.el.addEventListener('mouseleave', () => this.hideTip());
  }

  toggle(): void { this.open ? this.close() : this.show(); }
  show(): void { this.open = true; this.el.classList.add('on'); this.refresh(); this.onToggle(true); audio.play('ready'); }
  close(): void { this.open = false; this.el.classList.remove('on'); this.hideTip(); this.onToggle(false); }

  refresh(): void {
    const p = this.player;
    for (const t of this.el.querySelectorAll<HTMLElement>('.inv-title .tab')) t.classList.toggle('on', t.dataset.tab === this.tab);
    this.el.classList.remove('tab-bag', 'tab-gear', 'tab-skills'); this.el.classList.add(`tab-${this.tab}`);
    if (this.tab === 'skills') this.renderSkills();
    this.doll.innerHTML = '';
    const pos: Record<EquipKey, [string, string]> = { head: ['1.2', '1.2'], chest: ['1.2', '7.6'], gloves: ['1.2', '14'], boots: ['1.2', '20.4'], weapon: ['-', '1.2'], amulet: ['-', '7.6'], ring: ['-', '14'], ring2: ['-', '20.4'] };
    for (const key of EQUIP_KEYS) {
      const it = p.equipment[key];
      const cell = document.createElement('div'); cell.className = 'eq' + (it ? ` r-${it.rarity}` : '');
      const [l, t] = pos[key];
      cell.style.top = `calc(var(--u)*${t})`; if (l === '-') cell.style.right = 'calc(var(--u)*1.2)'; else cell.style.left = `calc(var(--u)*${l})`;
      cell.innerHTML = `${SLOT_ICON[key === 'ring2' ? 'ring' : key]}<div class="tag">${(key === 'ring2' ? 'Ring' : SLOT_LABEL[key as keyof typeof SLOT_LABEL]).toUpperCase()}</div>`;
      if (it) {
        cell.classList.toggle('sel', this.selected === it.uid);
        const unequip = () => { if (p.unequip(key)) { audio.play('pickup'); this.hideTip(); this.refresh(); this.onChange(); } else audio.play('denied'); };
        if (PLATFORM.touch) cell.onclick = () => this.openCard(it, null, [{ label: 'Unequip', cls: 'primary', act: unequip }]);
        else { cell.onmouseenter = (e) => this.showTip(it, e, null); cell.onmousemove = (e) => this.moveTip(e); cell.onmouseleave = () => this.hideTip(); cell.onclick = unequip; }
      }
      this.doll.appendChild(cell);
    }
    this.grid.innerHTML = '';
    for (let i = 0; i < p.inventoryMax; i++) {
      const it = p.inventory[i];
      const cell = document.createElement('div'); cell.className = 'cell' + (it ? ` i r-${it.rarity}` : '');
      if (it) {
        cell.innerHTML = SLOT_ICON[it.slot];
        if (!p.canEquip(it)) cell.classList.add('locked');
        cell.classList.toggle('sel', this.selected === it.uid);
        const equipped = it.slot === 'ring' ? p.equipment.ring : p.equipment[it.slot];
        const equip = () => { if (!p.canEquip(it)) { audio.play('denied'); return; } p.equip(it); audio.play('pickup', undefined, { pitch: 1.2 }); this.hideTip(); this.refresh(); this.onChange(); };
        const drop = () => { p.removeItem(it.uid); audio.play('denied'); this.hideTip(); this.refresh(); this.onChange(); };
        if (PLATFORM.touch) cell.onclick = () => this.openCard(it, equipped ?? null, [...(p.canEquip(it) ? [{ label: 'Equip', cls: 'primary', act: equip }] : []), { label: 'Drop', cls: 'danger', act: drop }]);
        else {
          cell.onmouseenter = (e) => this.showTip(it, e, equipped ?? null); cell.onmousemove = (e) => this.moveTip(e); cell.onmouseleave = () => this.hideTip();
          cell.onclick = equip;
          cell.oncontextmenu = (e) => { e.preventDefault(); drop(); };
        }
      }
      this.grid.appendChild(cell);
    }
    // passives: two slots (levels 5 and 8) and the six choices
    const slots = passiveSlots(p.level);
    let html = `<div class="pv-head">PASSIVES <span>${slots === 0 ? 'FIRST SLOT AT LEVEL 5' : slots === 1 ? 'SECOND SLOT AT LEVEL 8' : ''}</span></div><div class="pv-slots">`;
    for (let i = 0; i < 2; i++) { const id = p.passives[i]; html += `<div class="pv-slot ${i < slots ? 'open' : 'locked'} ${this.pickSlot === i ? 'sel' : ''}" data-slot="${i}">${id ? PASSIVES[id].icon : ''}${id && PLATFORM.touch ? '<i class="clr" title="Clear">✕</i>' : ''}<div class="tag">${i < slots ? (id ? PASSIVES[id].name : 'EMPTY') : `LEVEL ${i === 0 ? 5 : 8}`}</div></div>`; }
    html += '</div><div class="pv-list">';
    for (const id of PASSIVE_ORDER) html += `<div class="pv ${p.passives.includes(id) ? 'on' : ''}" data-id="${id}">${PASSIVES[id].icon}<div><b>${PASSIVES[id].name}</b><span>${PASSIVES[id].text}</span></div></div>`;
    html += '</div>';
    this.passives.innerHTML = html;
    this.passives.querySelectorAll<HTMLElement>('.pv-slot.open').forEach((el) => {
      const clear = () => { p.setPassive(+el.dataset.slot!, null); this.refresh(); this.onChange(); };
      el.onclick = () => { this.pickSlot = +el.dataset.slot!; this.refresh(); };
      el.oncontextmenu = (e) => { e.preventDefault(); clear(); };
      const x = el.querySelector<HTMLElement>('.clr'); if (x) x.onclick = (e) => { e.stopPropagation(); clear(); };
    });
    this.passives.querySelectorAll<HTMLElement>('.pv').forEach((el) => { el.onclick = () => { if (slots === 0) { audio.play('denied'); return; } if (this.pickSlot >= slots) this.pickSlot = 0; if (p.setPassive(this.pickSlot, el.dataset.id as any)) { audio.play('levelUp'); this.refresh(); this.onChange(); } else audio.play('denied'); }; });

    const s = p.stats, b = p.bonus;
    const row = (k: string, v: string) => `<span>${k}<b>${v}</b></span>`;
    this.stats.innerHTML = row('Vitality', `${s.vitality}`) + row('Power', `${s.power}`) + row('Intelligence', `${s.intelligence}`) + row('Armor', `${s.armor}`) + row('Crit chance', `${(s.critChance * 100).toFixed(1)}%`) + row('Crit damage', `+${Math.round(s.critDamage * 100)}%`) + row('Attack speed', s.attackSpeed.toFixed(2)) + (p.cls.id === 'sorcerer' ? row('Spell power', `${Math.round(p.spellPower() * 100)}%`) + row('Arcane / Fire / Frost', `+${Math.round(b.arcane * 100)} / ${Math.round(b.fire * 100)} / ${Math.round(b.frost * 100)}%`) : row('Weapon power', `${Math.round(p.meleePower() * 100)}%`) + row('Physical damage', `+${Math.round(b.physical * 100)}%`)) + row('Cooldown', `${Math.round(b.cooldown * 100)}%`);
  }

  /** Skills tab: the six abilities with live numbers, unlocks, and the level improvements. */
  private renderSkills(): void {
    const p = this.player; const cls = p.cls;
    const cards = cls.abilities.map((id) => {
      const a = ABILITIES[id]; const locked = p.level < a.unlockLevel;
      const dmg = a.damage.base > 0 ? Math.round(a.damage.base * p.powerFor(a.damage.element)) : 0;
      const cost = a.channel ? `${a.cost} ${cls.resource.name} / ${a.castInterval}s` : a.cost > 0 ? `${a.cost} ${cls.resource.name}` : a.cooldown > 0 ? `${a.cooldown}s cooldown` : 'No cost';
      const facts = [dmg ? `<b>${dmg}</b> ${a.damage.element}${a.arc ? ` · ${a.arc}° arc` : a.radius ? ` · ${a.radius} m` : ''}` : a.radius ? `${a.radius} m` : '', a.range ? `${a.range} m range` : '', a.energyOnHit ? `+${a.energyOnHit} ${cls.resource.name} on hit` : ''].filter(Boolean).join(' · ');
      return `<div class="sk ${locked ? 'locked' : ''}"><div class="ico">${ICONS[id] ?? ICONS.generic}<span class="key">${PLATFORM.touch ? '' : a.keyLabel}</span></div><div class="body"><div class="head"><b>${a.name.toUpperCase()}</b><span>${a.kind}</span></div><div class="desc">${a.description}</div><div class="facts">${facts}</div><div class="cost">${cost}${locked ? ` · UNLOCKS AT LEVEL ${a.unlockLevel}` : ''}</div></div></div>`;
    }).join('');
    const imps = IMPROVEMENTS.filter((i) => cls.id === 'sorcerer' || i.level === 5 || i.level === 8).map((i) => `<div class="imp ${p.level >= i.level ? 'on' : ''}"><span>LEVEL ${i.level}</span><b>${i.title}</b><small>${i.text}</small></div>`).join('');
    this.skills.innerHTML = `<div class="sk-head" style="--accent:${cls.accent}"><h4>${cls.name.toUpperCase()}</h4><span>${cls.resource.name} · ${cls.resource.desc}</span></div><div class="sk-list">${cards}</div><div class="sk-imps"><div class="pv-head">MILESTONES</div>${imps}</div>`;
  }

  /** Fill the card for an item, comparing against what is equipped in that slot. */
  private renderTip(it: Item, compare: Item | null): void {
    const c = RARITY[it.rarity].color;
    const lines = it.affixes.map((a) => {
      const other = compare?.affixes.find((x) => x.stat === a.stat);
      const d = compare ? a.value - (other?.value ?? 0) : 0;
      const dTxt = !compare ? '' : Math.abs(d) < 1e-6 ? '<span class="d eq">=</span>' : d > 0 ? `<span class="d up">▲ ${STAT_LABEL[a.stat].fmt(d).replace('+', '')}</span>` : `<span class="d dn">▼ ${STAT_LABEL[a.stat].fmt(-d).replace('+', '')}</span>`;
      return `<li><span>${STAT_LABEL[a.stat].fmt(a.value)} ${STAT_LABEL[a.stat].label}</span>${dTxt}</li>`;
    }).join('');
    const baseDelta = compare ? it.base.value - compare.base.value : 0;
    const scoreDelta = compare ? itemScore(it) - itemScore(compare) : 0;
    this.tip.style.setProperty('--rc', c);
    this.tip.innerHTML = `<h5>${it.name}</h5><div class="kind">${RARITY[it.rarity].label} · ${it.slot === 'weapon' && it.classId ? WEAPON_LABEL[it.classId] : SLOT_LABEL[it.slot]} · Item level ${it.ilvl}${it.classId && it.classId !== this.player.cls.id ? ` · <i class="dn">${CLASSES[it.classId].name} only</i>` : ''}</div><div class="big">${it.base.value}<small>${it.base.stat === 'spellDamage' ? 'Weapon damage' : 'Armor'}${compare ? ` <i class="${baseDelta >= 0 ? 'up' : 'dn'}">${baseDelta >= 0 ? '▲' : '▼'} ${Math.abs(baseDelta)}</i>` : ''}</small></div><ul>${lines}${it.power ? `<li class="pas"><span>${it.power.text}</span></li>` : ''}</ul><div class="foot">${compare ? `COMPARED TO ${compare.name.toUpperCase()} · ${scoreDelta >= 0 ? '+' : ''}${scoreDelta} SCORE` : PLATFORM.touch ? '' : 'LEFT CLICK TO EQUIP'}</div>`;
  }
  private showTip(it: Item, e: MouseEvent, compare: Item | null): void { this.renderTip(it, compare); this.tip.classList.add('on'); this.moveTip(e); }
  /** Touch: the card as a bottom sheet with its actions. */
  private openCard(it: Item, compare: Item | null, actions: CardAction[]): void {
    this.selected = it.uid;
    this.renderTip(it, compare);
    const acts = document.createElement('div'); acts.className = 'acts';
    for (const a of [...actions, { label: 'Close', cls: '', act: () => this.hideTip() }]) { const b = document.createElement('button'); b.className = a.cls; b.textContent = a.label; b.onclick = a.act; acts.appendChild(b); }
    this.tip.appendChild(acts);
    this.tip.classList.add('on');
    this.refresh(); // re-marks the selected cell
  }
  private moveTip(e: MouseEvent): void { const r = this.el.getBoundingClientRect(); const w = this.tip.offsetWidth, h = this.tip.offsetHeight; let x = e.clientX - r.left + 18, y = e.clientY - r.top + 12; if (x + w > r.width - 10) x = e.clientX - r.left - w - 18; if (y + h > r.height - 10) y = r.height - h - 10; this.tip.style.left = `${x}px`; this.tip.style.top = `${y}px`; }
  private hideTip(): void { this.tip.classList.remove('on'); if (this.selected !== null) { this.selected = null; for (const c of this.el.querySelectorAll('.sel')) if (!c.classList.contains('pv-slot')) c.classList.remove('sel'); } }
}
