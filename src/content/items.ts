export type Slot = 'weapon' | 'head' | 'chest' | 'gloves' | 'boots' | 'amulet' | 'ring';
export type Rarity = 'common' | 'magic' | 'rare' | 'legendary';
export type StatKey = 'intelligence' | 'vitality' | 'power' | 'armor' | 'critChance' | 'critDamage' | 'attackSpeed' | 'arcaneDamage' | 'fireDamage' | 'frostDamage' | 'physicalDamage' | 'moveSpeed' | 'energyRegen' | 'energyOnHit' | 'cooldown';
import type { ClassId } from './abilities';
export type PowerId = 'starfall' | 'ashen' | 'fold' | 'hollowCrown' | 'cinderBand' | 'ironTide' | 'gravebind' | 'twinString' | 'thornCrown' | 'redHarvest' | 'ironLung';

export interface Affix { stat: StatKey; value: number }
export interface Item {
  uid: number;
  name: string;
  slot: Slot;
  rarity: Rarity;
  ilvl: number;
  /** Weapons carry spell damage, everything else armor. */
  base: { stat: 'spellDamage' | 'armor'; value: number };
  affixes: Affix[];
  power?: { id: PowerId; text: string };
  /** Weapons and legendaries belong to one class; everything else is shared. */
  classId?: ClassId;
}

export const SLOTS: Slot[] = ['weapon', 'head', 'chest', 'gloves', 'boots', 'amulet', 'ring'];
export const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', head: 'Head', chest: 'Chest', gloves: 'Gloves', boots: 'Boots', amulet: 'Amulet', ring: 'Ring' };

export const RARITY: Record<Rarity, { label: string; color: string; affixes: [number, number]; weight: number; beam: number }> = {
  common: { label: 'Common', color: '#E8E4DA', affixes: [0, 1], weight: 62, beam: 0.35 },
  magic: { label: 'Magic', color: '#5B8DEF', affixes: [1, 2], weight: 27, beam: 0.6 },
  rare: { label: 'Rare', color: '#F0D24A', affixes: [3, 4], weight: 9, beam: 0.85 },
  legendary: { label: 'Legendary', color: '#FF8F1F', affixes: [3, 4], weight: 2, beam: 1.2 },
};

export const STAT_LABEL: Record<StatKey, { label: string; fmt: (v: number) => string }> = {
  intelligence: { label: 'Intelligence', fmt: (v) => `+${v}` },
  vitality: { label: 'Vitality', fmt: (v) => `+${v}` },
  power: { label: 'Power', fmt: (v) => `+${v}` },
  armor: { label: 'Armor', fmt: (v) => `+${v}` },
  critChance: { label: 'Critical Hit Chance', fmt: (v) => `+${(v * 100).toFixed(1)}%` },
  critDamage: { label: 'Critical Hit Damage', fmt: (v) => `+${Math.round(v * 100)}%` },
  attackSpeed: { label: 'Attack Speed', fmt: (v) => `+${Math.round(v * 100)}%` },
  arcaneDamage: { label: 'Arcane Damage', fmt: (v) => `+${Math.round(v * 100)}%` },
  fireDamage: { label: 'Fire Damage', fmt: (v) => `+${Math.round(v * 100)}%` },
  frostDamage: { label: 'Frost Damage', fmt: (v) => `+${Math.round(v * 100)}%` },
  physicalDamage: { label: 'Physical Damage', fmt: (v) => `+${Math.round(v * 100)}%` },
  moveSpeed: { label: 'Movement Speed', fmt: (v) => `+${Math.round(v * 100)}%` },
  energyRegen: { label: 'Arcane Energy per second', fmt: (v) => `+${v.toFixed(1)}` },
  energyOnHit: { label: 'Arcane Energy on hit', fmt: (v) => `+${v}` },
  cooldown: { label: 'Cooldown Reduction', fmt: (v) => `${Math.round(v * 100)}%` },
};

/** Affix ranges at item level 1 and 10 (linear between). */
export const AFFIX_POOL: { stat: StatKey; min: [number, number]; max: [number, number]; slots?: Slot[]; round?: number ; classes?: ClassId[] }[] = [
  { stat: 'intelligence', min: [4, 14], max: [12, 40] },
  { stat: 'vitality', min: [5, 16], max: [14, 45] },
  { stat: 'power', min: [2, 6], max: [6, 18] },
  { stat: 'armor', min: [6, 20], max: [18, 60], slots: ['head', 'chest', 'gloves', 'boots'] },
  { stat: 'critChance', min: [0.01, 0.02], max: [0.03, 0.06], slots: ['gloves', 'amulet', 'ring', 'weapon'], round: 0.005 },
  { stat: 'critDamage', min: [0.1, 0.2], max: [0.3, 0.6], slots: ['gloves', 'amulet', 'ring', 'weapon'], round: 0.05 },
  { stat: 'attackSpeed', min: [0.03, 0.05], max: [0.08, 0.15], slots: ['gloves', 'ring', 'weapon'], round: 0.01 },
  { stat: 'arcaneDamage', min: [0.04, 0.08], max: [0.12, 0.25], slots: ['weapon', 'amulet', 'head'], round: 0.01, classes: ['sorcerer'] },
  { stat: 'fireDamage', min: [0.04, 0.08], max: [0.12, 0.25], slots: ['weapon', 'amulet', 'ring'], round: 0.01, classes: ['sorcerer'] },
  { stat: 'frostDamage', min: [0.04, 0.08], max: [0.12, 0.25], slots: ['weapon', 'amulet', 'ring'], round: 0.01, classes: ['sorcerer'] },
  { stat: 'moveSpeed', min: [0.04, 0.06], max: [0.08, 0.14], slots: ['boots'], round: 0.01 },
  { stat: 'energyRegen', min: [0.5, 1], max: [1.5, 3], slots: ['head', 'chest', 'amulet'], round: 0.1 },
  { stat: 'physicalDamage', min: [0.04, 0.08], max: [0.12, 0.25], slots: ['weapon', 'amulet', 'ring', 'gloves'], round: 0.01, classes: ['knight', 'hunter', 'reaver'] },
  { stat: 'energyOnHit', min: [1, 2], max: [2, 5], slots: ['weapon', 'gloves', 'ring'], round: 1 },
  { stat: 'cooldown', min: [0.03, 0.05], max: [0.06, 0.12], slots: ['head', 'chest', 'amulet'], round: 0.01 },
];

export const BASE_NAMES: Record<Slot, string[]> = {
  weapon: ['Ashwood Staff', 'Bone Rod', 'Sexton\'s Crook', 'Vessel Staff', 'Cinder Stave'],
  head: ['Cowl', 'Hood', 'Circlet', 'Crown of Thorns', 'Mourner\'s Veil'],
  chest: ['Robe', 'Shroud', 'Vestment', 'Cassock', 'Grave Cloak'],
  gloves: ['Gloves', 'Wraps', 'Gauntlets', 'Claws'],
  boots: ['Boots', 'Sandals', 'Treads', 'Greaves'],
  amulet: ['Amulet', 'Reliquary', 'Locket', 'Talisman'],
  ring: ['Ring', 'Band', 'Loop', 'Seal'],
};
/** Weapon base names per class; the shared BASE_NAMES.weapon list is the Sorcerer's. */
export const WEAPON_NAMES: Record<ClassId, string[]> = {
  sorcerer: ['Ashwood Staff', 'Bone Rod', 'Sexton\'s Crook', 'Vessel Staff', 'Cinder Stave'],
  knight: ['Grave-Iron Sword', 'Warden\'s Blade', 'Sepulcher Edge', 'Coffin-Nail Sword', 'Pallbearer'],
  hunter: ['Yew Crossbow', 'Sexton\'s Arbalest', 'Bone Latch', 'Widow\'s Bow', 'Rookery Crossbow'],
  reaver: ['Cleaver Axe', 'Ossuary Axe', 'Gravedigger', 'Red Moon Axe', 'Butcher\'s Great Axe'],
};
export const WEAPON_LABEL: Record<ClassId, string> = { sorcerer: 'Staff', knight: 'Sword', hunter: 'Crossbow', reaver: 'Great axe' };
export const PREFIXES = ['Sexton\'s', 'Choirmaster\'s', 'Hollow', 'Pale', 'Ashen', 'Wraithbound', 'Saint\'s', 'Grave', 'Vesper', 'Cinder'];
export const SUFFIXES = ['of Embers', 'of the Nave', 'of the Long Night', 'of Frost', 'of the Warden', 'of Hollowmere', 'of the Fold', 'of Bone', 'of the Rift', 'of Sorrow'];

/** Legendary items: fixed name, slot, and a rule-changing power the ability code reads. */
export const LEGENDARIES: { name: string; slot: Slot; power: PowerId; text: string; classId: ClassId }[] = [
  { name: 'Starfall Circlet', slot: 'head', power: 'starfall', text: 'Astral Orb splits into three smaller orbs after piercing four enemies.', classId: 'sorcerer' },
  { name: 'Ashen Grimoire', slot: 'amulet', power: 'ashen', text: 'Flame Nova leaves burning ground for 6 seconds.', classId: 'sorcerer' },
  { name: 'Boots of the Fold', slot: 'boots', power: 'fold', text: 'Rift Step gains an additional charge.', classId: 'sorcerer' },
  { name: 'Hollow Crown', slot: 'weapon', power: 'hollowCrown', text: 'Arcane Bolt chains to a second enemy on hit.', classId: 'sorcerer' },
  { name: 'Cinder Band', slot: 'ring', power: 'cinderBand', text: 'Burning enemies explode when they die.', classId: 'sorcerer' },
  { name: 'Iron Tide', slot: 'chest', power: 'ironTide', text: 'The third Cleave of every chain heals you for 4 % of your health per enemy hit.', classId: 'knight' },
  { name: 'Gravebind Gauntlets', slot: 'gloves', power: 'gravebind', text: 'Bulwark holds the dead for twice as long and deals triple damage.', classId: 'knight' },
  { name: 'Twin String', slot: 'weapon', power: 'twinString', text: 'Bolt Shot fires two quarrels.', classId: 'hunter' },
  { name: 'Thorn Crown', slot: 'head', power: 'thornCrown', text: 'Caltrops last twice as long and bleed twice as hard.', classId: 'hunter' },
  { name: 'Red Harvest', slot: 'weapon', power: 'redHarvest', text: 'Rend\'s bleed is doubled and Bleed Storm refunds its cooldown on a kill.', classId: 'reaver' },
  { name: 'Iron Lung', slot: 'amulet', power: 'ironLung', text: 'Frenzy lasts ten seconds and its cooldown is halved.', classId: 'reaver' },
];
