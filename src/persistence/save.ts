import type { ClassId } from '@/content/abilities';
import type { Item } from '@/content/items';
import type { PassiveId } from '@/content/passives';

/** Legacy single-slot record (pre class select). Migrated into the Sorcerer slot on first load. */
interface SaveV1 {
  version: 1; savedAt: number; level: number; xp: number; levelIndex: number;
  inventory: Item[]; equipment: Record<string, Item | null>; passives: (PassiveId | null)[];
}

export interface RunStats { kills: number; eliteKills: number; deaths: number; legendaries: number }
export interface Settings { music: number; sfx: number; ssao: boolean }

export interface SaveV2 {
  version: 2;
  classId: ClassId;
  createdAt: number;
  savedAt: number;
  playTime: number;
  level: number;
  xp: number;
  levelIndex: number;
  areaName: string;
  waveIndex: number;
  hp: number;
  resource: number;
  inventory: Item[];
  equipment: Record<string, Item | null>;
  passives: (PassiveId | null)[];
  stats: RunStats;
  settings: Settings;
}

export interface SlotInfo { classId: ClassId; level: number; areaName: string; playTime: number; savedAt: number }
interface Index { lastPlayed: ClassId | null; slots: Partial<Record<ClassId, SlotInfo>> }

const LEGACY_KEY = 'necromantle.save';
const INDEX_KEY = 'necromantle.index';
const slotKey = (id: ClassId) => `necromantle.slot.${id}`;
const BUDGET = 2 * 1024 * 1024;

/**
 * Local-storage save slots, one per class (docs/character-plan.md, "Save system"). Every write goes through
 * `commit`, which validates size and reports quota failures through `onError` instead of throwing; corrupt
 * records are renamed to a backup key rather than deleted.
 */
export const Save = {
  onError: null as ((msg: string) => void) | null,

  /** Move a pre-slot save into the Sorcerer slot. Safe to call every boot. */
  migrate(): void {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      const v1 = JSON.parse(raw) as SaveV1;
      if (v1?.version === 1 && !localStorage.getItem(slotKey('sorcerer'))) {
        const v2: SaveV2 = {
          version: 2, classId: 'sorcerer', createdAt: v1.savedAt, savedAt: v1.savedAt, playTime: 0,
          level: v1.level, xp: v1.xp, levelIndex: v1.levelIndex, areaName: '', waveIndex: 0, hp: -1, resource: -1,
          inventory: v1.inventory ?? [], equipment: v1.equipment ?? {}, passives: v1.passives ?? [null, null],
          stats: { kills: 0, eliteKills: 0, deaths: 0, legendaries: 0 }, settings: { music: 0.8, sfx: 0.9, ssao: false },
        };
        Save.commit(v2);
      }
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* unreadable legacy save: leave it */ }
  },

  index(): Index {
    try { const raw = localStorage.getItem(INDEX_KEY); if (raw) { const i = JSON.parse(raw); if (i && typeof i === 'object' && i.slots) return i as Index; } } catch { /* */ }
    return { lastPlayed: null, slots: {} };
  },

  slots(): SlotInfo[] { return Object.values(Save.index().slots).filter((s): s is SlotInfo => !!s); },
  lastPlayed(): ClassId | null { return Save.index().lastPlayed; },

  load(classId: ClassId): SaveV2 | null {
    try {
      const raw = localStorage.getItem(slotKey(classId));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data?.version !== 2 || data.classId !== classId || typeof data.level !== 'number' || !Array.isArray(data.inventory)) {
        localStorage.setItem(`necromantle.backup.${Date.now()}`, raw); localStorage.removeItem(slotKey(classId));
        Save.onError?.('A save could not be read and was set aside as a backup.');
        return null;
      }
      return data as SaveV2;
    } catch { return null; }
  },

  commit(s: SaveV2): boolean {
    try {
      const json = JSON.stringify(s);
      if (json.length > BUDGET) { Save.onError?.('Could not save: the record is too large.'); return false; }
      localStorage.setItem(slotKey(s.classId), json);
      const idx = Save.index();
      idx.lastPlayed = s.classId;
      idx.slots[s.classId] = { classId: s.classId, level: s.level, areaName: s.areaName, playTime: s.playTime, savedAt: s.savedAt };
      localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
      return true;
    } catch { Save.onError?.('Could not save: storage is full or unavailable.'); return false; }
  },

  remove(classId: ClassId): void {
    try {
      localStorage.removeItem(slotKey(classId));
      const idx = Save.index(); delete idx.slots[classId]; if (idx.lastPlayed === classId) idx.lastPlayed = Save.slots()[0]?.classId ?? null;
      localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    } catch { /* */ }
  },

  /** Wipe every slot (dev panel, `?new=1`). */
  wipe(): void {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('necromantle.')) localStorage.removeItem(k);
    } catch { /* */ }
  },

  exportSlot(classId: ClassId): string | null { try { return localStorage.getItem(slotKey(classId)); } catch { return null; } },
  importSlot(json: string): ClassId | null {
    try { const s = JSON.parse(json) as SaveV2; if (s?.version !== 2 || !s.classId) return null; return Save.commit(s) ? s.classId : null; } catch { return null; }
  },
};
