import { TUNING } from '../config/tuning';
import { type Action, DEFAULT_BINDINGS } from './bindings';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  fov: number;
  sensitivity: number;
  invertY: boolean;
  master: number;
  music: number;
  sfx: number;
  quality: Quality;
  shake: boolean;
  speedReadout: boolean;
  /** Show the ghost of your own best run. */
  ghost: boolean;
  padSensitivityX: number;
  padSensitivityY: number;
  padDeadzone: number;
  bindings: Record<Action, string[]>;
}

const C = TUNING.camera;
const S = TUNING.settings;

export function defaultSettings(): Settings {
  return {
    fov: C.fovDefault,
    sensitivity: C.sensitivityDefault,
    invertY: false,
    master: 0.8,
    music: 0.6,
    sfx: 0.8,
    quality: 'medium',
    shake: true,
    speedReadout: false,
    ghost: true,
    padSensitivityX: 1,
    padSensitivityY: 1,
    padDeadzone: S.padDeadzone,
    bindings: structuredClone(DEFAULT_BINDINGS),
  };
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Build valid settings from anything that was stored; unknown or bad values fall back to defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const out: Settings = {
    fov: clamp(r.fov, C.fovMin, C.fovMax, d.fov),
    sensitivity: clamp(r.sensitivity, S.sensitivityMin, S.sensitivityMax, d.sensitivity),
    invertY: bool(r.invertY, d.invertY),
    master: clamp(r.master, 0, 1, d.master),
    music: clamp(r.music, 0, 1, d.music),
    sfx: clamp(r.sfx, 0, 1, d.sfx),
    quality: r.quality === 'low' || r.quality === 'medium' || r.quality === 'high' ? r.quality : d.quality,
    shake: bool(r.shake, d.shake),
    speedReadout: bool(r.speedReadout, d.speedReadout),
    ghost: bool(r.ghost, d.ghost),
    padSensitivityX: clamp(r.padSensitivityX, S.padSensitivityMin, S.padSensitivityMax, 1),
    padSensitivityY: clamp(r.padSensitivityY, S.padSensitivityMin, S.padSensitivityMax, 1),
    padDeadzone: clamp(r.padDeadzone, 0, 0.5, d.padDeadzone),
    bindings: d.bindings,
  };
  const b = r.bindings as Record<string, unknown> | undefined;
  if (b && typeof b === 'object') {
    for (const action of Object.keys(d.bindings) as Action[]) {
      const keys = b[action];
      if (Array.isArray(keys) && keys.length > 0 && keys.every((k) => typeof k === 'string' && k.length < 40)) {
        out.bindings[action] = [...new Set(keys as string[])].slice(0, 3);
      }
    }
  }
  return out;
}
