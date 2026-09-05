export type AbilityId =
  | 'bolt' | 'orb' | 'rift' | 'nova' | 'frost' | 'cataclysm'
  | 'cleave' | 'judgement' | 'shieldRush' | 'ironWard' | 'graveStomp' | 'bulwark'
  | 'boltShot' | 'fanOfBolts' | 'vault' | 'caltrops' | 'mark' | 'rainOfBolts'
  | 'rend' | 'whirl' | 'leap' | 'frenzy' | 'bleedStorm' | 'harvest';
export type ClassId = 'sorcerer' | 'knight' | 'hunter' | 'reaver';
export type Element = 'arcane' | 'fire' | 'frost' | 'physical' | 'bleed';
export type AbilityKind = 'generator' | 'spender' | 'cooldown' | 'utility' | 'ultimate';

export interface AbilityDef {
  id: AbilityId;
  classId: ClassId;
  name: string;
  slot: number;            // 0..5 on the bar
  keyLabel: string;        // shown under the slot
  kind: AbilityKind;
  unlockLevel: number;
  cost: number;            // arcane energy
  cooldown: number;        // seconds
  castInterval: number;    // seconds between repeats when held (generator)
  range: number;           // metres
  radius: number;          // AoE / projectile radius
  speed: number;           // projectile speed m/s
  damage: { base: number; element: Element };
  energyOnHit: number;
  knockback: number;       // m/s impulse
  homing: number;          // 0..1 curve strength toward soft target
  anim: string;            // player clip
  animLock: number;        // seconds the cast holds the player (0 = none)
  description: string;
  /** Melee arc in degrees (0 = not a melee swing). */
  arc?: number;
  /** Channelled: cost is paid per `castInterval` while held. */
  channel?: boolean;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  bolt: {
    id: 'bolt', classId: 'sorcerer', name: 'Arcane Bolt', slot: 0, keyLabel: 'LMB', kind: 'generator', unlockLevel: 1,
    cost: 0, cooldown: 0, castInterval: 0.3, range: 32, radius: 0.35, speed: 34,
    damage: { base: 26, element: 'arcane' }, energyOnHit: 7, knockback: 1.5, homing: 0.18,
    anim: 'Spellcast_Shoot', animLock: 0,
    description: 'Rapid arcane lance. Generates Arcane Energy on hit.',
  },
  orb: {
    id: 'orb', classId: 'sorcerer', name: 'Astral Orb', slot: 1, keyLabel: 'RMB', kind: 'spender', unlockLevel: 2,
    cost: 40, cooldown: 0.4, castInterval: 0.5, range: 22, radius: 0.9, speed: 10,
    damage: { base: 150, element: 'arcane' }, energyOnHit: 0, knockback: 6, homing: 0.05,
    anim: 'Spellcast_Long', animLock: 0.25,
    description: 'A slow, enormous orb that pierces everything and detonates at range.',
  },
  rift: {
    id: 'rift', classId: 'sorcerer', name: 'Rift Step', slot: 2, keyLabel: '1', kind: 'utility', unlockLevel: 3,
    cost: 0, cooldown: 6, castInterval: 0, range: 8, radius: 0, speed: 0,
    damage: { base: 0, element: 'arcane' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Dodge_Forward', animLock: 0,
    description: 'Teleport 8 m in the aiming direction. Briefly invulnerable.',
  },
  nova: {
    id: 'nova', classId: 'sorcerer', name: 'Flame Nova', slot: 3, keyLabel: '2', kind: 'cooldown', unlockLevel: 4,
    cost: 0, cooldown: 10, castInterval: 0, range: 0, radius: 4.2, speed: 0,
    damage: { base: 120, element: 'fire' }, energyOnHit: 0, knockback: 15, homing: 0,
    anim: 'Spellcast_Raise', animLock: 0.3,
    description: 'Radial burst of fire. Throws enemies back and sets them burning.',
  },
  frost: {
    id: 'frost', classId: 'sorcerer', name: 'Frost Field', slot: 4, keyLabel: '3', kind: 'cooldown', unlockLevel: 6,
    cost: 0, cooldown: 14, castInterval: 0, range: 18, radius: 4.5, speed: 0,
    damage: { base: 8, element: 'frost' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Spellcast_Raise', animLock: 0.3,
    description: 'Ground field that chills, then freezes weaker enemies. (Milestone 4)',
  },
  cataclysm: {
    id: 'cataclysm', classId: 'sorcerer', name: 'Cataclysm', slot: 5, keyLabel: '4', kind: 'ultimate', unlockLevel: 10,
    cost: 0, cooldown: 60, castInterval: 0, range: 20, radius: 7, speed: 0,
    damage: { base: 90, element: 'arcane' }, energyOnHit: 0, knockback: 6, homing: 0,
    anim: 'Spellcast_Long', animLock: 0.5,
    description: 'A storm of arcane strikes over the target area. (Milestone 4)',
  },
  // ---------------------------------------------------------------- Sepulcher Knight (Fury)
  cleave: {
    id: 'cleave', classId: 'knight', name: 'Cleave', slot: 0, keyLabel: 'LMB', kind: 'generator', unlockLevel: 1,
    cost: 0, cooldown: 0, castInterval: 0.42, range: 2.8, radius: 0, speed: 0,
    damage: { base: 34, element: 'physical' }, energyOnHit: 8, knockback: 2, homing: 0, arc: 120,
    anim: '1H_Melee_Attack_Slice_Horizontal', animLock: 0.12,
    description: 'A wide sword arc. Every third swing throws the pack back. Builds Fury on hit.',
  },
  judgement: {
    id: 'judgement', classId: 'knight', name: 'Judgement', slot: 1, keyLabel: 'RMB', kind: 'spender', unlockLevel: 2,
    cost: 60, cooldown: 0.6, castInterval: 0.6, range: 8, radius: 4, speed: 0,
    damage: { base: 210, element: 'physical' }, energyOnHit: 0, knockback: 7, homing: 0,
    anim: '2H_Melee_Attack_Chop', animLock: 0.35,
    description: 'Leap at the target and bring the sword down. Everything in four metres is staggered.',
  },
  shieldRush: {
    id: 'shieldRush', classId: 'knight', name: 'Shield Rush', slot: 2, keyLabel: '1', kind: 'cooldown', unlockLevel: 3,
    cost: 0, cooldown: 8, castInterval: 0, range: 9, radius: 1.6, speed: 22,
    damage: { base: 60, element: 'physical' }, energyOnHit: 6, knockback: 9, homing: 0,
    anim: 'Block_Attack', animLock: 0.1,
    description: 'Charge nine metres behind the shield. Everything in the lane is knocked down.',
  },
  ironWard: {
    id: 'ironWard', classId: 'knight', name: 'Iron Ward', slot: 3, keyLabel: '2', kind: 'cooldown', unlockLevel: 4,
    cost: 0, cooldown: 14, castInterval: 0, range: 0, radius: 6, speed: 0,
    damage: { base: 0, element: 'physical' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Block', animLock: 0.2,
    description: 'A ward that absorbs a third of your health for six seconds and taunts the pack.',
  },
  graveStomp: {
    id: 'graveStomp', classId: 'knight', name: 'Grave Stomp', slot: 4, keyLabel: '3', kind: 'cooldown', unlockLevel: 6,
    cost: 0, cooldown: 10, castInterval: 0, range: 0, radius: 5, speed: 0,
    damage: { base: 80, element: 'physical' }, energyOnHit: 5, knockback: 3, homing: 0,
    anim: 'Unarmed_Melee_Attack_Kick', animLock: 0.25,
    description: 'Stamp the ground. Five metres of staggered, slowed dead.',
  },
  bulwark: {
    id: 'bulwark', classId: 'knight', name: 'Bulwark', slot: 5, keyLabel: '4', kind: 'ultimate', unlockLevel: 10,
    cost: 0, cooldown: 25, castInterval: 0, range: 0, radius: 10, speed: 0,
    damage: { base: 40, element: 'physical' }, energyOnHit: 4, knockback: 0, homing: 0,
    anim: 'Spellcast_Raise', animLock: 0.4,
    description: 'Chains drag everything within ten metres to your feet and hold it there for two seconds.',
  },
  // ---------------------------------------------------------------- Grave Hunter (Focus)
  boltShot: {
    id: 'boltShot', classId: 'hunter', name: 'Bolt Shot', slot: 0, keyLabel: 'LMB', kind: 'generator', unlockLevel: 1,
    cost: 0, cooldown: 0, castInterval: 0.34, range: 34, radius: 0.3, speed: 44,
    damage: { base: 30, element: 'physical' }, energyOnHit: 6, knockback: 1, homing: 0.12,
    anim: 'Spellcast_Shoot', animLock: 0,
    description: 'A fast crossbow bolt that pierces one body. Builds Focus on hit.',
  },
  fanOfBolts: {
    id: 'fanOfBolts', classId: 'hunter', name: 'Fan of Bolts', slot: 1, keyLabel: 'RMB', kind: 'spender', unlockLevel: 2,
    cost: 40, cooldown: 0.5, castInterval: 0.55, range: 16, radius: 0.3, speed: 40,
    damage: { base: 22, element: 'physical' }, energyOnHit: 0, knockback: 2.5, homing: 0, arc: 60,
    anim: 'Spellcast_Long', animLock: 0.2,
    description: 'Seven bolts in a sixty-degree fan.',
  },
  vault: {
    id: 'vault', classId: 'hunter', name: 'Vault', slot: 2, keyLabel: '1', kind: 'utility', unlockLevel: 3,
    cost: 0, cooldown: 6, castInterval: 0, range: 6, radius: 0, speed: 0,
    damage: { base: 0, element: 'physical' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Dodge_Backward', animLock: 0.3,
    description: 'Backflip six metres away from the aim point. Untouchable for half a second.',
  },
  caltrops: {
    id: 'caltrops', classId: 'hunter', name: 'Caltrops', slot: 3, keyLabel: '2', kind: 'cooldown', unlockLevel: 4,
    cost: 0, cooldown: 12, castInterval: 0, range: 10, radius: 4, speed: 0,
    damage: { base: 14, element: 'bleed' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Use_Item', animLock: 0.2,
    description: 'A field of iron thorns for four seconds. Everything inside is slowed and bleeds.',
  },
  mark: {
    id: 'mark', classId: 'hunter', name: 'Mark', slot: 4, keyLabel: '3', kind: 'cooldown', unlockLevel: 6,
    cost: 0, cooldown: 15, castInterval: 0, range: 30, radius: 0, speed: 0,
    damage: { base: 0, element: 'physical' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Spellcast_Raise', animLock: 0.15,
    description: 'The target takes thirty percent more damage for eight seconds and drops a globe when it dies.',
  },
  rainOfBolts: {
    id: 'rainOfBolts', classId: 'hunter', name: 'Rain of Bolts', slot: 5, keyLabel: '4', kind: 'ultimate', unlockLevel: 10,
    cost: 0, cooldown: 30, castInterval: 0, range: 20, radius: 6, speed: 0,
    damage: { base: 45, element: 'physical' }, energyOnHit: 0, knockback: 1, homing: 0,
    anim: 'Spellcast_Long', animLock: 0.5,
    description: 'Three seconds of falling bolts across six metres.',
  },
  // ---------------------------------------------------------------- Pale Reaver (Blood)
  rend: {
    id: 'rend', classId: 'reaver', name: 'Rend', slot: 0, keyLabel: 'LMB', kind: 'generator', unlockLevel: 1,
    cost: 0, cooldown: 0, castInterval: 0.46, range: 3, radius: 0, speed: 0,
    damage: { base: 40, element: 'physical' }, energyOnHit: 3, knockback: 2.5, homing: 0, arc: 150,
    anim: '2H_Melee_Attack_Slice', animLock: 0.12,
    description: 'A wide axe swing that opens a bleed. Builds Blood on hit, more on the kill.',
  },
  whirl: {
    id: 'whirl', classId: 'reaver', name: 'Whirl', slot: 1, keyLabel: 'RMB', kind: 'spender', unlockLevel: 2,
    cost: 8, cooldown: 0, castInterval: 0.25, range: 0, radius: 3, speed: 0,
    damage: { base: 24, element: 'physical' }, energyOnHit: 0, knockback: 1.5, homing: 0, channel: true,
    anim: '2H_Melee_Attack_Spinning', animLock: 0,
    description: 'Spin while held. Moves at seventy percent speed and hits everything within three metres.',
  },
  leap: {
    id: 'leap', classId: 'reaver', name: 'Leap', slot: 2, keyLabel: '1', kind: 'cooldown', unlockLevel: 3,
    cost: 0, cooldown: 9, castInterval: 0, range: 10, radius: 3.5, speed: 0,
    damage: { base: 110, element: 'physical' }, energyOnHit: 4, knockback: 6, homing: 0,
    anim: 'Jump_Full_Long', animLock: 0.45,
    description: 'Jump to the aim point and land on everything within three and a half metres.',
  },
  frenzy: {
    id: 'frenzy', classId: 'reaver', name: 'Frenzy', slot: 3, keyLabel: '2', kind: 'cooldown', unlockLevel: 4,
    cost: 0, cooldown: 20, castInterval: 0, range: 0, radius: 0, speed: 0,
    damage: { base: 0, element: 'physical' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Spellcast_Raise', animLock: 0.2,
    description: 'Forty percent more attack and move speed for six seconds. Costs nothing at full Blood.',
  },
  bleedStorm: {
    id: 'bleedStorm', classId: 'reaver', name: 'Bleed Storm', slot: 4, keyLabel: '3', kind: 'cooldown', unlockLevel: 6,
    cost: 0, cooldown: 14, castInterval: 0, range: 0, radius: 8, speed: 0,
    damage: { base: 0, element: 'bleed' }, energyOnHit: 2, knockback: 0, homing: 0,
    anim: '2H_Melee_Attack_Spin', animLock: 0.3,
    description: 'Every bleeding enemy within eight metres takes the rest of its bleed at once.',
  },
  harvest: {
    id: 'harvest', classId: 'reaver', name: 'Harvest', slot: 5, keyLabel: '4', kind: 'ultimate', unlockLevel: 10,
    cost: 0, cooldown: 30, castInterval: 0, range: 0, radius: 0, speed: 0,
    damage: { base: 0, element: 'physical' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Spellcast_Long', animLock: 0.4,
    description: 'For eight seconds every kill heals eight percent and refunds Blood.',
  },
};

export const ABILITY_ORDER: AbilityId[] = Object.keys(ABILITIES) as AbilityId[];
/** Bar slot → input key, shared by every class. */
export const SLOT_KEYS = ['Mouse0', 'Mouse2', 'Digit1', 'Digit2', 'Digit3', 'Digit4'];
