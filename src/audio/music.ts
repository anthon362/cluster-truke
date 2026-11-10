import { TUNING } from '../config/tuning';

const M = TUNING.music;

/** Placeholder pattern: 16 steps of bass and arp notes (semitones above A1), -1 = rest. */
const BASS = [0, -1, 0, -1, 0, -1, 3, -1, 5, -1, 5, -1, 3, -1, -2, -1];
const ARP = [12, 19, 24, 19, 15, 19, 24, 19, 17, 24, 29, 24, 15, 22, 27, 22];
const ROOT_HZ = 55;

/**
 * Procedural placeholder loop (bass + arp + hats). It is started once and is
 * deliberately independent of attempts: restarting a level never touches it.
 */
export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextTime = 0;
  private step = 0;
  private muted = false;
  /** Number of times playback has been started (should stay at 1). */
  starts = 0;

  /** Must be called from a user gesture the first time. Safe to call again. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : M.volume;
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.starts++;
    window.setInterval(() => this.schedule(), M.tickMs);
  }

  get playing(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Seconds the audio clock has been running. */
  get clock(): number {
    return this.ctx?.currentTime ?? 0;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : M.volume;
    return this.muted;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const stepLen = 60 / M.bpm / 4;
    // If the tab was in the background, skip ahead instead of bursting notes.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + M.lookAhead) {
      const i = this.step % 16;
      if (BASS[i] >= -2 && BASS[i] !== -1) this.tone(BASS[i], 'sawtooth', 0.5, stepLen * 1.6, 500);
      this.tone(ARP[i], 'square', 0.16, stepLen * 0.8, 2400);
      if (i % 2 === 1) this.hat(i % 4 === 3 ? 0.22 : 0.12);
      this.nextTime += stepLen;
      this.step++;
    }
  }

  private tone(
    semi: number,
    type: OscillatorType,
    level: number,
    dur: number,
    cutoff: number,
  ): void {
    const ctx = this.ctx!;
    const t = this.nextTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = ROOT_HZ * 2 ** (semi / 12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter).connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hat(level: number): void {
    const ctx = this.ctx!;
    const t = this.nextTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
  }
}
