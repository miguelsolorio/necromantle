export type PassiveId = 'momentum' | 'glassStar' | 'frozenHeart' | 'chainReaction' | 'emberVeil' | 'deepWell';

export interface PassiveDef { id: PassiveId; name: string; text: string; icon: string }

/** Passives change how you play, not just a percentage. Two slots: level 5 and level 8. */
export const PASSIVES: Record<PassiveId, PassiveDef> = {
  momentum: { id: 'momentum', name: 'Arcane Momentum', text: 'Generating Arcane Energy grants 30% movement speed for 3 seconds.', icon: '<svg viewBox="0 0 40 40"><path d="M6 30 L22 8 L20 20 L34 10 L18 32 L20 22z" fill="currentColor"/></svg>' },
  glassStar: { id: 'glassStar', name: 'Glass Star', text: 'Spell damage +30%. Maximum health -25%.', icon: '<svg viewBox="0 0 40 40"><path d="M20 3 L24 16 L37 20 L24 24 L20 37 L16 24 L3 20 L16 16z" fill="currentColor"/></svg>' },
  frozenHeart: { id: 'frozenHeart', name: 'Frozen Heart', text: 'Frozen enemies take 60% more damage and stay frozen a second longer.', icon: '<svg viewBox="0 0 40 40"><path d="M20 36 C6 26 4 14 12 10 C16 8 19 11 20 14 C21 11 24 8 28 10 C36 14 34 26 20 36z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 14v20M12 22h16" stroke="currentColor" stroke-width="2"/></svg>' },
  chainReaction: { id: 'chainReaction', name: 'Chain Reaction', text: 'Killing a burning enemy causes a fiery explosion.', icon: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="6" fill="currentColor"/><path d="M20 4v8M20 28v8M4 20h8M28 20h8M9 9l5 5M26 26l5 5M31 9l-5 5M14 26l-5 5" stroke="currentColor" stroke-width="3"/></svg>' },
  emberVeil: { id: 'emberVeil', name: 'Ember Veil', text: 'Flame Nova cooldown -35%. Burning lasts 2 seconds longer.', icon: '<svg viewBox="0 0 40 40"><path d="M20 4 C28 12 30 18 26 24 C30 20 32 26 26 34 C22 36 12 34 12 26 C12 20 18 16 16 10 C20 12 22 8 20 4z" fill="currentColor"/></svg>' },
  deepWell: { id: 'deepWell', name: 'Deep Well', text: 'Maximum Arcane Energy +40 and +1.5 regeneration per second.', icon: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 22 Q14 16 20 22 T32 22" fill="none" stroke="currentColor" stroke-width="3"/></svg>' },
};
export const PASSIVE_ORDER: PassiveId[] = ['momentum', 'glassStar', 'frozenHeart', 'chainReaction', 'emberVeil', 'deepWell'];

/** Ability improvements granted on the levels between unlocks, so most level-ups change something you feel. */
export const IMPROVEMENTS: { level: number; title: string; text: string }[] = [
  { level: 5, title: 'Passive slot', text: 'Choose a passive in the inventory (I).' },
  { level: 7, title: 'Twin Bolt', text: 'Arcane Bolt fires two lances.' },
  { level: 8, title: 'Second passive slot', text: 'Choose another passive in the inventory (I).' },
  { level: 9, title: 'Greater Orb', text: 'Astral Orb detonates in a much larger blast.' },
];
export const passiveSlots = (level: number): number => (level >= 8 ? 2 : level >= 5 ? 1 : 0);
