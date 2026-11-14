import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import type { MoveInput } from '../player/movement';
import { Ability } from './ability';

const A = TUNING.abilities.kickOff;

/** Passive: jumping kicks the truck you leave backward and adds a little speed. */
export class KickOff extends Ability {
  private wasGrounded = true;

  constructor(sim: Sim) {
    super('kickOff', sim);
  }
  reset(): void {
    this.wasGrounded = true;
  }
  update(_dt: number, input: MoveInput): void {
    const p = this.sim.player;
    // `jumped` describes the previous step, when the jump actually happened.
    if (p.jumped && this.wasGrounded && p.lastTruck) {
      const dir = new Vector3(p.vel.x - p.frameVel.x, 0, p.vel.z - p.frameVel.z);
      if (dir.lengthSq() < 1) dir.set(-Math.sin(input.yaw), 0, -Math.cos(input.yaw));
      dir.normalize();
      p.push(new Vector3().copy(dir).multiplyScalar(A.playerBoost));
      const spin = (this.sim.rng.next() < 0.5 ? -1 : 1) * A.truckSpin;
      p.lastTruck.shove(dir.multiplyScalar(-A.truckKick), spin);
    }
    this.wasGrounded = p.grounded;
  }
}
