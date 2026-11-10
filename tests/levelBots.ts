/**
 * Scripted no-ability players used to demonstrate that levels can be finished.
 * They are deliberately simple: each one does what a careful human would do
 * for one kind of obstacle.
 */
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import type { LevelDef, RotorDef } from '../src/level/schema';
import { NO_INPUT, type MoveInput } from '../src/player/movement';
import { bot } from './helpers';

const HZ = 1 / TUNING.loop.fixedStep;
const P = TUNING.player;
const T = TUNING.truck;
const DEG = Math.PI / 180;

/** What a scripted player does at time `t`. Returning null means "nothing to do: just ride". */
export type Script = (sim: Sim, t: number) => MoveInput | null;

/** Input that walks toward a world-space direction. */
export function toward(dx: number, dz: number, extra: Partial<MoveInput> = {}): MoveInput {
  return { ...NO_INPUT, yaw: Math.atan2(-dx, -dz), moveF: 1, ...extra };
}

export interface Outcome {
  seed: number;
  won: boolean;
  time: number;
  reason: string;
}

export function play(level: LevelDef, makeScript: () => Script, seed: number): Outcome {
  const sim = new Sim({ seed, level });
  const script = makeScript();
  const limit = level.parTime * 4 * HZ;
  for (let i = 0; i < limit && sim.state === 'playing'; i++) {
    sim.step(script(sim, sim.time) ?? NO_INPUT);
  }
  return {
    seed,
    won: sim.state === 'won',
    time: sim.time,
    reason: sim.failReason ?? (sim.state === 'playing' ? 'timeout' : ''),
  };
}

export function summary(level: LevelDef, label: string, results: Outcome[]): string {
  const wins = results.filter((r) => r.won);
  const best = wins.length ? Math.min(...wins.map((r) => r.time)).toFixed(1) : '-';
  const fails = results
    .filter((r) => !r.won)
    .map((r) => `seed ${r.seed}: ${r.reason} at ${r.time.toFixed(1)}s`);
  return `${level.id} ${label}: ${wins.length}/${results.length} wins, best ${best}s, par ${level.parTime}s${fails.length ? ' [' + fails.join('; ') + ']' : ''}`;
}

/** Use the first script that has something to do this step. */
export function either(...makers: (() => Script)[]): () => Script {
  return () => {
    const scripts = makers.map((m) => m());
    return (sim, t) => {
      for (const s of scripts) {
        const out = s(sim, t);
        if (out) return out;
      }
      return null;
    };
  };
}

export const ride = (): Script => () => null;

/** Run the convoy forward; once on the lead row there is nothing to hop to, so ride. */
export const runForward = (): Script => (sim) => {
  const here = sim.player.groundTruck ?? sim.player.lastTruck!;
  const a = here.assignment;
  const hasNext = !!sim.pool.find(a.convoy, a.row + 1, a.lane);
  return hasNext || !sim.player.grounded ? bot(sim, 1) : null;
};

/** One sideways hop to the next lane at time `at` (+1 = toward +X). */
export const hopLane = (at: number, side: 1 | -1) => (): Script => (sim, t) => {
  if (t < at || t > at + 0.6) return null;
  const first = t < at + TUNING.loop.fixedStep * 1.5;
  // A low jump (tap) covers about one lane at walking speed.
  return toward(side, 0, { jumpPressed: first && sim.player.grounded });
};

/**
 * Leave the current convoy for another one that runs lower down and to one
 * side: sprint off the truck sideways (no jump needed), line up with the
 * nearest lane of the target convoy while falling, and grab a side if short.
 */
export const dropTo = (convoy: string, after: number, side: 1 | -1) => (): Script => (sim, t) => {
  const p = sim.player;
  const on = (p.groundTruck ?? p.lastTruck)?.assignment.convoy;
  if (p.grounded && on === convoy) return null;
  if (t < after) return null;
  if (p.grounded) return toward(side, 0, { sprint: true });
  // Nearest truck of the target convoy gives the lane to aim for and its roof height.
  let best = null as null | { x: number; y: number };
  let bestD = Infinity;
  for (const truck of sim.trucks) {
    if (truck.assignment.convoy !== convoy || !truck.isSolid) continue;
    const d = Math.abs(truck.pos.z - p.pos.z) * 0.3 + Math.abs(truck.pos.x - p.pos.x);
    if (d < bestD) {
      bestD = d;
      best = { x: truck.pos.x, y: truck.pos.y + T.trailerRoof };
    }
  }
  if (!best) return null;
  const dx = best.x - p.pos.x;
  const falling = p.feetY < best.y + 2;
  const heading = (p.lastTruck ?? sim.trucks[0]).body.linvel();
  if (Math.abs(dx) > 2.5) return toward(Math.sign(dx), 0, { sprint: true, jumpHeld: falling });
  if (Math.abs(dx) > 1) return toward(Math.sign(dx), 0, { jumpHeld: falling });
  return { ...NO_INPUT, yaw: Math.atan2(-heading.x, -heading.z), jumpHeld: falling };
};

/** Jump overhead beams that would hit a rider: a full jump timed to be at its top over the beam. */
export const hopBars = (): Script => {
  let holdUntil = -1;
  return (sim, t) => {
    const p = sim.player;
    if (t < holdUntil) return { ...NO_INPUT, yaw: Math.PI, jumpHeld: true };
    if (!p.grounded) return null;
    const vz = p.vel.z;
    if (vz < 1) return null;
    for (const s of sim.level.scenery) {
      // A beam: wide, thin along the road, and at body height for someone on this roof.
      if (s.size[0] < 2.5 || s.size[2] > 1.5) continue;
      const bottom = s.pos[1] - s.size[1] / 2;
      const top = s.pos[1] + s.size[1] / 2;
      if (top < p.feetY + 0.2 || bottom > p.feetY + P.height + 0.1) continue;
      if (Math.abs(p.pos.x - s.pos[0]) > s.size[0] / 2 + P.radius) continue;
      const arrive = (s.pos[2] - p.pos.z) / vz;
      // The top of a jump is 0.45 s after take-off.
      if (arrive > 0.38 && arrive < 0.5) {
        holdUntil = t + 0.75;
        return { ...NO_INPUT, yaw: Math.PI, jumpPressed: true, jumpHeld: true };
      }
    }
    return null;
  };
};

/**
 * Rotors: a few seconds before reaching one, work out where its spokes will
 * be on arrival. If the current lane will be swept, hop to a neighbouring
 * lane that will not be.
 */
export const dodgeRotors = (): Script => {
  let hop: { until: number; side: 1 | -1; started: boolean } | null = null;
  const decided = new Set<number>();
  /** Will a rider at sideways position x be hit, arriving at time `at`? */
  const swept = (r: RotorDef, x: number, feet: number, at: number): boolean => {
    for (const dt of [-0.2, -0.1, 0, 0.1, 0.2]) {
      const base = ((r.phase ?? 0) + r.speed * (at + dt)) * DEG;
      for (let i = 0; i < r.spokes; i++) {
        const a = base + (i / r.spokes) * Math.PI * 2;
        // The spoke runs from the hub along (sin a, -cos a).
        const dx = Math.sin(a);
        const dy = -Math.cos(a);
        for (let d = 0; d <= r.radius; d += 0.25) {
          const sx = r.pos[0] + dx * d;
          const sy = r.pos[1] + dy * d;
          if (Math.abs(sx - x) < 1.0 && sy > feet - 0.3 && sy < feet + P.height + 0.4) return true;
        }
      }
    }
    return false;
  };
  return (sim, t) => {
    const p = sim.player;
    if (hop) {
      if (t > hop.until) hop = null;
      else {
        const first = !hop.started && p.grounded;
        hop.started = hop.started || first;
        return toward(hop.side, 0, { jumpPressed: first });
      }
    }
    if (!p.grounded || p.vel.z < 1) return null;
    sim.level.hazards.forEach((h, index) => {
      if (h.type !== 'rotor' || decided.has(index) || hop) return;
      const arrive = (h.pos[2] - p.pos.z) / p.vel.z;
      if (arrive < 1.2 || arrive > 2.6) return;
      decided.add(index);
      const at = t + arrive;
      if (!swept(h, p.pos.x, p.feetY, at)) return;
      const here = p.groundTruck!.assignment;
      for (const side of [1, -1] as const) {
        const x = p.pos.x + side * T.laneSpacing;
        const hasTruck = !!sim.pool.find(here.convoy, here.row, here.lane + side);
        if (hasTruck && !swept(h, x, p.feetY, at + 0.5)) {
          hop = { until: t + 0.6, side, started: false };
          return;
        }
      }
    });
    return null;
  };
};
