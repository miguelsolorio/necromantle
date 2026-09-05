export type EliteModId = 'scorched' | 'blink' | 'volley' | 'summoner' | 'pull' | 'chilling';

export interface EliteMod {
  id: EliteModId;
  label: string;          // nameplate affix line
  period: number;         // seconds between uses
  description: string;
}

/** Elite affixes: one per elite, chosen at spawn. Each creates an unusual situation, not just bigger numbers. */
export const ELITE_MODS: Record<EliteModId, EliteMod> = {
  scorched: { id: 'scorched', label: 'Scorched Ground', period: 0.6, description: 'Leaves burning ground behind it.' },
  blink: { id: 'blink', label: 'Blinking', period: 5, description: 'Teleports beside the player.' },
  volley: { id: 'volley', label: 'Radial Volley', period: 4.5, description: 'Fires a ring of shards.' },
  summoner: { id: 'summoner', label: 'Summoner', period: 8, description: 'Raises ghouls from the floor.' },
  pull: { id: 'pull', label: 'Grasping', period: 6, description: 'Drags the player toward it.' },
  chilling: { id: 'chilling', label: 'Chilling Aura', period: 0.5, description: 'Slows everything close to it.' },
};

export const ELITE_POOL: EliteModId[] = ['scorched', 'blink', 'volley', 'summoner', 'pull', 'chilling'];
