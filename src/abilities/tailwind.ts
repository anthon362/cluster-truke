import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { Ability, Cooldown } from './ability';

const A = TUNING.abilities.tailwind;

/** Every truck near the player drives faster for a few seconds. */
export class Tailwind extends Ability {
  private readonly cd = new Cooldown(A.cooldown);
  /** Trucks boosted by the latest use (tests). */
  lastBoosted = 0;

  constructor(sim: Sim) {
    super('tailwind', sim);
  }
  get cooldown01(): number {
    return this.cd.value01;
  }
  reset(): void {
    this.cd.reset();
  }
  onPress(): void {
    if (!this.cd.ready) return;
    this.lastBoosted = 0;
    for (const t of this.sim.trucks) {
      if (t.driving && t.pos.distanceToSquared(this.sim.player.pos) <= A.radius * A.radius) {
        t.boost(A.boost, A.duration);
        this.lastBoosted++;
      }
    }
    this.cd.start();
  }
  update(dt: number): void {
    this.cd.tick(this.real(dt));
  }
}
