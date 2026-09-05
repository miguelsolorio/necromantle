import { AFFIX_POOL, BASE_NAMES, LEGENDARIES, PREFIXES, RARITY, SLOTS, SUFFIXES, type Item, type Rarity, type Slot } from '@/content/items';
import { pick, rand } from '@/core/mathx';

let nextUid = 1;

function lerpRange(a: [number, number], b: [number, number], t: number): number { return rand(a[0] + (a[1] - a[0]) * t, b[0] + (b[1] - b[0]) * t); }

export function rollRarity(bonus = 0, forceLegendary = false): Rarity {
  if (forceLegendary) return 'legendary';
  // bonus shifts weight from common toward the top tiers (elites 1.5, bosses 3)
  const w = { common: RARITY.common.weight / (1 + bonus), magic: RARITY.magic.weight, rare: RARITY.rare.weight * (1 + bonus), legendary: RARITY.legendary.weight * (1 + bonus * 1.5) };
  const total = w.common + w.magic + w.rare + w.legendary;
  let r = Math.random() * total;
  for (const k of ['common', 'magic', 'rare', 'legendary'] as Rarity[]) { r -= w[k]; if (r <= 0) return k; }
  return 'common';
}

/** Roll one item. `ilvl` scales base and affix values (1–10 for the slice). */
export function rollItem(ilvl: number, rarity: Rarity = rollRarity(), slot?: Slot): Item {
  const t = Math.max(0, Math.min(1, (ilvl - 1) / 9));
  const legendary = rarity === 'legendary' ? pick(LEGENDARIES.filter((l) => !slot || l.slot === slot)) ?? pick(LEGENDARIES) : null;
  const s: Slot = legendary ? legendary.slot : slot ?? pick(SLOTS);
  const base = s === 'weapon'
    ? { stat: 'spellDamage' as const, value: Math.round(20 + 40 * t + rand(-3, 3)) }
    : { stat: 'armor' as const, value: Math.round((s === 'chest' ? 40 : s === 'head' ? 26 : s === 'gloves' || s === 'boots' ? 18 : 6) * (1 + 2.2 * t) * rand(0.9, 1.1)) };
  const [minA, maxA] = RARITY[rarity].affixes;
  const count = Math.round(rand(minA, maxA));
  const pool = AFFIX_POOL.filter((a) => !a.slots || a.slots.includes(s));
  const affixes: Item['affixes'] = [];
  const used = new Set<string>();
  for (let i = 0; i < count && pool.length; i++) {
    let a = pick(pool); let tries = 0;
    while (used.has(a.stat) && tries++ < 10) a = pick(pool);
    if (used.has(a.stat)) break;
    used.add(a.stat);
    let v = lerpRange(a.min, a.max, t) * (rarity === 'legendary' ? 1.15 : 1);
    v = a.round ? Math.round(v / a.round) * a.round : Math.round(v);
    affixes.push({ stat: a.stat, value: +v.toFixed(3) });
  }
  const baseName = pick(BASE_NAMES[s]);
  const name = legendary ? legendary.name : rarity === 'common' ? baseName : rarity === 'magic' ? (Math.random() < 0.5 ? `${pick(PREFIXES)} ${baseName}` : `${baseName} ${pick(SUFFIXES)}`) : `${pick(PREFIXES)} ${baseName} ${pick(SUFFIXES)}`;
  const item: Item = { uid: nextUid++, name, slot: s, rarity, ilvl, base, affixes };
  if (legendary) item.power = { id: legendary.power, text: legendary.text };
  return item;
}

/** Score for comparisons: what the item adds to the Sorcerer's effectiveness. */
export function itemScore(item: Item): number {
  let v = item.base.stat === 'spellDamage' ? item.base.value * 2 : item.base.value * 0.5;
  for (const a of item.affixes) {
    switch (a.stat) {
      case 'intelligence': v += a.value * 1.2; break;
      case 'vitality': v += a.value * 0.8; break;
      case 'power': v += a.value * 1.5; break;
      case 'armor': v += a.value * 0.4; break;
      case 'critChance': v += a.value * 400; break;
      case 'critDamage': v += a.value * 60; break;
      case 'attackSpeed': v += a.value * 150; break;
      case 'arcaneDamage': case 'fireDamage': case 'frostDamage': v += a.value * 120; break;
      case 'moveSpeed': v += a.value * 100; break;
      case 'energyRegen': v += a.value * 8; break;
      case 'energyOnHit': v += a.value * 6; break;
      case 'cooldown': v += a.value * 200; break;
    }
  }
  if (item.power) v += 40;
  return Math.round(v);
}
