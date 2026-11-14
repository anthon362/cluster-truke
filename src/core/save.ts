/** Persistent data in localStorage under one versioned key. */
import { type Settings, defaultSettings, sanitizeSettings } from './settings';

export const SAVE_KEY = 'righop-save';
export const SAVE_VERSION = 3;

export interface SaveData {
  version: number;
  /** Banked points available to spend. */
  points: number;
  /** Ids of abilities bought. */
  owned: string[];
  equipped: { movement: string | null; utility: string | null };
  /** Best finish time in seconds per level id. */
  bestTimes: Record<string, number>;
  /** Worlds whose one-time clear bonus has been paid. */
  worldsCleared: string[];
  settings: Settings;
}

/** The slice of the Storage API that is used, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    points: 0,
    owned: [],
    equipped: { movement: null, utility: null },
    bestTimes: {},
    worldsCleared: [],
    settings: defaultSettings(),
  };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];

/**
 * Build a current save from whatever was stored. Version 1 only had best
 * times and version 2 had no settings; unknown or damaged fields fall back to
 * their defaults.
 */
function migrate(raw: Record<string, unknown>): SaveData {
  const out = emptySave();
  const times = raw.bestTimes;
  if (times && typeof times === 'object') {
    for (const [id, t] of Object.entries(times as Record<string, unknown>)) {
      if (typeof t === 'number' && Number.isFinite(t) && t > 0) out.bestTimes[id] = t;
    }
  }
  if (typeof raw.points === 'number' && Number.isFinite(raw.points) && raw.points >= 0) {
    out.points = Math.floor(raw.points);
  }
  out.owned = strings(raw.owned);
  out.worldsCleared = strings(raw.worldsCleared);
  out.settings = sanitizeSettings(raw.settings);
  const eq = raw.equipped as Record<string, unknown> | undefined;
  if (eq && typeof eq === 'object') {
    for (const slot of ['movement', 'utility'] as const) {
      const id = eq[slot];
      // Only something that is owned can be equipped.
      if (typeof id === 'string' && out.owned.includes(id)) out.equipped[slot] = id;
    }
  }
  return out;
}

export function loadSave(storage: StorageLike | undefined): SaveData {
  try {
    const text = storage?.getItem(SAVE_KEY);
    if (!text) return emptySave();
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object') return emptySave();
    return migrate(raw as Record<string, unknown>);
  } catch {
    return emptySave();
  }
}

export function storeSave(storage: StorageLike | undefined, data: SaveData): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: playing still works, progress just is not kept.
  }
}

/** Record a finish. Returns true if it is a new best for that level. */
export function recordTime(data: SaveData, levelId: string, time: number): boolean {
  const old = data.bestTimes[levelId];
  if (old !== undefined && old <= time) return false;
  data.bestTimes[levelId] = time;
  return true;
}

/**
 * True exactly once per world: when every one of its levels has been finished
 * and the clear bonus has not been paid yet. Marks the world as paid.
 */
export function claimWorldClear(
  data: SaveData,
  world: string,
  levelIds: readonly string[],
): boolean {
  if (data.worldsCleared.includes(world) || levelIds.length === 0) return false;
  if (!levelIds.every((id) => data.bestTimes[id] !== undefined)) return false;
  data.worldsCleared.push(world);
  return true;
}

/** Spend points on an ability. Returns false (and changes nothing) if it cannot be bought. */
export function buy(data: SaveData, id: string, cost: number): boolean {
  if (data.owned.includes(id) || data.points < cost) return false;
  data.points -= cost;
  data.owned.push(id);
  return true;
}
