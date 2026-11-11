import { describe, expect, it } from 'vitest';
import { TRACKS, trackFor } from '../src/audio/music';
import { DEFAULT_BINDINGS, keyLabel, rebind } from '../src/core/bindings';
import { stickResponse } from '../src/core/input';
import { SAVE_KEY, SAVE_VERSION, emptySave, loadSave, storeSave } from '../src/core/save';
import { defaultSettings, sanitizeSettings } from '../src/core/settings';
import { TUNING } from '../src/config/tuning';
import {
  GhostPlayer,
  GhostRecorder,
  decodeGhost,
  encodeGhost,
  loadGhost,
  storeGhost,
} from '../src/replay/ghost';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('settings', () => {
  it('defaults are valid and survive a save and reload', () => {
    const storage = fakeStorage();
    const save = emptySave();
    save.settings.fov = 110;
    save.settings.quality = 'low';
    save.settings.invertY = true;
    save.settings.bindings = rebind(save.settings.bindings, 'jump', 'KeyJ');
    storeSave(storage, save);
    const back = loadSave(storage);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.settings.fov).toBe(110);
    expect(back.settings.quality).toBe('low');
    expect(back.settings.invertY).toBe(true);
    expect(back.settings.bindings.jump).toEqual(['KeyJ']);
  });

  it('clamps out-of-range values and replaces nonsense with defaults', () => {
    const d = defaultSettings();
    const s = sanitizeSettings({ fov: 999, sensitivity: -4, master: 3, quality: 'ultra', shake: 'yes', bindings: { jump: [] } });
    expect(s.fov).toBe(TUNING.camera.fovMax);
    expect(s.sensitivity).toBe(TUNING.settings.sensitivityMin);
    expect(s.master).toBe(1);
    expect(s.quality).toBe(d.quality);
    expect(s.shake).toBe(d.shake);
    expect(s.bindings.jump).toEqual(DEFAULT_BINDINGS.jump);
    expect(sanitizeSettings(null)).toEqual(d);
    expect(sanitizeSettings('x')).toEqual(d);
  });

  it('a version 2 save (no settings) upgrades with default settings and keeps its progress', () => {
    const v2 = JSON.stringify({ version: 2, points: 900, owned: ['lunge'], equipped: { movement: 'lunge', utility: null }, bestTimes: { '1-1': 15 }, worldsCleared: [] });
    const save = loadSave(fakeStorage({ [SAVE_KEY]: v2 }));
    expect(save.points).toBe(900);
    expect(save.equipped.movement).toBe('lunge');
    expect(save.bestTimes['1-1']).toBe(15);
    expect(save.settings).toEqual(defaultSettings());
  });
});

describe('key rebinding', () => {
  it('gives the key to the new action and takes it from the old one', () => {
    const b = rebind(DEFAULT_BINDINGS, 'jump', 'KeyW');
    expect(b.jump).toEqual(['KeyW']);
    expect(b.forward).toEqual(['ArrowUp']); // kept its other key
    // An action that would be left with nothing swaps: it takes the key the other one had.
    const c = rebind(DEFAULT_BINDINGS, 'forward', 'Space');
    expect(c.forward).toEqual(['Space']);
    expect(c.jump).toEqual(['KeyW']);
    // No action is ever left without a key, whatever is rebound.
    let all = DEFAULT_BINDINGS;
    for (const code of ['Space', 'KeyW', 'KeyR', 'F3', 'KeyM', 'ShiftLeft', 'Space']) {
      all = rebind(all, 'sprint', code);
      all = rebind(all, 'jump', code);
      for (const keys of Object.values(all)) expect(keys.length).toBeGreaterThan(0);
    }
  });

  it('refuses keys the browser or the game needs, and does not change the original', () => {
    const before = JSON.stringify(DEFAULT_BINDINGS);
    expect(rebind(DEFAULT_BINDINGS, 'jump', 'Escape')).toBe(DEFAULT_BINDINGS);
    rebind(DEFAULT_BINDINGS, 'jump', 'KeyJ');
    expect(JSON.stringify(DEFAULT_BINDINGS)).toBe(before);
  });

  it('shows readable key names', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ShiftLeft')).toBe('Left Shift');
    expect(keyLabel('ControlRight')).toBe('Right Ctrl');
    expect(keyLabel('ArrowUp')).toBe('Up');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('Digit3')).toBe('3');
  });
});

describe('gamepad stick response', () => {
  it('is zero inside the dead zone and reaches 1 at full deflection', () => {
    expect(stickResponse(0.1, 0.15)).toBe(0);
    expect(stickResponse(-0.14, 0.15)).toBe(0);
    expect(stickResponse(1, 0.15)).toBeCloseTo(1);
    expect(stickResponse(-1, 0.15)).toBeCloseTo(-1);
  });

  it('is gentle near the centre: half deflection gives well under half speed', () => {
    const half = stickResponse(0.5, 0.15);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.3);
    // Monotonic, so more stick is always more turn.
    let last = 0;
    for (let v = 0.16; v <= 1; v += 0.02) {
      const r = stickResponse(v, 0.15);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
    // A linear curve (used for movement) is proportional.
    expect(stickResponse(0.575, 0.15, 1)).toBeCloseTo(0.5);
  });
});

describe('ghost', () => {
  /** A 20 s run along a curve at 30 Hz. */
  function run(): Float32Array {
    const rec = new GhostRecorder();
    for (let i = 0; i <= 20 * 60; i++) {
      const t = i / 60;
      rec.record(t, Math.sin(t) * 12, 4.7 + Math.abs(Math.sin(t * 3)) * 2, 22 + t * 31.5, Math.PI + Math.sin(t) * 0.4);
    }
    return rec.samples;
  }

  it('records at the ghost rate, not every step', () => {
    const samples = run();
    expect(samples.length / 4).toBe(20 * TUNING.ghost.sampleHz + 1);
  });

  it('survives encoding to within a centimetre and stays small', () => {
    const samples = run();
    const text = encodeGhost(samples);
    expect(text.length).toBeLessThan(8000);
    const back = decodeGhost(text);
    expect(back.length).toBe(samples.length);
    let worst = 0;
    for (let i = 0; i < samples.length; i++) worst = Math.max(worst, Math.abs(back[i] - samples[i]));
    expect(worst).toBeLessThan(0.011);
  });

  it('plays back by interpolating between samples and ends when the run does', () => {
    const player = new GhostPlayer(run());
    expect(player.duration).toBeCloseTo(20, 3);
    const pose = { x: 0, y: 0, z: 0, yaw: 0 };
    expect(player.at(10.0123, pose)).toBe(true);
    expect(pose.z).toBeCloseTo(22 + 10.0123 * 31.5, 0);
    expect(player.at(20.5, pose)).toBe(false);
    expect(player.at(-1, pose)).toBe(false);
  });

  it('is stored per level and loaded back; rubbish and over-budget ghosts are refused', () => {
    const storage = fakeStorage();
    const samples = run();
    expect(storeGhost(storage, '1-1', samples)).toBe(true);
    expect(loadGhost(storage, '1-1')!.count).toBe(samples.length / 4);
    expect(loadGhost(storage, '1-2')).toBeNull();
    storage.setItem('righop-ghost-1-3', '%%%not base64%%%');
    expect(loadGhost(storage, '1-3')).toBeNull();
    expect(decodeGhost('AAAA').length).toBe(0);
    // Far too long to store.
    const huge = new Float32Array(4 * 30 * 400);
    for (let i = 0; i < huge.length; i++) huge[i] = i % 97;
    expect(storeGhost(storage, 'big', huge)).toBe(false);
    expect(storage.map.has('righop-ghost-big')).toBe(false);
  });
});

describe('music', () => {
  it('has a loop for each world between 140 and 170 BPM, with 16 steps', () => {
    for (const world of ['dockyard', 'overpass', 'whiteout']) {
      const t = trackFor(world);
      expect(t).not.toBe(TRACKS.default);
      expect(t.bpm).toBeGreaterThanOrEqual(140);
      expect(t.bpm).toBeLessThanOrEqual(170);
      expect(t.bass.length).toBe(16);
      expect(t.arp.length).toBe(16);
      expect(t.hats.length).toBe(16);
    }
    expect(new Set(['dockyard', 'overpass', 'whiteout'].map((w) => trackFor(w).bpm)).size).toBe(3);
    expect(trackFor('somewhere-new')).toBe(TRACKS.default);
  });
});
