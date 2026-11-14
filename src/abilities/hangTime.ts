import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { Ability, Energy } from './ability';

const A = TUNING.abilities.hangTime;

/** Hold to hover: gravity off, full steering, for a limited time. */
export class HangTime extends Ability {
  private readonly energy = new Energy(A.duration, 0, A.recharge);
  private held = false;

  constructor(sim: Sim) {
    super('hangTime', sim);
  }
  get energy01(): number {
    return this.energy.value01;
  }
  reset(): void {
    this.energy.reset();
    this.held = false;
    this.sim.player.hover = false;
  }
  onUnequip(): void {
    this.sim.player.hover = false;
  }
  onHold(): void {
    this.held = true;
  }
  onRelease(): void {
    this.held = false;
  }
  update(dt: number): void {
    const p = this.sim.player;
    const hovering = this.held && !p.grounded && !this.energy.empty;
    p.hover = hovering;
    if (hovering) this.energy.drain(this.real(dt));
    else if (!this.held) this.energy.rest(this.real(dt));
  }
}
