import type { Item } from '@/content/items';
import type { PassiveId } from '@/content/passives';

export interface SaveV1 {
  version: 1;
  savedAt: number;
  level: number;
  xp: number;
  levelIndex: number;
  inventory: Item[];
  equipment: Record<string, Item | null>;
  passives: (PassiveId | null)[];
}

const KEY = 'necromantle.save';

/** Versioned local save. Unknown or older versions are migrated here; anything unreadable starts fresh. */
export const Save = {
  load(): SaveV1 | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data?.version !== 1) return null;
      return data as SaveV1;
    } catch { return null; }
  },
  store(s: Omit<SaveV1, 'version' | 'savedAt'>): void {
    try { localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: Date.now(), ...s })); } catch { /* storage unavailable */ }
  },
  wipe(): void { try { localStorage.removeItem(KEY); } catch { /* */ } },
};
