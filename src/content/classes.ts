import type { AssetId } from '@/assets/registry';
import type { AbilityId, ClassId } from './abilities';

/**
 * Playable class definitions (docs/character-plan.md). The player, ability runtime, HUD, title screen and
 * save slots read everything class-specific from here, so a class is data plus its ability modules.
 */
export interface ClassDef {
  id: ClassId;
  name: string;
  /** One line of fantasy for the select screen. */
  blurb: string;
  playable: boolean;
  model: AssetId;
  height: number;
  /** Mesh names in the model to hide (packs ship with several weapons). */
  hideMeshes: string[];
  /** Mesh name that carries the weapon tip (crystal, blade point). */
  weaponMesh: string;
  weaponLabel: string;
  resource: {
    name: string; max: number; regen: number; start: number; hudClass: 'energy' | 'fury' | 'focus' | 'blood';
    /** Out-of-combat decay per second (Fury, Blood). */
    decay: number;
    /** Per-kill gain (Focus, Blood). */
    onKill: number;
    /** Gain per hit taken (Fury). */
    onHurt: number;
    /** Fills while standing still (Focus). */
    stillRegen: number;
    desc: string;
  };
  abilities: AbilityId[];
  anims: { idle: string; run: string; strafeL: string; strafeR: string; back: string; hit: string; death: string };
  /** Attack chain clips for melee generators (cycled per swing). */
  chain: string[];
  accent: string;
  /** Combat camera pulls back further for melee. */
  melee: boolean;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  sorcerer: {
    id: 'sorcerer', name: 'Arcane Sorcerer', playable: true,
    blurb: 'A scholar of the rift who fights at range, folds space, and freezes what gets close.',
    model: 'char.sorcerer', height: 1.9,
    hideMeshes: ['1H_Wand', 'Spellbook_open'], weaponMesh: '2H_Staff', weaponLabel: 'Staff',
    resource: { name: 'Arcane Energy', max: 100, regen: 2.5, start: 40, hudClass: 'energy', decay: 0, onKill: 0, onHurt: 0, stillRegen: 0, desc: 'Regenerates slowly. Arcane Bolt builds it on hit; Astral Orb spends it.' },
    abilities: ['bolt', 'orb', 'rift', 'nova', 'frost', 'cataclysm'],
    anims: { idle: 'Idle', run: 'Running_A', strafeL: 'Running_Strafe_Left', strafeR: 'Running_Strafe_Right', back: 'Walking_Backwards', hit: 'Hit_A', death: 'Death_A' },
    chain: [], accent: '#8B5CF6', melee: false,
  },
  knight: {
    id: 'knight', name: 'Sepulcher Knight', playable: true,
    blurb: 'A tomb warden in grave-iron who stands in the pack and throws it back.',
    model: 'char.knight', height: 1.95,
    hideMeshes: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'], weaponMesh: '1H_Sword', weaponLabel: 'Sword and shield',
    resource: { name: 'Fury', max: 100, regen: 0, start: 0, hudClass: 'fury', decay: 6, onKill: 0, onHurt: 12, stillRegen: 0, desc: 'Builds on every hit dealt or taken. Decays out of combat. Judgement spends it.' },
    abilities: ['cleave', 'judgement', 'shieldRush', 'ironWard', 'graveStomp', 'bulwark'],
    anims: { idle: 'Idle', run: 'Running_A', strafeL: 'Running_Strafe_Left', strafeR: 'Running_Strafe_Right', back: 'Walking_Backwards', hit: 'Hit_A', death: 'Death_A' },
    chain: ['1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop'], accent: '#6FA8DC', melee: true,
  },
  hunter: {
    id: 'hunter', name: 'Grave Hunter', playable: true,
    blurb: 'A hooded tracker with a crossbow who kills from the dark and is never where the pack lunges.',
    model: 'char.hunter', height: 1.85,
    hideMeshes: ['Knife_Offhand', '1H_Crossbow', 'Knife', 'Throwable'], weaponMesh: '2H_Crossbow', weaponLabel: 'Crossbow',
    resource: { name: 'Focus', max: 100, regen: 0, start: 30, hudClass: 'focus', decay: 0, onKill: 15, onHurt: 0, stillRegen: 10, desc: 'Fills while you stand still and on every kill. Fan of Bolts spends it.' },
    abilities: ['boltShot', 'fanOfBolts', 'vault', 'caltrops', 'mark', 'rainOfBolts'],
    anims: { idle: 'Idle', run: 'Running_A', strafeL: 'Running_Strafe_Left', strafeR: 'Running_Strafe_Right', back: 'Walking_Backwards', hit: 'Hit_A', death: 'Death_A' },
    chain: [], accent: '#7ED957', melee: false,
  },
  reaver: {
    id: 'reaver', name: 'Pale Reaver', playable: true,
    blurb: 'A bloodless berserker whose axe feeds on the kill and whose Frenzy feeds on the axe.',
    model: 'char.reaver', height: 2.0,
    hideMeshes: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug'], weaponMesh: '2H_Axe', weaponLabel: 'Great axe',
    resource: { name: 'Blood', max: 100, regen: 0, start: 0, hudClass: 'blood', decay: 4, onKill: 10, onHurt: 0, stillRegen: 0, desc: 'Gained on hits and kills, drains slowly. Whirl drinks it; Frenzy is free when it is full.' },
    abilities: ['rend', 'whirl', 'leap', 'frenzy', 'bleedStorm', 'harvest'],
    anims: { idle: 'Idle', run: 'Running_A', strafeL: 'Running_Strafe_Left', strafeR: 'Running_Strafe_Right', back: 'Walking_Backwards', hit: 'Hit_A', death: 'Death_A' },
    chain: ['2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop'], accent: '#C0392B', melee: true,
  },
};

export const CLASS_ORDER: ClassId[] = ['sorcerer', 'knight', 'hunter', 'reaver'];
