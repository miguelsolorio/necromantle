export type AbilityId = 'bolt' | 'orb' | 'rift' | 'nova' | 'frost' | 'cataclysm';
export type Element = 'arcane' | 'fire' | 'frost';
export type AbilityKind = 'generator' | 'spender' | 'cooldown' | 'utility' | 'ultimate';

export interface AbilityDef {
  id: AbilityId;
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
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  bolt: {
    id: 'bolt', name: 'Arcane Bolt', slot: 0, keyLabel: 'LMB', kind: 'generator', unlockLevel: 1,
    cost: 0, cooldown: 0, castInterval: 0.3, range: 32, radius: 0.35, speed: 34,
    damage: { base: 26, element: 'arcane' }, energyOnHit: 7, knockback: 1.5, homing: 0.18,
    anim: 'Spellcast_Shoot', animLock: 0,
    description: 'Rapid arcane lance. Generates Arcane Energy on hit.',
  },
  orb: {
    id: 'orb', name: 'Astral Orb', slot: 1, keyLabel: 'RMB', kind: 'spender', unlockLevel: 2,
    cost: 40, cooldown: 0.4, castInterval: 0.5, range: 22, radius: 0.9, speed: 10,
    damage: { base: 150, element: 'arcane' }, energyOnHit: 0, knockback: 6, homing: 0.05,
    anim: 'Spellcast_Long', animLock: 0.25,
    description: 'A slow, enormous orb that pierces everything and detonates at range.',
  },
  rift: {
    id: 'rift', name: 'Rift Step', slot: 2, keyLabel: '1', kind: 'utility', unlockLevel: 3,
    cost: 0, cooldown: 6, castInterval: 0, range: 8, radius: 0, speed: 0,
    damage: { base: 0, element: 'arcane' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Dodge_Forward', animLock: 0,
    description: 'Teleport 8 m in the aiming direction. Briefly invulnerable.',
  },
  nova: {
    id: 'nova', name: 'Flame Nova', slot: 3, keyLabel: '2', kind: 'cooldown', unlockLevel: 4,
    cost: 0, cooldown: 10, castInterval: 0, range: 0, radius: 4.2, speed: 0,
    damage: { base: 120, element: 'fire' }, energyOnHit: 0, knockback: 15, homing: 0,
    anim: 'Spellcast_Raise', animLock: 0.3,
    description: 'Radial burst of fire. Throws enemies back and sets them burning.',
  },
  frost: {
    id: 'frost', name: 'Frost Field', slot: 4, keyLabel: '3', kind: 'cooldown', unlockLevel: 6,
    cost: 0, cooldown: 14, castInterval: 0, range: 18, radius: 4.5, speed: 0,
    damage: { base: 18, element: 'frost' }, energyOnHit: 0, knockback: 0, homing: 0,
    anim: 'Spellcast_Raise', animLock: 0.3,
    description: 'Ground field that chills, then freezes weaker enemies. (Milestone 4)',
  },
  cataclysm: {
    id: 'cataclysm', name: 'Cataclysm', slot: 5, keyLabel: '4', kind: 'ultimate', unlockLevel: 10,
    cost: 0, cooldown: 60, castInterval: 0, range: 20, radius: 7, speed: 0,
    damage: { base: 90, element: 'arcane' }, energyOnHit: 0, knockback: 6, homing: 0,
    anim: 'Spellcast_Long', animLock: 0.5,
    description: 'A storm of arcane strikes over the target area. (Milestone 4)',
  },
};

export const ABILITY_ORDER: AbilityId[] = ['bolt', 'orb', 'rift', 'nova', 'frost', 'cataclysm'];
