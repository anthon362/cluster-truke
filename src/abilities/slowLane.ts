import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { Ability, Energy } from './ability';

const A = TUNING.abilities.slowLane;

/** Hold to slow time. */
export class SlowLane extends Ability {
  private readonly energy = new Energy(A.duration, A.refillDelay, A.refillTime);
  private held = false;

  constructor(sim: Sim) {
    super('slowLane', sim);
  }
  get energy01(): number {
    return this.energy.value01;
  }
  reset(): void {
    this.energy.reset();
    this.held = false;
  }
  onHold(): void {
    this.held = true;
  }
  onRelease(): void {
    this.held = false;
  }
  update(dt: number): void {
    // Measured before slowing, so the meter drains in real seconds.
    const realDt = this.real(dt);
    if (this.held && !this.energy.empty) {
      this.sim.slowTime(A.timeScale);
      this.energy.drain(realDt);
    } else if (!this.held) {
      this.energy.rest(realDt);
    }
  }
}
