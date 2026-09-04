import type { AssetId } from '@/assets/registry';
export type EnemyId = 'ghoul' | 'fallen_knight' | 'cultist' | 'wraith';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  model: AssetId;           // asset registry id
  height: number;           // design height in metres (model is scaled to this)
  radius: number;           // capsule radius
  hp: number;
  speed: number;            // m/s
  accel: number;
  turnRate: number;         // rad/s
  mass: number;             // knockback divisor
  damage: number;
  attack: { range: number; windup: number; recovery: number; cooldown: number; anim: string; ranged?: { speed: number; preferredRange: number; radius: number } };
  xp: number;
  anims: { idle: string; run: string; hit: string; death: string[]; spawn: string };
  eye: string;              // hex
  tint: [number, number, number];
  globeChance: number;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  ghoul: {
    id: 'ghoul', name: 'Ghoul', model: 'enemy.ghoul', height: 1.75, radius: 0.42,
    hp: 95, speed: 5.6, accel: 22, turnRate: 9, mass: 1, damage: 9,
    attack: { range: 1.5, windup: 0.32, recovery: 0.4, cooldown: 0.9, anim: 'Unarmed_Melee_Attack_Punch_A' },
    xp: 12,
    anims: { idle: 'Idle_Combat', run: 'Running_C', hit: 'Hit_A', death: ['Death_A', 'Death_B'], spawn: 'Skeletons_Awaken_Floor' },
    eye: '#FF5A3C', tint: [0.2, 0.17, 0.18], globeChance: 0.12,
  },
  fallen_knight: {
    id: 'fallen_knight', name: 'Fallen Knight', model: 'enemy.fallen_knight', height: 2.25, radius: 0.55,
    hp: 420, speed: 2.9, accel: 10, turnRate: 4, mass: 3.2, damage: 28,
    attack: { range: 2.1, windup: 0.55, recovery: 0.6, cooldown: 1.6, anim: '2H_Melee_Attack_Chop' },
    xp: 40,
    anims: { idle: 'Idle_Combat', run: 'Walking_D_Skeletons', hit: 'Hit_B', death: ['Death_A'], spawn: 'Spawn_Ground_Skeletons' },
    eye: '#FF7A1A', tint: [0.17, 0.17, 0.22], globeChance: 0.35,
  },
  cultist: {
    id: 'cultist', name: 'Cultist', model: 'enemy.cultist', height: 1.95, radius: 0.42,
    hp: 120, speed: 3.4, accel: 14, turnRate: 6, mass: 1.2, damage: 14,
    attack: { range: 16, windup: 0.6, recovery: 0.5, cooldown: 2.2, anim: 'Spellcast_Shoot', ranged: { speed: 12, preferredRange: 11, radius: 0.35 } },
    xp: 22,
    anims: { idle: 'Idle_Combat', run: 'Running_A', hit: 'Hit_A', death: ['Death_B'], spawn: 'Spawn_Ground_Skeletons' },
    eye: '#7ED957', tint: [0.16, 0.2, 0.16], globeChance: 0.18,
  },
  wraith: {
    id: 'wraith', name: 'Wraith', model: 'enemy.wraith', height: 1.9, radius: 0.4,
    hp: 140, speed: 6.8, accel: 30, turnRate: 12, mass: 0.7, damage: 12,
    attack: { range: 1.6, windup: 0.25, recovery: 0.3, cooldown: 1.1, anim: '1H_Melee_Attack_Slice_Diagonal' },
    xp: 26,
    anims: { idle: 'Idle_Combat', run: 'Running_B', hit: 'Hit_A', death: ['Death_B'], spawn: 'Spawn_Air' },
    eye: '#9CF1FF', tint: [0.22, 0.27, 0.4], globeChance: 0.15,
  },
};
