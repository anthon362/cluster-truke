import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { GROUP, RAPIER, groups } from '../physics/world';
import type { MoveInput } from '../player/movement';
import { lookDir } from './ability';

const A = TUNING.abilities;

/** A small thrown marker flying on a ballistic arc until it hits something. */
export class Thrown {
  active = false;
  readonly pos = new Vector3();
  private readonly vel = new Vector3();
  private life = 0;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  constructor(private readonly sim: Sim) {}

  launch(input: MoveInput, speed: number): void {
    const p = this.sim.player;
    this.pos.set(p.pos.x, p.pos.y + A.towLine.eyeHeight, p.pos.z);
    lookDir(input, this.vel).multiplyScalar(speed).add(p.vel);
    this.life = A.throwLife;
    this.active = true;
  }

  cancel(): void {
    this.active = false;
  }

  /** Advance one step. Returns the landing point on the step it lands, else null. */
  step(dt: number): Vector3 | null {
    if (!this.active) return null;
    this.vel.y -= A.throwGravity * dt;
    const dist = this.vel.length() * dt;
    if (dist > 1e-6) {
      this.ray.origin.x = this.pos.x;
      this.ray.origin.y = this.pos.y;
      this.ray.origin.z = this.pos.z;
      this.ray.dir.x = this.vel.x * (dt / dist);
      this.ray.dir.y = this.vel.y * (dt / dist);
      this.ray.dir.z = this.vel.z * (dt / dist);
      const hit = this.sim.physics.world.castRay(
        this.ray,
        dist,
        true,
        undefined,
        groups(GROUP.PLAYER, GROUP.TRUCK | GROUP.WORLD),
      );
      if (hit) {
        this.pos.addScaledVector(this.vel, (dt * hit.timeOfImpact) / dist);
        this.active = false;
        return this.pos;
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    this.life -= dt;
    if (this.life <= 0 || this.pos.y < this.sim.level.killY) this.active = false;
    return null;
  }
}
