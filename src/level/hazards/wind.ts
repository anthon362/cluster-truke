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

  /** Streaks fly across the zone in the wind's direction, each on its own line. */
  private draw(t: number): void {
    const def = this.def;
    const s = windStateAt(def, t, this.state);
    const show = s.on || s.warning;
    const w = def.size[0];
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      part.prevPos.copy(part.pos);
      // Golden-ratio scatter: evenly spread without looking like a grid.
      const a = (i * 0.618034) % 1;
      const b = (i * 0.381966 + 0.27) % 1;
      const c = (i * 0.754878 + 0.61) % 1;
      const travel = (((t * H.windStreakSpeed * (0.7 + 0.6 * c)) / w + a) % 1) * this.dir;
      const x = def.pos[0] + (((travel + 1) % 1) - 0.5) * w;
      part.pos.set(x, def.pos[1] + 1 + c * H.windStreakTop, def.pos[2] + (b - 0.5) * def.size[1]);
      // A streak that wrapped around jumps across the zone: do not draw the jump.
      if (Math.abs(part.pos.x - part.prevPos.x) > w / 2) part.prevPos.copy(part.pos);
      // Before a gust only a few show, as a warning.
      part.visible = show && (s.on || i % 3 === 0);
    }
  }
}
