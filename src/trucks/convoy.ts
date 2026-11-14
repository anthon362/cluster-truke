import { TUNING } from '../config/tuning';
import type { Rng } from '../core/rng';
import type { ConvoyDef, LevelDef } from '../level/types';
import type { PhysicsWorld } from '../physics/world';
import { Path } from './path';
import { Truck, TruckAssignment, TruckLookup } from './truck';

const T = TUNING.truck;

/**
 * Owns every truck in a level. Trucks are created once and reset in place
 * between attempts (pooling), so restarting never rebuilds physics bodies.
 */
export class TruckPool implements TruckLookup {
  readonly trucks: Truck[] = [];
  readonly paths = new Map<string, Path>();
  private readonly colliderMap = new Map<number, Truck>();

  constructor(physics: PhysicsWorld, level: LevelDef) {
    for (const p of level.paths) this.paths.set(p.id, new Path(p.id, p.points, p.width, p.lanes));
    for (const c of level.convoys) {
      for (const a of this.formation(c)) {
        if (this.trucks.length >= T.maxActive) {
          console.warn(`Level "${level.id}": more than ${T.maxActive} trucks, extra ones skipped`);
          return;
        }
        const truck = new Truck(physics, this.trucks.length, a);
        this.trucks.push(truck);
        for (const col of truck.colliders) this.colliderMap.set(col.handle, truck);
      }
    }
  }

  byCollider(handle: number): Truck | undefined {
    return this.colliderMap.get(handle);
  }

  find(convoy: string, row: number, lane: number): Truck | undefined {
    return this.trucks.find(
      (t) =>
        t.assignment.convoy === convoy && t.assignment.row === row && t.assignment.lane === lane,
    );
  }

  reset(rng: Rng): void {
    for (const t of this.trucks) t.reset(rng);
  }

  /** Row 0 is the rear of the convoy; higher rows are further along the direction of travel. */
  private formation(c: ConvoyDef): TruckAssignment[] {
    const path = this.paths.get(c.path);
    if (!path) throw new Error(`Convoy "${c.id}" uses unknown path "${c.path}"`);
    const dir = c.reverse ? -1 : 1;
    const spacing = c.rowSpacing ?? T.rowSpacing;
    const out: TruckAssignment[] = [];
    for (let row = 0; row < c.rows; row++) {
      for (const lane of c.lanesUsed) {
        out.push({
          convoy: c.id,
          row,
          lane,
          path,
          laneOffset: path.laneOffset(lane),
          dir,
          startS: c.startAt + row * spacing * dir,
          speed: c.speed ?? T.cruiseSpeed,
          speedVariance: c.speedVariance ?? T.speedVariance,
          wobble: c.wobble ?? T.wobbleAmplitude,
          rowFraction: c.rows > 1 ? row / (c.rows - 1) : 1,
          spawnDelay: c.spawnDelay ?? 0,
        });
      }
    }
    return out;
  }
}
