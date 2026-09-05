import type { AssetId } from '@/assets/registry';
import type { AbilityId } from './abilities';

/**
 * Playable class definition (see docs/character-plan.md). The Sorcerer is the only entry today; the player,
 * ability runtime and HUD read everything class-specific from here so a second class is data plus ability modules.
 */
export interface ClassDef {
  id: string;
  name: string;
  model: AssetId;
  height: number;
  /** Mesh names in the model to hide (packs ship with several weapons). */
  hideMeshes: string[];
  /** Mesh name that carries the weapon tip (crystal, blade point). */
  weaponMesh: string;
  resource: { name: string; max: number; regen: number; start: number; hudClass: 'energy' | 'fury' | 'focus' | 'blood' };
  abilities: AbilityId[];
  anims: { idle: string; run: string; strafeL: string; strafeR: string; back: string; hit: string; death: string };
  accent: string;
}

export const CLASSES: Record<string, ClassDef> = {
  sorcerer: {
    id: 'sorcerer', name: 'Arcane Sorcerer', model: 'char.sorcerer', height: 1.9,
    hideMeshes: ['1H_Wand', 'Spellbook_open'], weaponMesh: '2H_Staff',
    resource: { name: 'Arcane Energy', max: 100, regen: 2.5, start: 40, hudClass: 'energy' },
    abilities: ['bolt', 'orb', 'rift', 'nova', 'frost', 'cataclysm'],
    anims: { idle: 'Idle', run: 'Running_A', strafeL: 'Running_Strafe_Left', strafeR: 'Running_Strafe_Right', back: 'Walking_Backwards', hit: 'Hit_A', death: 'Death_A' },
    accent: '#8B5CF6',
  },
};
