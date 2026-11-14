import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Path } from '../trucks/path';
import type { GoalDef } from './types';

/**
 * The finish gate: an upright rectangle. Passing through it in either
 * direction and in any state (running, airborne, clinging) wins.
 */
export class Goal {
  readonly centre = new Vector3();
  /** Horizontal unit vector the gate faces. */
  readonly normal = new Vector3();
  readonly halfWidth: number;
  readonly height: number;

  constructor(def: GoalDef, paths: Iterable<Path>) {
    this.centre.set(def.pos[0], def.pos[1], def.pos[2]);
    this.halfWidth = def.width / 2;
    this.height = def.height;
    if (def.yaw !== undefined) {
      const a = (def.yaw * Math.PI) / 180;
      this.normal.set(Math.sin(a), 0, Math.cos(a));
    } else {
      // Face along the nearest path.
      let best = Infinity;
      this.normal.set(0, 0, 1);
      const p = new Vector3();
      for (const path of paths) {
        const s = path.projectAnywhere(this.centre);
        const d = path.pointAt(s, 0, p).distanceToSquared(this.centre);
        if (d < best) {
          best = d;
          path.tangentAt(s, this.normal);
          this.normal.y = 0;
          this.normal.normalize();
        }
      }
    }
  }

  /** Did a point moving from `a` to `b` pass through the gate? */
  crossed(a: Vector3, b: Vector3): boolean {
    const n = this.normal;
    const da = (a.x - this.centre.x) * n.x + (a.z - this.centre.z) * n.z;
    const db = (b.x - this.centre.x) * n.x + (b.z - this.centre.z) * n.z;
    if (da === db || da * db > 0) return false;
    const t = da / (da - db);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    // Sideways distance from the gate's centre line.
    const side = (x - this.centre.x) * n.z - (z - this.centre.z) * n.x;
    const m = TUNING.goal.margin;
    return (
      Math.abs(side) <= this.halfWidth + m &&
      y >= this.centre.y - m &&
      y <= this.centre.y + this.height + m
    );
  }
}
