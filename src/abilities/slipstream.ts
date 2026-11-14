import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import type { MoveInput } from '../player/movement';
import { Ability } from './ability';

const A = TUNING.abilities.slipstream;

/** Passive: standing on a truck builds a charge; the next jump spends it as forward speed. */
export class Slipstream extends Ability {
  private charge = 0;
  private wasGrounded = true;

  constructor(sim: Sim) {
    super('slipstream', sim);
  }
  get energy01(): number {
    return this.charge;
  }
  reset(): void {
    this.charge = 0;
    this.wasGrounded = true;
  }
  update(dt: number, input: MoveInput): void {
    const p = this.sim.player;
    if (p.jumped && this.wasGrounded && this.charge > 0) {
      const dir = new Vector3(p.vel.x - p.frameVel.x, 0, p.vel.z - p.frameVel.z);
      if (dir.lengthSq() < 1) dir.set(-Math.sin(input.yaw), 0, -Math.cos(input.yaw));
      p.push(dir.normalize().multiplyScalar(A.boost * this.charge));
      this.charge = 0;
    } else if (p.grounded) {
      this.charge = Math.min(1, this.charge + this.real(dt) / A.chargeTime);
    }
    this.wasGrounded = p.grounded;
  }
}
