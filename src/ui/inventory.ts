import { RARITY, SLOT_LABEL, STAT_LABEL, type Item } from '@/content/items';
import { itemScore } from '@/loot/generator';
import { EQUIP_KEYS, type EquipKey, type Player } from '@/player/player';
import { audio } from '@/audio';
import { PASSIVES, PASSIVE_ORDER, passiveSlots } from '@/content/passives';

const SLOT_ICON: Record<string, string> = {
  weapon: '<svg viewBox="0 0 40 40"><path d="M12 34 L28 6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="29" cy="7" r="5" fill="currentColor"/></svg>',
  head: '<svg viewBox="0 0 40 40"><path d="M8 30 Q20 -4 32 30 Z" fill="currentColor"/></svg>',
  chest: '<svg viewBox="0 0 40 40"><path d="M10 8 h20 l4 8 v18 h-28 v-18z" fill="currentColor"/></svg>',
  gloves: '<svg viewBox="0 0 40 40"><path d="M12 8 h6 v10 h4 v-10 h6 v20 l-4 6 h-10 l-4 -6z" fill="currentColor"/></svg>',
  boots: '<svg viewBox="0 0 40 40"><path d="M12 6 h10 v16 l10 6 v6 h-22z" fill="currentColor"/></svg>',
  amulet: '<svg viewBox="0 0 40 40"><circle cx="20" cy="14" r="10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M14 22 l6 12 l6 -12z" fill="currentColor"/></svg>',
  ring: '<svg viewBox="0 0 40 40"><circle cx="20" cy="22" r="10" fill="none" stroke="currentColor" stroke-width="5"/><rect x="16" y="6" width="8" height="8" fill="currentColor"/></svg>',
};

/** Inventory screen from the storyboard: paper doll left, 10×4 bag right, hover compares with the equipped item. */
export class InventoryUI {
  readonly el: HTMLElement;
  private doll: HTMLElement; private grid: HTMLElement; private stats: HTMLElement; private tip: HTMLElement; private passives: HTMLElement;
  private pickSlot = 0;
  open = false;
  constructor(private player: Player, private onChange: () => void, private onToggle: (open: boolean) => void) {
    this.el = document.createElement('div'); this.el.className = 'inv';
    this.el.innerHTML = `<div class="inv-panel"><div class="inv-title">INVENTORY</div><div class="inv-doll"><div class="inv-stand"></div><div class="inv-slots"></div><div class="inv-stats"></div></div><div class="inv-bag"><div class="inv-grid"></div><div class="inv-passives"></div><div class="inv-hint">LEFT CLICK EQUIP · RIGHT CLICK DROP · I OR ESC CLOSE</div></div><div class="inv-tip"></div></div>`;
    document.getElementById('hud')!.appendChild(this.el);
    this.doll = this.el.querySelector('.inv-slots')!; this.grid = this.el.querySelector('.inv-grid')!; this.stats = this.el.querySelector('.inv-stats')!; this.tip = this.el.querySelector('.inv-tip')!; this.passives = this.el.querySelector('.inv-passives')!;
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.addEventListener('mouseleave', () => this.hideTip());
  }

  toggle(): void { this.open ? this.close() : this.show(); }
  show(): void { this.open = true; this.el.classList.add('on'); this.refresh(); this.onToggle(true); audio.play('ready'); }
  close(): void { this.open = false; this.el.classList.remove('on'); this.hideTip(); this.onToggle(false); }

  refresh(): void {
    const p = this.player;
    this.doll.innerHTML = '';
    const pos: Record<EquipKey, [string, string]> = { head: ['1.2', '1.2'], chest: ['1.2', '7.6'], gloves: ['1.2', '14'], boots: ['1.2', '20.4'], weapon: ['-', '1.2'], amulet: ['-', '7.6'], ring: ['-', '14'], ring2: ['-', '20.4'] };
    for (const key of EQUIP_KEYS) {
      const it = p.equipment[key];
      const cell = document.createElement('div'); cell.className = 'eq' + (it ? ` r-${it.rarity}` : '');
      const [l, t] = pos[key];
      cell.style.top = `calc(var(--u)*${t})`; if (l === '-') cell.style.right = 'calc(var(--u)*1.2)'; else cell.style.left = `calc(var(--u)*${l})`;
      cell.innerHTML = `${SLOT_ICON[key === 'ring2' ? 'ring' : key]}<div class="tag">${(key === 'ring2' ? 'Ring' : SLOT_LABEL[key as keyof typeof SLOT_LABEL]).toUpperCase()}</div>`;
      if (it) { cell.onmouseenter = (e) => this.showTip(it, e, null); cell.onmousemove = (e) => this.moveTip(e); cell.onmouseleave = () => this.hideTip(); cell.onclick = () => { if (p.unequip(key)) { audio.play('pickup'); this.refresh(); this.onChange(); } else audio.play('denied'); }; }
      this.doll.appendChild(cell);
    }
    this.grid.innerHTML = '';
    for (let i = 0; i < p.inventoryMax; i++) {
      const it = p.inventory[i];
      const cell = document.createElement('div'); cell.className = 'cell' + (it ? ` i r-${it.rarity}` : '');
      if (it) {
        cell.innerHTML = SLOT_ICON[it.slot];
        const equipped = it.slot === 'ring' ? p.equipment.ring : p.equipment[it.slot];
        cell.onmouseenter = (e) => this.showTip(it, e, equipped ?? null); cell.onmousemove = (e) => this.moveTip(e); cell.onmouseleave = () => this.hideTip();
        cell.onclick = () => { p.equip(it); audio.play('pickup', undefined, { pitch: 1.2 }); this.hideTip(); this.refresh(); this.onChange(); };
        cell.oncontextmenu = (e) => { e.preventDefault(); p.removeItem(it.uid); audio.play('denied'); this.hideTip(); this.refresh(); this.onChange(); };
      }
      this.grid.appendChild(cell);
    }
    // passives: two slots (levels 5 and 8) and the six choices
    const slots = passiveSlots(p.level);
    let html = `<div class="pv-head">PASSIVES <span>${slots === 0 ? 'FIRST SLOT AT LEVEL 5' : slots === 1 ? 'SECOND SLOT AT LEVEL 8' : ''}</span></div><div class="pv-slots">`;
    for (let i = 0; i < 2; i++) { const id = p.passives[i]; html += `<div class="pv-slot ${i < slots ? 'open' : 'locked'} ${this.pickSlot === i ? 'sel' : ''}" data-slot="${i}">${id ? PASSIVES[id].icon : ''}<div class="tag">${i < slots ? (id ? PASSIVES[id].name : 'EMPTY') : `LEVEL ${i === 0 ? 5 : 8}`}</div></div>`; }
    html += '</div><div class="pv-list">';
    for (const id of PASSIVE_ORDER) html += `<div class="pv ${p.passives.includes(id) ? 'on' : ''}" data-id="${id}">${PASSIVES[id].icon}<div><b>${PASSIVES[id].name}</b><span>${PASSIVES[id].text}</span></div></div>`;
    html += '</div>';
    this.passives.innerHTML = html;
    this.passives.querySelectorAll<HTMLElement>('.pv-slot.open').forEach((el) => { el.onclick = () => { this.pickSlot = +el.dataset.slot!; this.refresh(); }; el.oncontextmenu = (e) => { e.preventDefault(); p.setPassive(+el.dataset.slot!, null); this.refresh(); this.onChange(); }; });
    this.passives.querySelectorAll<HTMLElement>('.pv').forEach((el) => { el.onclick = () => { if (slots === 0) { audio.play('denied'); return; } if (this.pickSlot >= slots) this.pickSlot = 0; if (p.setPassive(this.pickSlot, el.dataset.id as any)) { audio.play('levelUp'); this.refresh(); this.onChange(); } else audio.play('denied'); }; });

    const s = p.stats, b = p.bonus;
    const row = (k: string, v: string) => `<span>${k}<b>${v}</b></span>`;
    this.stats.innerHTML = row('Vitality', `${s.vitality}`) + row('Power', `${s.power}`) + row('Intelligence', `${s.intelligence}`) + row('Armor', `${s.armor}`) + row('Crit chance', `${(s.critChance * 100).toFixed(1)}%`) + row('Crit damage', `+${Math.round(s.critDamage * 100)}%`) + row('Attack speed', s.attackSpeed.toFixed(2)) + row('Spell power', `${Math.round(p.spellPower() * 100)}%`) + row('Arcane / Fire / Frost', `+${Math.round(b.arcane * 100)} / ${Math.round(b.fire * 100)} / ${Math.round(b.frost * 100)}%`) + row('Cooldown', `${Math.round(b.cooldown * 100)}%`);
  }

  private showTip(it: Item, e: MouseEvent, compare: Item | null): void {
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
    this.tip.innerHTML = `<h5>${it.name}</h5><div class="kind">${RARITY[it.rarity].label} · ${SLOT_LABEL[it.slot]} · Item level ${it.ilvl}</div><div class="big">${it.base.value}<small>${it.base.stat === 'spellDamage' ? 'Spell damage' : 'Armor'}${compare ? ` <i class="${baseDelta >= 0 ? 'up' : 'dn'}">${baseDelta >= 0 ? '▲' : '▼'} ${Math.abs(baseDelta)}</i>` : ''}</small></div><ul>${lines}${it.power ? `<li class="pas"><span>${it.power.text}</span></li>` : ''}</ul><div class="foot">${compare ? `COMPARED TO ${compare.name.toUpperCase()} · ${scoreDelta >= 0 ? '+' : ''}${scoreDelta} SCORE` : 'LEFT CLICK TO EQUIP'}</div>`;
    this.tip.classList.add('on'); this.moveTip(e);
  }
  private moveTip(e: MouseEvent): void { const r = this.el.getBoundingClientRect(); const w = this.tip.offsetWidth, h = this.tip.offsetHeight; let x = e.clientX - r.left + 18, y = e.clientY - r.top + 12; if (x + w > r.width - 10) x = e.clientX - r.left - w - 18; if (y + h > r.height - 10) y = r.height - h - 10; this.tip.style.left = `${x}px`; this.tip.style.top = `${y}px`; }
  private hideTip(): void { this.tip.classList.remove('on'); }
}
