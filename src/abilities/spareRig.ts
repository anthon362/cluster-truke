import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { GROUP, RAPIER, groups } from '../physics/world';
import type { MoveInput } from '../player/movement';
import type { Path } from '../trucks/path';
import { Ability, Cooldown } from './ability';
import { Thrown } from './thrown';

const A = TUNING.abilities.spareRig;
const T = TUNING.truck;
const UP = new Vector3(0, 1, 0);

/** Throw a marker; a truck appears where it lands. */
export class SpareRig extends Ability {
  private readonly cd = new Cooldown(A.cooldown);
  readonly marker: Thrown;
  /** One box covering the whole truck, slightly shrunk, for the "is this spot free" test. */
  private readonly probe = new RAPIER.Cuboid(
    T.width / 2 - 0.05,
    T.trailerRoof / 2 - 0.05,
    T.length / 2 - 0.05,
  );
  /** How many trucks this ability has called in (tests). */
  spawned = 0;

  constructor(sim: Sim) {
    super('spareRig', sim);
    this.marker = new Thrown(sim);
  }
  get cooldown01(): number {
    return this.cd.value01;
  }
  onEquip(): void {
    this.sim.ensureSpares(A.pool);
  }
  reset(): void {
    this.cd.reset();
    this.marker.cancel();
  }
  onPress(input: MoveInput): void {
    if (!this.cd.ready || this.marker.active) return;
    this.marker.launch(input, A.throwSpeed);
    this.cd.start();
  }
  update(dt: number): void {
    this.cd.tick(this.real(dt));
    const landed = this.marker.step(dt);
    if (landed && !this.spawnAt(landed)) this.cd.reset(); // nowhere to put it: no charge
  }

  /**
   * Place a spare truck at `point`, heading along the nearest path. The spot
   * is tested first and raised until the truck overlaps nothing, so it is
   * never created inside geometry (which would fling it out violently).
   */
  spawnAt(point: Vector3): boolean {
    const truck = this.sim.trucks.find((t) => t.spare && t.state === 'gone');
    if (!truck) return false;
    let path: Path | null = null;
    let s = 0;
    let best = Infinity;
    const onPath = new Vector3();
    for (const candidate of this.sim.pool.paths.values()) {
      const cs = candidate.projectAnywhere(point);
      const d = candidate.pointAt(cs, 0, onPath).distanceToSquared(point);
      if (d < best) {
        best = d;
        path = candidate;
        s = cs;
      }
    }
    if (!path) return false;
    const tangent = path.tangentAt(s, new Vector3());
    const yaw = Math.atan2(tangent.x, tangent.z);
    const rot = new Quaternion().setFromAxisAngle(UP, yaw);
    const base = new Vector3(point.x, point.y + A.dropHeight, point.z);
    const centre = new Vector3();
    const filter = groups(GROUP.TRUCK, GROUP.TRUCK | GROUP.WORLD | GROUP.HAZARD);
    for (let i = 0; i < A.nudgeTries; i++) {
      centre.set(base.x, base.y + T.trailerRoof / 2, base.z);
      let blocked = false;
      this.sim.physics.world.intersectionsWithShape(
        centre,
        rot,
        this.probe,
        () => {
          blocked = true;
          return false;
        },
        undefined,
        filter,
      );
      if (!blocked) {
        truck.spawnAt(base, yaw, path, s, path.lateralAt(base, s));
        this.spawned++;
        return true;
      }
      base.y += A.nudgeStep;
    }
    return false;
  }
}
