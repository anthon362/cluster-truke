import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { GROUP, RAPIER, groups } from '../physics/world';
import type { MoveInput } from '../player/movement';
import type { Truck } from '../trucks/truck';
import { Ability, Cooldown, lookDir } from './ability';

const A = TUNING.abilities.towLine;
const tmp = new Vector3();

/** Hook a surface you aim at and get pulled toward it while the button is held. */
export class TowLine extends Ability {
  private readonly cd = new Cooldown(A.cooldown);
  private hooked = false;
  private truck: Truck | null = null;
  /** Hook point: world space, or the truck's local space when hooked to a truck. */
  private readonly anchor = new Vector3();
  /** Where the hook is right now (world), for drawing the line. */
  readonly hookPoint = new Vector3();
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  constructor(sim: Sim) {
    super('towLine', sim);
  }
  get cooldown01(): number {
    return this.cd.value01;
  }
  get active(): boolean {
    return this.hooked;
  }
  reset(): void {
    this.cd.reset();
    this.hooked = false;
    this.truck = null;
  }
  onPress(input: MoveInput): void {
    if (!this.cd.ready || this.hooked) return;
    const p = this.sim.player;
    const dir = lookDir(input, tmp);
    this.ray.origin.x = p.pos.x;
    this.ray.origin.y = p.pos.y + A.eyeHeight;
    this.ray.origin.z = p.pos.z;
    this.ray.dir.x = dir.x;
    this.ray.dir.y = dir.y;
    this.ray.dir.z = dir.z;
    const hit = this.sim.physics.world.castRay(
      this.ray,
      A.range,
      true,
      undefined,
      groups(GROUP.PLAYER, GROUP.TRUCK | GROUP.WORLD | GROUP.HAZARD),
    );
    // A miss costs nothing.
    if (!hit) return;
    const point = new Vector3(
      this.ray.origin.x + dir.x * hit.timeOfImpact,
      this.ray.origin.y + dir.y * hit.timeOfImpact,
      this.ray.origin.z + dir.z * hit.timeOfImpact,
    );
    this.truck = this.sim.pool.byCollider(hit.collider.handle) ?? null;
    if (this.truck) {
      // Remember the spot on the truck so the hook rides along with it.
      this.anchor.copy(point).sub(this.truck.pos).applyQuaternion(this.truck.rot.clone().invert());
    } else {
      this.anchor.copy(point);
    }
    this.hookPoint.copy(point);
    this.hooked = true;
  }
  onRelease(): void {
    this.letGo();
  }
  update(dt: number): void {
    this.cd.tick(this.real(dt));
    if (!this.hooked) return;
    if (this.truck) {
      if (!this.truck.isSolid) return this.letGo();
      this.hookPoint.copy(this.anchor).applyQuaternion(this.truck.rot).add(this.truck.pos);
    }
    const p = this.sim.player;
    const to = tmp.subVectors(this.hookPoint, p.pos);
    const dist = to.length();
    if (dist < A.releaseDistance) return this.letGo();
    to.multiplyScalar(1 / dist);
    // Pull, but never faster than the reel speed along the line.
    const along = p.vel.dot(to);
    const add = Math.min(A.pullAccel * dt, A.maxPullSpeed - along);
    if (add > 0) p.push(new Vector3().copy(to).multiplyScalar(add));
  }

  private letGo(): void {
    if (!this.hooked) return;
    this.hooked = false;
    this.truck = null;
    this.cd.start();
  }
}
