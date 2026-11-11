import type { AudioEngine } from './engine';

/**
 * Synthesised placeholder sound effects. Everything is made from oscillators
 * and filtered noise at the moment it is needed; there are no audio files.
 */
export class Sfx {
  private noise: AudioBuffer | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  constructor(private readonly audio: AudioEngine) {
    audio.whenStarted(() => {
      const ctx = audio.ctx!;
      const out = audio.sfxBus!;
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Truck engine drone: always running, pitched and faded by `ambience`.
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 220;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(engineFilter).connect(this.engineGain).connect(out);
      this.engineOsc.start();

      // Wind: looping noise through a band-pass that opens up with speed.
      const wind = ctx.createBufferSource();
      wind.buffer = this.noise;
      wind.loop = true;
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 400;
      this.windFilter.Q.value = 0.6;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      wind.connect(this.windFilter).connect(this.windGain).connect(out);
      wind.start();
    });
  }

  /**
   * Continuous sounds, called every frame.
   * `truckSpeed`: speed of the truck under (or last under) the player.
   * `playerSpeed`: the player's own world speed. `active`: false in menus.
   */
  ambience(truckSpeed: number, playerSpeed: number, falling: number, active: boolean): void {
    const ctx = this.audio.ctx;
    if (!ctx || !this.engineOsc || !this.engineGain || !this.windGain || !this.windFilter) return;
    const t = ctx.currentTime;
    // Pitch follows how fast the truck is going relative to the player (a rough doppler).
    const rel = truckSpeed - playerSpeed * 0.35;
    this.engineOsc.frequency.setTargetAtTime(48 + Math.max(0, rel) * 1.6, t, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? 0.1 : 0, t, 0.15);
    const rush = Math.min(1, Math.max(0, (playerSpeed - 12) / 35) + Math.max(0, falling) / 30);
    this.windGain.gain.setTargetAtTime(active ? rush * 0.45 : 0, t, 0.12);
    this.windFilter.frequency.setTargetAtTime(350 + rush * 1500, t, 0.12);
  }

  jump(): void {
    this.sweep('square', 260, 520, 0.09, 0.12);
  }

  /** `impact`: landing speed in m/s; harder landings are lower and louder. */
  land(impact: number): void {
    const k = Math.min(1, impact / 16);
    this.sweep('sine', 150 - k * 70, 55, 0.12 + k * 0.1, 0.12 + k * 0.25);
    this.burst(0.05 + k * 0.05, 900 - k * 500, 0.08 + k * 0.12, 'lowpass');
  }

  crash(): void {
    this.burst(0.25, 2600, 0.3, 'bandpass');
    this.sweep('sawtooth', 320, 90, 0.2, 0.15);
  }

  /** `distance` in metres from the listener. */
  explosion(distance: number): void {
    const k = Math.max(0.12, 1 - distance / 90);
    this.burst(0.7, 500, 0.75 * k, 'lowpass');
    this.sweep('sine', 110, 28, 0.6, 0.6 * k);
  }

  horn(distance: number): void {
    const k = Math.max(0, 1 - distance / 70) * 0.16;
    if (k <= 0) return;
    this.sweep('sawtooth', 311, 311, 0.32, k, 900);
    this.sweep('sawtooth', 392, 392, 0.32, k, 900);
  }

  ui(): void {
    this.sweep('square', 880, 880, 0.04, 0.07);
  }

  bonus(): void {
    this.sweep('triangle', 1175, 1175, 0.07, 0.14);
    this.sweep('triangle', 1568, 1568, 0.12, 0.14, 8000, 0.07);
  }

  fail(): void {
    this.sweep('sine', 190, 40, 0.35, 0.5);
    this.burst(0.18, 400, 0.3, 'lowpass');
  }

  win(): void {
    [0, 4, 7, 12].forEach((semi, i) => {
      this.sweep('square', 523 * 2 ** (semi / 12), 523 * 2 ** (semi / 12), 0.16, 0.13, 6000, i * 0.08);
    });
  }

  /** A tone gliding from `from` to `to` Hz with a quick fade-out. */
  private sweep(
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    level: number,
    cutoff = 4000,
    delay = 0,
  ): void {
    const ctx = this.audio.ctx;
    const out = this.audio.sfxBus;
    if (!ctx || !out) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter).connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A burst of filtered noise. */
  private burst(dur: number, freq: number, level: number, type: BiquadFilterType): void {
    const ctx = this.audio.ctx;
    const out = this.audio.sfxBus;
    if (!ctx || !out || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.3), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }
}
