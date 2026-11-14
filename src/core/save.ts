/** Persistent data in localStorage under one versioned key. Grows in M5. */
export const SAVE_KEY = 'righop-save';
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  /** Best finish time in seconds per level id. */
  bestTimes: Record<string, number>;
}

/** The slice of the Storage API that is used, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptySave(): SaveData {
  return { version: SAVE_VERSION, bestTimes: {} };
}

/** Upgrade older save shapes. Nothing to migrate yet. */
function migrate(raw: Record<string, unknown>): SaveData {
  const out = emptySave();
  const times = raw.bestTimes;
  if (times && typeof times === 'object') {
    for (const [id, t] of Object.entries(times as Record<string, unknown>)) {
      if (typeof t === 'number' && Number.isFinite(t) && t > 0) out.bestTimes[id] = t;
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
