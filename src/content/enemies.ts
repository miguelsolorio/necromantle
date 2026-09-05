import type { AssetId } from '@/assets/registry';
export type EnemyId = 'ghoul' | 'fallen_knight' | 'cultist' | 'wraith' | 'brute' | 'necromancer' | 'hollow_king';
export type Behaviour = 'blink' | 'charge' | 'summoner' | 'boss';

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
  /** Special behaviour on top of the base melee/ranged loop. */
  behaviour?: Behaviour;
  behaviourCooldown?: number;
  /** Buff aura radius (necromancer): nearby allies move and hit harder. */
  aura?: { radius: number; speed: number; damage: number };
  eliteName: string;        // nameplate title when elite
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  ghoul: {
    id: 'ghoul', name: 'Ghoul', model: 'enemy.ghoul', height: 1.75, radius: 0.42,
    hp: 95, speed: 5.6, accel: 22, turnRate: 9, mass: 1, damage: 9,
    attack: { range: 1.5, windup: 0.32, recovery: 0.4, cooldown: 0.9, anim: 'Unarmed_Melee_Attack_Punch_A' },
    xp: 12,
    anims: { idle: 'Idle_Combat', run: 'Running_C', hit: 'Hit_A', death: ['Death_A', 'Death_B'], spawn: 'Skeletons_Awaken_Floor' },
    eye: '#FF5A3C', tint: [0.2, 0.17, 0.18], globeChance: 0.12, eliteName: 'Ghoul Warden',
  },
  fallen_knight: {
    id: 'fallen_knight', name: 'Fallen Knight', model: 'enemy.fallen_knight', height: 2.25, radius: 0.55,
    hp: 420, speed: 2.9, accel: 10, turnRate: 4, mass: 3.2, damage: 28,
    attack: { range: 2.1, windup: 0.55, recovery: 0.6, cooldown: 1.6, anim: '2H_Melee_Attack_Chop' },
    xp: 40,
    anims: { idle: 'Idle_Combat', run: 'Walking_D_Skeletons', hit: 'Hit_B', death: ['Death_A'], spawn: 'Spawn_Ground_Skeletons' },
    eye: '#FF7A1A', tint: [0.17, 0.17, 0.22], globeChance: 0.35, eliteName: 'Fallen Champion',
  },
  cultist: {
    id: 'cultist', name: 'Cultist', model: 'enemy.cultist', height: 1.95, radius: 0.42,
    hp: 120, speed: 3.4, accel: 14, turnRate: 6, mass: 1.2, damage: 14,
    attack: { range: 16, windup: 0.6, recovery: 0.5, cooldown: 2.2, anim: 'Spellcast_Shoot', ranged: { speed: 12, preferredRange: 11, radius: 0.35 } },
    xp: 22,
    anims: { idle: 'Idle_Combat', run: 'Running_A', hit: 'Hit_A', death: ['Death_B'], spawn: 'Spawn_Ground_Skeletons' },
    eye: '#7ED957', tint: [0.16, 0.2, 0.16], globeChance: 0.18, eliteName: 'Cult Hierophant',
  },
  wraith: {
    id: 'wraith', name: 'Wraith', model: 'enemy.wraith', height: 1.9, radius: 0.4,
    hp: 140, speed: 6.8, accel: 30, turnRate: 12, mass: 0.7, damage: 12,
    attack: { range: 1.6, windup: 0.25, recovery: 0.3, cooldown: 1.1, anim: '1H_Melee_Attack_Slice_Diagonal' },
    xp: 26,
    anims: { idle: 'Idle_Combat', run: 'Running_B', hit: 'Hit_A', death: ['Death_B'], spawn: 'Spawn_Air' },
    eye: '#9CF1FF', tint: [0.22, 0.27, 0.4], globeChance: 0.15, eliteName: 'Wraith Sovereign',
    behaviour: 'blink', behaviourCooldown: 4,
  },
  brute: {
    id: 'brute', name: 'Brute', model: 'enemy.fallen_knight', height: 3.0, radius: 0.8,
    hp: 900, speed: 2.4, accel: 8, turnRate: 3, mass: 6, damage: 42,
    attack: { range: 2.8, windup: 0.7, recovery: 0.8, cooldown: 2.2, anim: '2H_Melee_Attack_Spin' },
    xp: 110,
    anims: { idle: 'Idle_Combat', run: 'Walking_D_Skeletons', hit: 'Hit_B', death: ['Death_A'], spawn: 'Spawn_Ground_Skeletons' },
    eye: '#FF3A2A', tint: [0.22, 0.13, 0.12], globeChance: 0.7, eliteName: 'Ossuary Brute',
    behaviour: 'charge', behaviourCooldown: 6,
  },
  necromancer: {
    id: 'necromancer', name: 'Necromancer', model: 'enemy.cultist', height: 2.2, radius: 0.45,
    hp: 260, speed: 2.6, accel: 10, turnRate: 5, mass: 1.5, damage: 16,
    attack: { range: 18, windup: 0.7, recovery: 0.6, cooldown: 3.0, anim: 'Spellcast_Shoot', ranged: { speed: 11, preferredRange: 13, radius: 0.4 } },
    xp: 70,
    anims: { idle: 'Idle_Combat', run: 'Walking_A', hit: 'Hit_A', death: ['Death_B'], spawn: 'Spawn_Ground_Skeletons' },
    eye: '#B14DFF', tint: [0.2, 0.15, 0.28], globeChance: 0.4, eliteName: 'Grave Cantor',
    behaviour: 'summoner', behaviourCooldown: 9, aura: { radius: 9, speed: 1.25, damage: 1.3 },
  },
  hollow_king: {
    id: 'hollow_king', name: 'The Hollow King', model: 'enemy.fallen_knight', height: 3.6, radius: 0.95,
    hp: 2600, speed: 2.8, accel: 9, turnRate: 3.5, mass: 12, damage: 48,
    attack: { range: 3.4, windup: 0.8, recovery: 0.9, cooldown: 2.4, anim: '2H_Melee_Attack_Spin' },
    xp: 600,
    anims: { idle: 'Idle_Combat', run: 'Walking_D_Skeletons', hit: 'Hit_B', death: ['Death_A'], spawn: 'Skeletons_Awaken_Standing' },
    eye: '#FF3AB0', tint: [0.16, 0.1, 0.2], globeChance: 1, eliteName: 'The Hollow King',
    behaviour: 'boss', behaviourCooldown: 6, aura: { radius: 12, speed: 1.15, damage: 1.2 },
  },
};
