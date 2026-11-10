import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import type { MoveInput } from '../player/movement';
import { Ability, Cooldown, lookDir } from './ability';

const A = TUNING.abilities.lunge;

/** A short, fast dash exactly along the view direction. */
export class Lunge extends Ability {
  private readonly cd = new Cooldown(A.cooldown);
  private readonly dir = new Vector3();
  private left = 0;

  constructor(sim: Sim) {
    super('lunge', sim);
  }
  get cooldown01(): number {
    return this.cd.value01;
  }
  reset(): void {
    this.cd.reset();
    this.left = 0;
  }
  onPress(input: MoveInput): void {
    if (!this.cd.ready) return;
    lookDir(input, this.dir);
    this.left = A.duration;
    this.cd.start();
  }
  update(dt: number): void {
    this.cd.tick(this.real(dt));
    if (this.left <= 0) return;
    // Spread the impulse over the dash so it reads as a burst, not a teleport.
    const step = Math.min(dt, this.left);
    this.left -= step;
    this.sim.player.push(
      new Vector3().copy(this.dir).multiplyScalar((A.speed / A.duration) * step),
    );
  }
}
