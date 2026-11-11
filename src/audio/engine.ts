/**
 * The one AudioContext and its three volume stages: everything goes through
 * `master`; music and sound effects each have their own gain before it.
 * It is created on the first user gesture and kept alive for the whole
 * session, including across restarts and level changes.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  private volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
  private musicMuted = false;
  private readonly onStart: (() => void)[] = [];
  /** Number of times the context was created (should stay at 1). */
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
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.apply();
    this.starts++;
    for (const f of this.onStart) f();
  }

  /** Run `f` once the context exists (immediately if it already does). */
  whenStarted(f: () => void): void {
    if (this.ctx) f();
    else this.onStart.push(f);
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  get clock(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.apply();
  }

  toggleMusicMute(): boolean {
    this.musicMuted = !this.musicMuted;
    this.apply();
    return this.musicMuted;
  }

  private apply(): void {
    if (!this.master || !this.musicBus || !this.sfxBus) return;
    this.master.gain.value = this.volumes.master;
    this.musicBus.gain.value = this.musicMuted ? 0 : this.volumes.music;
    this.sfxBus.gain.value = this.volumes.sfx;
  }
}
