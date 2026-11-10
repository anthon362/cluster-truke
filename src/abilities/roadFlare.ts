import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import type { MoveInput } from '../player/movement';
import { Ability, Cooldown } from './ability';
import { Thrown } from './thrown';

const A = TUNING.abilities.roadFlare;

/** Throw a flare; trucks near it swerve away from it for a few seconds. */
export class RoadFlare extends Ability {
  private readonly cd = new Cooldown(A.cooldown);
  readonly marker: Thrown;
  /** Where the flare is burning (valid while `burning` > 0). */
  readonly flare = new Vector3();
  burning = 0;

  constructor(sim: Sim) {
    super('roadFlare', sim);
    this.marker = new Thrown(sim);
  }
  get cooldown01(): number {
    return this.cd.value01;
  }
  reset(): void {
    this.cd.reset();
    this.marker.cancel();
    this.burning = 0;
  }
  onPress(input: MoveInput): void {
    if (!this.cd.ready || this.marker.active) return;
    this.marker.launch(input, A.throwSpeed);
    this.cd.start();
  }
  update(dt: number): void {
    this.cd.tick(this.real(dt));
    const landed = this.marker.step(dt);
    if (landed) {
      this.flare.copy(landed);
      this.burning = A.duration;
    }
    if (this.burning <= 0) return;
    this.burning -= dt;
    for (const t of this.sim.trucks) {
      if (!t.driving || t.pos.distanceToSquared(this.flare) > A.radius * A.radius) continue;
      const a = t.assignment;
      // Steer to whichever side of the flare the truck is already on.
      const mine = a.path.lateralAt(t.pos, t.s);
      const flare = a.path.lateralAt(this.flare, t.s);
      t.avoid((mine >= flare ? 1 : -1) * a.dir, 0.3, A.swerve);
    }
  }
}
