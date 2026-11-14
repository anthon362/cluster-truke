import { CatmullRomCurve3, Vector3 } from 'three';
import { TUNING } from '../config/tuning';

/** Distance between stored samples along a path (m). */
const SAMPLE_SPACING = 1;
/** How many samples either side of the hint `project` searches. */
const PROJECT_WINDOW = 30;

/**
 * A smooth road centre line through control points, with parallel lanes.
 * Positions are addressed by `s`, metres along the centre line. Beyond either
 * end the path continues straight, so trucks never run out of road.
 */
export class Path {
  readonly length: number;
  readonly samples: Vector3[];
  private readonly spacing: number;

  constructor(
    public readonly id: string,
    points: readonly (readonly [number, number, number])[],
    public readonly width: number,
    public readonly lanes: number,
  ) {
    if (points.length < 2) throw new Error(`Path "${id}" needs at least 2 points`);
    const curve = new CatmullRomCurve3(
      points.map((p) => new Vector3(p[0], p[1], p[2])),
      false,
      'centripetal',
    );
    this.length = curve.getLength();
    const n = Math.max(1, Math.round(this.length / SAMPLE_SPACING));
    this.spacing = this.length / n;
    this.samples = curve.getSpacedPoints(n);
  }

  /** Sideways offset of a lane's centre from the centre line. */
  laneOffset(lane: number): number {
    return (lane - (this.lanes - 1) / 2) * TUNING.truck.laneSpacing;
  }

  /** Unit direction of travel at `s`. */
  tangentAt(s: number, out: Vector3): Vector3 {
    const last = this.samples.length - 1;
    const i = Math.min(Math.max(Math.floor(s / this.spacing), 0), last - 1);
    return out.subVectors(this.samples[i + 1], this.samples[i]).normalize();
  }

  /** Point at `s`, shifted sideways by `offset` (positive = +X when heading +Z). */
  pointAt(s: number, offset: number, out: Vector3): Vector3 {
    const last = this.samples.length - 1;
    const f = s / this.spacing;
    const i = Math.min(Math.max(Math.floor(f), 0), last - 1);
    const a = this.samples[i];
    const b = this.samples[i + 1];
    const t = f - i; // may be < 0 or > 1 past the ends: straight extrapolation
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    out.x += (tz / len) * offset;
    out.z += (-tx / len) * offset;
    return out;
  }

  /** Nearest `s` to a position, searching around a previous value. */
  project(pos: Vector3, hintS: number): number {
    const last = this.samples.length - 1;
    const centre = Math.min(Math.max(Math.round(hintS / this.spacing), 0), last);
    let best = centre;
    let bestD = Infinity;
    const lo = Math.max(0, centre - PROJECT_WINDOW);
    const hi = Math.min(last, centre + PROJECT_WINDOW);
    for (let i = lo; i <= hi; i++) {
      const p = this.samples[i];
      const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // Refine along the local direction (also handles positions past the ends).
    const i = Math.min(Math.max(best, 0), last - 1);
    const a = this.samples[i];
    const b = this.samples[i + 1];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len2 = tx * tx + tz * tz || 1;
    const t = ((pos.x - a.x) * tx + (pos.z - a.z) * tz) / len2;
    return (i + t) * this.spacing;
  }

  /** Nearest `s` anywhere on the path (slower; for one-off lookups). */
  projectAnywhere(pos: Vector3): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i];
      const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return this.project(pos, best * this.spacing);
  }

  /** Signed sideways distance of a position from the centre line at `s`. */
  lateralAt(pos: Vector3, s: number): number {
    const p = this.pointAt(s, 0, tmp);
    const t = this.tangentAt(s, tmp2);
    return (pos.x - p.x) * t.z - (pos.z - p.z) * t.x;
  }
}

const tmp = new Vector3();
const tmp2 = new Vector3();
