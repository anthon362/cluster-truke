import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { Ability, Energy } from './ability';

const A = TUNING.abilities.magnetBoots;

/** Hold to stay locked to the truck you stand on, whatever it does. */
export class MagnetBoots extends Ability {
  private readonly energy = new Energy(A.duration, A.refillDelay, A.refillTime);
  private held = false;

  constructor(sim: Sim) {
    super('magnetBoots', sim);
  }
  get energy01(): number {
    return this.energy.value01;
  }
  reset(): void {
    this.energy.reset();
    this.held = false;
    this.sim.player.magnet = false;
  }
  onUnequip(): void {
    this.sim.player.magnet = false;
  }
  onHold(): void {
    this.held = true;
  }
  onRelease(): void {
    this.held = false;
  }
  update(dt: number): void {
    const p = this.sim.player;
    const locked = this.held && p.grounded && !this.energy.empty;
    p.magnet = locked;
    if (locked) this.energy.drain(this.real(dt));
    else if (!this.held) this.energy.rest(this.real(dt));
  }
}
