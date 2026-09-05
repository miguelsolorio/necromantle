import type { AbilityId } from './abilities';
import type { AssetId } from '@/assets/registry';

export const PLAYER = {
  model: 'char.sorcerer' as AssetId,
  weapon: 'char.staff' as AssetId,
  height: 1.9,
  radius: 0.42,
  walkSpeed: 3.0,
  jogSpeed: 5.8,
  sprintSpeed: 8.4,
  strafeSpeed: 4.6,
  accel: 34,
  decel: 42,
  turnRate: 14,           // rad/s toward move direction
  combatStance: 1.6,      // seconds after last cast that the player keeps facing the camera
  gravity: 24,
  base: { vitality: 60, power: 20, intelligence: 40, armor: 60, critChance: 0.1, critDamage: 2.0, attackSpeed: 1.0 },
  perLevel: { vitality: 8, power: 2, intelligence: 5, armor: 10 },
  hpPerVitality: 6,
  energyMax: 100,
  energyRegen: 2.5,       // per second
  potionHeal: 0.4,        // fraction of max
  potionCooldown: 20,
} as const;

/** XP needed to reach level n+1 from level n (index = level). */
export const XP_TABLE = [0, 60, 130, 230, 360, 540, 780, 1100, 1500, 2000, 2700];

export const UNLOCKS: Record<number, AbilityId | 'passive'> = { 1: 'bolt', 2: 'orb', 3: 'rift', 4: 'nova', 5: 'passive', 6: 'frost', 8: 'passive', 10: 'cataclysm' };

export const CAMERA = {
  exploreDistance: 6.5,
  combatDistance: 8.8,
  exploreFov: 60,
  combatFov: 68,
  shoulder: 0.9,
  pivotHeight: 1.45,
  minPitch: -0.15,
  maxPitch: 1.15,
  defaultPitch: 0.34,
  sensitivity: 0.0021,
  /** Radians per CSS pixel of touch drag (scaled by the look setting); a thumb covers far fewer pixels than a mouse. */
  touchSensitivity: 0.0052,
  collisionPad: 0.35,
} as const;
