import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { Ability } from './ability';

/** One extra, weaker jump in mid-air. The controller does the jump; this just enables it. */
export class SecondWind extends Ability {
  constructor(sim: Sim) {
    super('secondWind', sim);
  }
  onEquip(): void {
    this.sim.player.airJumpVelocity = TUNING.abilities.secondWind.jumpVelocity;
  }
  onUnequip(): void {
    this.sim.player.airJumpVelocity = 0;
  }
  get energy01(): number {
    return this.sim.player.airJumpReady ? 1 : 0;
  }
}
