import { TUNING } from '../config/tuning';

/**
 * Fixed-timestep accumulator. Pure logic so it can be unit tested.
 * `advance` returns how many fixed steps to run for a frame; `alpha` is the
 * interpolation factor between the last two physics states.
 */
export class Accumulator {
  private acc = 0;

  constructor(
    public readonly step: number = TUNING.loop.fixedStep,
    public readonly maxSubSteps: number = TUNING.loop.maxSubSteps,
    public readonly maxFrameTime: number = TUNING.loop.maxFrameTime,
  ) {}

  advance(frameSeconds: number, timeScale = 1): number {
    this.acc += Math.min(Math.max(frameSeconds, 0), this.maxFrameTime) * timeScale;
    let steps = Math.floor(this.acc / this.step + 1e-9);
    this.acc -= steps * this.step;
    if (steps > this.maxSubSteps) steps = this.maxSubSteps; // drop the rest
    if (this.acc < 0) this.acc = 0;
    return steps;
  }

  get alpha(): number {
    return this.acc / this.step;
  }

  /** Call on pause/resume so no time is carried across. */
  reset(): void {
    this.acc = 0;
  }
}

export interface LoopCallbacks {
  /** Run one fixed simulation step. */
  step(): void;
  /** Draw a frame. `alpha` interpolates physics states, `dt` is real frame time. */
  render(alpha: number, dt: number): void;
  /** While false the simulation is frozen (paused / menu). */
  isRunning(): boolean;
  /** World speed (1 = normal). Mouse look is unaffected. */
  timeScale?(): number;
}

export class GameLoop {
  readonly accumulator = new Accumulator();
  private last = 0;
  private wasRunning = false;
  /** Average milliseconds spent per fixed step in the last frame that stepped. */
  stepMs = 0;
  fps = 0;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0) this.fps += (1 / dt - this.fps) * 0.1;
      const running = this.cb.isRunning();
      if (running && !this.wasRunning) this.accumulator.reset();
      this.wasRunning = running;
      if (running) {
        const steps = this.accumulator.advance(dt, this.cb.timeScale?.() ?? 1);
        if (steps > 0) {
          const t0 = performance.now();
          for (let i = 0; i < steps; i++) this.cb.step();
          this.stepMs = (performance.now() - t0) / steps;
        }
      }
      this.cb.render(running ? this.accumulator.alpha : 1, dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
