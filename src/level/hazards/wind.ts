import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { PALETTE } from '../../render/palette';
import type { WindDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const push = new Vector3();

export interface WindState {
  /** Blowing right now. */
  on: boolean;
  /** About to start blowing: streaks show but nothing is pushed yet. */
  warning: boolean;
}

/** Is the wind blowing at time `t`? A pure function of the level data and the clock. */
export function windStateAt(def: WindDef, t: number, out: WindState): WindState {
  if (!def.gust) {
    out.on = true;
    out.warning = false;
    return out;
  }
  const cycle = def.gust.on + def.gust.off;
  const at = (((t + (def.gust.phase ?? 0) * cycle) % cycle) + cycle) % cycle;
  out.on = at < def.gust.on;
  out.warning = !out.on && cycle - at <= H.windWarning;
  return out;
}

/** Is the point inside the zone the wind blows through? */
export function inWind(def: WindDef, x: number, y: number, z: number): boolean {
  return (
    Math.abs(x - def.pos[0]) <= def.size[0] / 2 &&
    Math.abs(z - def.pos[2]) <= def.size[1] / 2 &&
    y >= def.pos[1] &&
    y <= def.pos[1] + H.windHeight
  );
}

/**
 * A crosswind over a stretch of road. It pushes the player sideways, hard in
 * the air and gently on a roof, and leans on the trucks. It can blow all the
 * time or in gusts; white streaks show where and which way, and appear a
 * moment before a gust starts.
 */
export class Wind implements Hazard {
  readonly parts: HazardPart[] = [];
  private readonly state: WindState = { on: true, warning: false };
  private readonly dir: number;

  constructor(
    private readonly def: WindDef,
    private readonly ctx: HazardContext,
  ) {
    this.dir = Math.sign(def.force) || 1;
    for (let i = 0; i < H.windStreaks; i++) {
      this.parts.push({
        size: new Vector3(H.windStreakLength, H.windStreakThickness, H.windStreakThickness),
        color: PALETTE.wind,
        glow: true,
        visible: false,
        prevPos: new Vector3(),
        prevRot: new Quaternion(),
        pos: new Vector3(),
        rot: new Quaternion(),
      });
    }
    this.reset();
  }

  reset(): void {
    this.draw(0);
    for (const p of this.parts) p.prevPos.copy(p.pos);
  }

  update(dt: number): void {
    const def = this.def;
    if (!windStateAt(def, this.ctx.time(), this.state).on) return;
    const p = this.ctx.player;
    if (inWind(def, p.pos.x, p.pos.y, p.pos.z) && !(p.magnet && p.grounded)) {
      const share = p.grounded || p.clinging ? H.windGroundShare : 1;
      p.push(push.set(def.force * share * dt, 0, 0));
    }
    for (const t of this.ctx.trucks) {
      if (!t.driving || t.assignment.float) continue;
      if (!inWind(def, t.pos.x, t.pos.y, t.pos.z)) continue;
      t.shove(push.set(def.force * H.windTruckShare * dt, 0, 0), 0);
    }
  }

  afterStep(): void {
    this.draw(this.ctx.time());
  }

  dispose(): void {}

  /** Streaks fly across the road near the player in the wind's direction, each on its own line. */
  private draw(t: number): void {
    const def = this.def;
    const s = windStateAt(def, t, this.state);
    const show = s.on || s.warning;
    const w = Math.min(def.size[0], H.windStreakSide * 2);
    const zMin = def.pos[2] - def.size[1] / 2;
    const zMax = def.pos[2] + def.size[1] / 2;
    // Lines are fixed in the world (spaced along the road), and only those near the player are used.
    const spacing = H.windStreakSpan / this.parts.length;
    const first = Math.floor((this.ctx.player.pos.z - H.windStreakSpan * 0.35) / spacing);
    for (let i = 0; i < this.parts.length; i++) {
      const n = first + i;
      const slot = ((n % this.parts.length) + this.parts.length) % this.parts.length;
      const target = this.parts[slot];
      // Golden-ratio scatter: evenly spread without looking like a grid.
      const a = (((n * 0.618034) % 1) + 1) % 1;
      const c = (((n * 0.754878 + 0.61) % 1) + 1) % 1;
      const travel = ((t * H.windStreakSpeed * (0.7 + 0.6 * c)) / w + a) % 1;
      const across = (this.dir > 0 ? travel : 1 - travel) - 0.5;
      const z = n * spacing;
      target.prevPos.copy(target.pos);
      target.pos.set(def.pos[0] + across * w, def.pos[1] + 2.5 + c * H.windStreakTop, z);
      // A streak that wrapped around or moved to a new line jumps: do not draw the jump.
      if (target.pos.distanceToSquared(target.prevPos) > 9) target.prevPos.copy(target.pos);
      // Before a gust only a few show, as a warning.
      target.visible = show && z >= zMin && z <= zMax && (s.on || slot % 3 === 0);
    }
  }
}
