import { TUNING } from '../config/tuning';
import type { AudioEngine } from './engine';

const M = TUNING.music;
const ROOT_HZ = 55;

/** One loop: 16 steps of bass and arp notes in semitones above the root (-1 = rest). */
export interface Track {
  bpm: number;
  /** Semitones above A1 for this track's key. */
  key: number;
  bass: number[];
  arp: number[];
  arpWave: OscillatorType;
  /** Which steps get a hat (and how loud): 0 none, 1 soft, 2 accent. */
  hats: number[];
}

const R = -1;
/** Placeholder loops, one per world, all between 140 and 170 BPM. */
export const TRACKS: Record<string, Track> = {
  default: {
    bpm: M.bpm,
    key: 0,
    bass: [0, R, 0, R, 0, R, 3, R, 5, R, 5, R, 3, R, -2, R],
    arp: [12, 19, 24, 19, 15, 19, 24, 19, 17, 24, 29, 24, 15, 22, 27, 22],
    arpWave: 'square',
    hats: [0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2],
  },
  dockyard: {
    bpm: 150,
    key: 0,
    bass: [0, R, 0, 0, R, 0, 7, R, 5, R, 5, 5, R, 3, 3, R],
    arp: [12, 15, 19, 24, 19, 15, 12, 15, 17, 20, 24, 29, 24, 20, 17, 20],
    arpWave: 'square',
    hats: [0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 2, 1],
  },
  overpass: {
    bpm: 162,
    key: 2,
    bass: [0, 0, R, 0, 0, R, 0, R, 3, 3, R, 3, 5, R, 7, R],
    arp: [24, 19, 15, 19, 24, 19, 27, 19, 24, 20, 15, 20, 24, 22, 19, 22],
    arpWave: 'sawtooth',
    hats: [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 2],
  },
  whiteout: {
    bpm: 142,
    key: -3,
    bass: [0, R, R, 0, R, R, 0, R, -4, R, R, -4, R, R, -2, R],
    arp: [19, R, 24, R, 26, R, 24, 19, 20, R, 24, R, 27, R, 24, 20],
    arpWave: 'triangle',
    hats: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0],
  },
};

export function trackFor(world: string): Track {
  return TRACKS[world] ?? TRACKS.default;
}

/**
 * Procedural placeholder music. The sequencer starts once and never stops or
 * rewinds: restarting an attempt does nothing to it, and changing world only
 * swaps which pattern the next steps are read from.
 */
export class Music {
  private noise: AudioBuffer | null = null;
  private nextTime = 0;
  private step = 0;
  private track: Track = TRACKS.default;

  constructor(private readonly engine: AudioEngine) {
    engine.whenStarted(() => {
      const ctx = engine.ctx!;
      const len = Math.floor(ctx.sampleRate * 0.05);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.nextTime = ctx.currentTime + 0.05;
      window.setInterval(() => this.schedule(), M.tickMs);
    });
  }

  /** Number of steps scheduled so far (for checking that it keeps going). */
  get stepsPlayed(): number {
    return this.step;
  }

  get world(): Track {
    return this.track;
  }

  /** Switch loop. Takes effect from the next step; the beat is not interrupted. */
  setWorld(world: string): void {
    this.track = trackFor(world);
  }

  private schedule(): void {
    const ctx = this.engine.ctx;
    const out = this.engine.musicBus;
    if (!ctx || !out) return;
    // If the tab was in the background, skip ahead instead of bursting notes.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + M.lookAhead) {
      const t = this.track;
      const stepLen = 60 / t.bpm / 4;
      const i = this.step % 16;
      if (t.bass[i] !== R) this.tone(out, t.key + t.bass[i], 'sawtooth', 0.5, stepLen * 1.6, 500);
      if (t.arp[i] !== R) this.tone(out, t.key + t.arp[i], t.arpWave, 0.16, stepLen * 0.8, 2400);
      if (t.hats[i] > 0) this.hat(out, t.hats[i] === 2 ? 0.22 : 0.12);
      this.nextTime += stepLen;
      this.step++;
    }
  }

  private tone(out: AudioNode, semi: number, type: OscillatorType, level: number, dur: number, cutoff: number): void {
    const ctx = this.engine.ctx!;
    const t = this.nextTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = ROOT_HZ * 2 ** (semi / 12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level * M.volume * 4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter).connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hat(out: AudioNode, level: number): void {
    const ctx = this.engine.ctx!;
    const t = this.nextTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level * M.volume * 4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
  }
}
