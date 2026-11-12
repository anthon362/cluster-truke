/**
 * Scripted no-ability players used to demonstrate that levels can be finished.
 * They are deliberately simple: each one does what a careful human would do
 * for one kind of obstacle.
 */
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { type BeamState, beamHalfExtents, beamStateAt } from '../src/level/hazards/beam';
import type { BeamDef, LevelDef, RotorDef } from '../src/level/schema';
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
export const hopLane =
  (at: number, side: 1 | -1, sprint = false) =>
  (): Script =>
  (sim, t) => {
    if (t < at || t > at + 0.6) return null;
    const first = t < at + TUNING.loop.fixedStep * 1.5;
    // A low jump (tap) covers about one lane at walking speed, more when sprinting.
    return toward(side, 0, { sprint, jumpPressed: first && sim.player.grounded });
  };

/**
 * Hop sideways onto another convoy running alongside at the same height.
 * Waits (from `after`) until one of its trailers is right beside the player,
 * the way a person would look before jumping. With `fullJump` it is a held
 * jump that pushes off for the first half and steers back for the second, so
 * it covers about 6.7 m and lands without sliding off the far side.
 */
export const hopTo =
  (convoy: string, after: number, side: 1 | -1, sprint = false, fullJump = false) =>
  (): Script => {
    let start = -1;
    let jumped = false;
    return (sim, t) => {
      const p = sim.player;
      const truck = p.groundTruck ?? p.lastTruck;
      if (truck?.assignment.convoy === convoy && p.grounded) {
        // Landed: kill any leftover sideways slide.
        const slide = (p.vel.x - truck.body.linvel().x) * side;
        return slide > 1.5 ? toward(-side, 0) : null;
      }
      if (start >= 0) {
        const dt = t - start;
        if (!fullJump) {
          if (dt > 0.6) return null;
          const first = !jumped && p.grounded;
          jumped = jumped || first;
          return toward(side, 0, { sprint, jumpPressed: first });
        }
        if (dt > 1.2) return null;
        const first = !jumped && p.grounded;
        jumped = jumped || first;
        const pushing = dt < 0.6;
        return toward(pushing ? side : -side, 0, {
          sprint: pushing && sprint,
          jumpPressed: first,
          jumpHeld: true,
        });
      }
      if (t < after || !p.grounded) return null;
      for (const other of sim.trucks) {
        if (other.assignment.convoy !== convoy || !other.isSolid) continue;
        // Trailer centre is 1.4 m behind the truck's middle.
        const dx = (other.pos.x - p.pos.x) * side;
        // Where that trailer will be, relative to us, when the hop lands.
        const air = fullJump ? 0.9 : 0.45;
        const dz = other.pos.z - 1.4 - p.pos.z + (other.body.linvel().z - p.vel.z) * air;
        if (Math.abs(dz) < 1.5 && dx > 2 && dx < 10) {
          start = t;
          return toward(side, 0, { sprint });
        }
      }
      return null;
    };
  };

/**
 * Leave the current convoy for another one that runs lower down and to one
 * side: run off the truck sideways (no jump needed), then steer in the air so
 * the predicted landing spot is on the nearest lane of the target convoy, and
 * hold jump near the end to grab a side if it comes up short.
 */
export const dropTo =
  (convoy: string, after: number, side: 1 | -1, sprint = true) =>
  (): Script =>
  (sim, t) => {
    const p = sim.player;
    const on = (p.groundTruck ?? p.lastTruck)?.assignment.convoy;
    if (p.grounded && on === convoy) return null;
    if (t < after) return null;
    if (p.grounded) return toward(side, 0, { sprint });
    // Roof height of the target convoy near here.
    let roof = -Infinity;
    for (const truck of sim.trucks) {
      if (truck.assignment.convoy !== convoy || !truck.isSolid) continue;
      if (Math.abs(truck.pos.z - p.pos.z) < 40) roof = Math.max(roof, truck.pos.y + T.trailerRoof);
    }
    if (roof === -Infinity) return null;
    // When and where we come down if nothing changes.
    const h = Math.max(0, p.feetY - roof);
    const fall = (p.vel.y + Math.sqrt(p.vel.y * p.vel.y + 2 * P.gravity * h)) / P.gravity;
    const landX = p.pos.x + p.vel.x * fall;
    const landZ = p.pos.z + p.vel.z * fall;
    // Aim for the trailer that will be nearest to that spot.
    let best = null as null | { x: number; z: number };
    let bestD = Infinity;
    for (const truck of sim.trucks) {
      if (truck.assignment.convoy !== convoy || !truck.isSolid) continue;
      const v = truck.body.linvel();
      const x = truck.pos.x + v.x * fall;
      const z = truck.pos.z + v.z * fall - 1.4;
      const d = Math.abs(x - landX) + Math.abs(z - landZ) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
    if (!best) return null;
    const ex = best.x - landX;
    const ez = best.z - landZ;
    const grab = p.feetY < roof + 1.5;
    const heading = (p.lastTruck ?? sim.trucks[0]).body.linvel();
    if (Math.abs(ex) < 0.5 && Math.abs(ez) < 1.5) {
      return { ...NO_INPUT, yaw: Math.atan2(-heading.x, -heading.z), jumpHeld: grab };
    }
    // Correct sideways first; fore-aft only once that is close.
    const dz = Math.abs(ex) < 1 ? ez : ez * 0.3;
    return toward(ex, dz, { sprint: Math.abs(ex) > 3, jumpHeld: grab });
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

const beamState: BeamState = { x: 0, y: 0, z: 0, yaw: 0, on: true, warning: false };

/**
 * Would someone standing with their feet at (x, feet, z) be inside a lit beam
 * at time `at`? Uses the same beam maths as the game.
 */
export function inBeam(def: BeamDef, x: number, feet: number, z: number, at: number): boolean {
  const s = beamStateAt(def, at, beamState);
  if (!s.on) return false;
  const half = beamHalfExtents(def);
  const dx = x - s.x;
  const dz = z - s.z;
  const lx = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw);
  const lz = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
  const margin = P.radius + 0.1;
  return (
    Math.abs(lx) <= half.x + margin &&
    Math.abs(lz) <= half.z + margin &&
    feet + P.height + 0.05 >= s.y - half.y &&
    feet - 0.05 <= s.y + half.y
  );
}

const beamsOf = (sim: Sim): BeamDef[] =>
  sim.level.hazards.filter((h): h is BeamDef => h.type === 'beam');

/** Height a full jump adds at its top. */
const JUMP_RISE = (P.jumpVelocity * P.jumpVelocity) / (2 * P.gravity);

/**
 * Jump over beams: if staying on the roof would put the rider in a beam about
 * half a second from now, but being at the top of a jump would not, jump now.
 */
export const hopBeams = (): Script => {
  let holdUntil = -1;
  return (sim, t) => {
    const p = sim.player;
    if (t < holdUntil) return { ...NO_INPUT, yaw: Math.PI, jumpHeld: true };
    if (!p.grounded) return null;
    const beams = beamsOf(sim);
    // The top of a jump is 0.45 s after take-off.
    for (const lead of [0.38, 0.45, 0.52]) {
      const x = p.pos.x + p.vel.x * lead;
      const z = p.pos.z + p.vel.z * lead;
      const hit = beams.some((b) => inBeam(b, x, p.feetY, z, t + lead));
      if (!hit) continue;
      const clear = !beams.some((b) => inBeam(b, x, p.feetY + JUMP_RISE - 0.5, z, t + lead));
      if (clear) {
        holdUntil = t + 0.75;
        return { ...NO_INPUT, yaw: Math.PI, jumpPressed: true, jumpHeld: true };
      }
    }
    return null;
  };
};

/**
 * Beams that cannot be jumped (standing columns): look a couple of seconds
 * ahead, and if this lane will be in one when we get there, hop to a
 * neighbouring lane that will not.
 */
export const dodgeBeams = (): Script => {
  let hop: { until: number; side: 1 | -1; started: boolean } | null = null;
  let quietUntil = 0;
  /** Will a rider at sideways position x run into a beam they cannot jump, between `from` and `to` seconds ahead? */
  const blocked = (sim: Sim, x: number, t: number, from: number, to: number): boolean => {
    const p = sim.player;
    for (let lead = from; lead <= to; lead += 0.1) {
      const z = p.pos.z + p.vel.z * lead;
      for (const b of beamsOf(sim)) {
        if (
          inBeam(b, x, p.feetY, z, t + lead) &&
          inBeam(b, x, p.feetY + JUMP_RISE - 0.5, z, t + lead)
        ) {
          return true;
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
    if (!p.grounded || t < quietUntil || p.vel.z < 1 || !p.groundTruck) return null;
    if (!blocked(sim, p.pos.x, t, 0.5, 1.6)) return null;
    const here = p.groundTruck.assignment;
    for (const side of [1, -1] as const) {
      const hasTruck = !!sim.pool.find(here.convoy, here.row, here.lane + side);
      if (hasTruck && !blocked(sim, p.pos.x + side * T.laneSpacing, t, 0.4, 2.0)) {
        hop = { until: t + 0.6, side, started: false };
        quietUntil = t + 1.2;
        return toward(side, 0);
      }
    }
    return null;
  };
};

/** Walk forward off the trailer onto the truck's cab, which is lower, and stay there. */
export const toCab = (): Script => {
  let step = 0;
  return (sim) => {
    const p = sim.player;
    const truck = p.groundTruck ?? p.lastTruck;
    if (!truck) return null;
    const onCab = p.grounded && p.feetY < truck.pos.y + (T.trailerRoof + T.cabRoof) / 2;
    if (onCab) return null;
    // Short taps: slow enough to drop onto the cab instead of overshooting it.
    step++;
    const fwd = truck.body.linvel();
    return { ...NO_INPUT, yaw: Math.atan2(-fwd.x, -fwd.z), moveF: step % 6 < 2 ? 1 : 0 };
  };
};
