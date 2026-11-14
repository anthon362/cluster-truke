import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { convoyTestLevel, singleTruckLevel } from '../src/level/testLevels';
import { initPhysics } from '../src/physics/world';
import type { MoveInput } from '../src/player/movement';
import { NO_INPUT } from '../src/player/movement';
import { Path } from '../src/trucks/path';
import { TRUCK_SHAPE, Truck } from '../src/trucks/truck';
import { input, run } from './helpers';

const T = TUNING.truck;
const P = TUNING.player;
const HZ = 1 / TUNING.loop.fixedStep;

beforeAll(async () => {
  await initPhysics();
});

describe('Path', () => {
  const path = new Path(
    'p',
    [
      [0, 0, 0],
      [0, 0, 100],
      [50, 0, 200],
    ],
    12,
    3,
  );

  it('measures distance along the curve and projects back', () => {
    expect(path.length).toBeGreaterThan(200);
    for (const s of [0, 37.5, 120, path.length - 1]) {
      const p = path.pointAt(s, 0, new Vector3());
      expect(path.project(p, s + 8)).toBeCloseTo(s, 1);
    }
  });

  it('offsets lanes sideways and symmetric about the centre', () => {
    expect(path.laneOffset(0)).toBeCloseTo(-T.laneSpacing);
    expect(path.laneOffset(1)).toBeCloseTo(0);
    expect(path.laneOffset(2)).toBeCloseTo(T.laneSpacing);
    const p = path.pointAt(10, 2, new Vector3());
    expect(path.lateralAt(p, 10)).toBeCloseTo(2, 3);
  });

  it('continues straight past the end', () => {
    const end = path.pointAt(path.length, 0, new Vector3());
    const beyond = path.pointAt(path.length + 50, 0, new Vector3());
    expect(beyond.distanceTo(end)).toBeCloseTo(50, 1);
  });
});

/** Scripted player: sprint along the convoy, hopping from trailer to trailer. */
export function bot(sim: Sim, dir: 1 | -1): MoveInput {
  const p = sim.player;
  const here = p.groundTruck ?? p.lastTruck!;
  const a = here.assignment;
  const next = sim.pool.find(a.convoy, a.row + dir, a.lane);
  // Face along the truck being aimed for and correct sideways error with strafe,
  // which is steadier than swinging the view around.
  const aimAt = !p.grounded && next ? next : here;
  const fwd = new Vector3(0, 0, dir).applyQuaternion(aimAt.rot);
  const yaw = Math.atan2(-fwd.x, -fwd.z);
  const side = new Vector3(1, 0, 0).applyQuaternion(aimAt.rot);
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const centre = TRUCK_SHAPE.trailer.centre.clone().applyQuaternion(aimAt.rot).add(aimAt.pos);
  const truckVel = aimAt.body.linvel();
  const err = p.pos.clone().sub(centre).dot(side);
  const errVel = (p.vel.x - truckVel.x) * side.x + (p.vel.z - truckVel.z) * side.z;
  const steer = Math.max(-1, Math.min(1, -(1.2 * err + 0.35 * errVel)));
  const moveS = steer * side.dot(right);
  const local = p.pos.clone().sub(here.pos).applyQuaternion(here.rot.clone().invert());
  // Predict where a full jump and a tapped (low) jump would land on the next truck,
  // measured along the direction of travel, and take whichever hits its trailer.
  const fullAir = (2 * P.jumpVelocity) / P.gravity;
  const along = local.z * dir - T.rowSpacing;
  const full = along + p.relativeSpeed * fullAir;
  const low = along + p.relativeSpeed * fullAir * P.jumpCutMultiplier;
  const lo = dir === 1 ? -4.3 : -1.5;
  const hi = dir === 1 ? 1.2 : 4.0;
  const inWindow = (x: number) => x >= lo && x <= hi;
  // Coyote time lets the bot jump just after running off a trailer, like a player would.
  const ready = (p.grounded || p.timeSinceGrounded <= P.coyoteTime * 0.6) && !!next;
  const fullJump = ready && inWindow(full);
  // A low jump from the cab cannot clear the next trailer's roof.
  const onTrailer = local.y - P.height / 2 > (T.trailerRoof + T.cabRoof) / 2;
  const lowJump = ready && !fullJump && onTrailer && inWindow(low);
  // Falling short of a roof: hold jump to climb the truck face instead.
  const climb = !p.grounded && p.timeSinceGrounded > 0.4 && p.feetY < T.trailerRoof + 0.3;
  const rising = !p.grounded && p.vel.y > p.frameVel.y && !botLow;
  if (fullJump) botLow = false;
  if (lowJump) botLow = true;
  return {
    ...NO_INPUT,
    yaw,
    // Above sprint speed, holding forward in the air leaves no air control
    // (speed is only ever added along the wish direction), so let go and strafe.
    moveF: !p.grounded && p.relativeSpeed > P.sprintSpeed ? 0 : 1,
    moveS,
    sprint: true,
    jumpHeld: fullJump || rising || climb,
    jumpPressed: fullJump || lowJump,
  };
}
let botLow = false;

describe('convoy', () => {
  it('60 trucks follow the curved road for 400 m', () => {
    const sim = new Sim({ seed: 11, god: true, level: convoyTestLevel(false) });
    expect(sim.trucks.length).toBe(60);
    const lead = sim.pool.find('main', 19, 1)!;
    const startS = lead.s;
    let steps = 0;
    const t0 = performance.now();
    while (lead.s - startS < 400 && steps < 40 * HZ) {
      sim.step(input());
      steps++;
    }
    const msPerStep = (performance.now() - t0) / steps;
    console.info(
      `convoy: ${steps} steps, ${msPerStep.toFixed(3)} ms/step, ${sim.explosions} explosions`,
    );
    expect(lead.s - startS).toBeGreaterThanOrEqual(400);
    const driving = sim.trucks.filter((t) => t.driving);
    expect(driving.length).toBeGreaterThanOrEqual(54);
    for (const t of driving) {
      const off = t.assignment.path.lateralAt(t.pos, t.s) - t.assignment.laneOffset;
      expect(Math.abs(off)).toBeLessThan(T.laneSpacing);
      expect(Number.isFinite(t.pos.x + t.pos.y + t.pos.z)).toBe(true);
    }
    expect(msPerStep).toBeLessThan(TUNING.loop.stepBudgetMs);
  });

  it('can be run from back to front and front to back', () => {
    let ok = 0;
    const report: string[] = [];
    for (const seed of [3, 4, 5]) {
      // Goal moved out of the way: this test is about traversal, not finishing.
      const far = {
        ...convoyTestLevel(false),
        goal: { pos: [10, 0, 9000], width: 18, height: 12 } as const,
      };
      const sim = new Sim({ seed, level: far });
      const rowOf = () => (sim.player.groundTruck ?? sim.player.lastTruck!).assignment.row;
      let guard = 0;
      while (!(sim.player.grounded && rowOf() === 19) && guard++ < 40 * HZ && sim.falls === 0) {
        sim.step(bot(sim, 1));
      }
      const reachedFront = sim.falls === 0 && rowOf() === 19;
      guard = 0;
      while (!(sim.player.grounded && rowOf() === 0) && guard++ < 60 * HZ && sim.falls === 0) {
        sim.step(bot(sim, -1));
      }
      if (reachedFront && sim.falls === 0 && rowOf() === 0) ok++;
      report.push(
        `seed ${seed}: front ${reachedFront}, falls ${sim.falls}, ended on row ${rowOf()}`,
      );
    }
    expect(report.join('; ') + ` => ${ok}/3`).toMatch(/=> 3\/3$/);
  });

  it('resets in place without creating bodies', () => {
    const sim = new Sim({ seed: 2, god: true, level: convoyTestLevel(true) });
    const bodies = sim.physics.bodyCount;
    const colliders = sim.physics.world.colliders.len();
    for (let i = 0; i < 20; i++) {
      run(sim, 90, input());
      sim.reset();
    }
    expect(sim.physics.bodyCount).toBe(bodies);
    expect(sim.physics.world.colliders.len()).toBe(colliders);
    expect(sim.trucks.every((t) => t.state === 'alive')).toBe(true);
    const lead = sim.pool.find('main', 19, 1)!;
    expect(lead.s).toBeCloseTo(10 + 19 * T.rowSpacing, 3);
  });

  it('gives different driver noise per attempt unless the seed is fixed', () => {
    const noise = (sim: Sim) => sim.trucks.map((t) => t.noiseSignature).join(';');
    const fixed = new Sim({ seed: 9, god: true, level: convoyTestLevel(false) });
    const a = noise(fixed);
    fixed.reset();
    expect(noise(fixed)).toBe(a);
    const free = new Sim({ god: true, level: convoyTestLevel(false) });
    const b = noise(free);
    free.reset();
    expect(noise(free)).not.toBe(b);
  });

  it('a fixed seed reproduces a run exactly from a fresh start', () => {
    const fingerprint = () => {
      const sim = new Sim({ seed: 9, god: true, level: convoyTestLevel(true) });
      run(sim, 600, input());
      return sim.trucks.map((t) => t.pos.x.toFixed(3) + '/' + t.pos.z.toFixed(3)).join();
    };
    expect(fingerprint()).toBe(fingerprint());
  });

  it('keeps its formation: rows stay within jumping distance', () => {
    const sim = new Sim({ seed: 13, god: true, level: convoyTestLevel(false) });
    let worst = 0;
    run(sim, 20 * HZ, input(), (i) => {
      if (i % 30 !== 0) return;
      for (const t of sim.trucks) {
        const ahead = sim.pool.find('main', t.assignment.row + 1, t.assignment.lane);
        if (ahead && t.driving && ahead.driving) worst = Math.max(worst, ahead.s - t.s);
      }
    });
    expect(worst).toBeLessThan(T.rowSpacing + 4);
  });
});

describe('pile-up', () => {
  it('a block on the road wrecks part of the convoy but not all of it', () => {
    const sim = new Sim({ seed: 21, god: true, level: convoyTestLevel(true) });
    let maxSpeed = 0;
    let wrecksSeen = 0;
    run(sim, 25 * HZ, input(), () => {
      for (const t of sim.trucks) {
        if (!t.isSolid) continue;
        const v = t.body.linvel();
        maxSpeed = Math.max(maxSpeed, Math.hypot(v.x, v.y, v.z));
      }
      wrecksSeen = Math.max(wrecksSeen, sim.trucks.filter((t) => t.state === 'wreck').length);
    });
    const blockS = 420;
    const passed = sim.trucks.filter((t) => t.driving && t.s > blockS + 60).length;
    console.info(
      `pile-up: ${sim.explosions} explosions, ${passed} trucks got past, max ${maxSpeed.toFixed(1)} m/s`,
    );
    expect(sim.explosions).toBeGreaterThanOrEqual(3);
    expect(wrecksSeen).toBeGreaterThanOrEqual(2);
    expect(passed).toBeGreaterThanOrEqual(15);
    expect(maxSpeed).toBeLessThanOrEqual(TUNING.physics.maxTruckSpeed + 0.01);
    // Wrecks are cleaned up after their lifetime.
    expect(sim.trucks.some((t) => t.state === 'gone')).toBe(true);
  });
});

describe('side cling', () => {
  function beside(sim: Sim, truck: Truck): void {
    // Hanging next to the trailer's left side, half way up, moving with the truck.
    const pos = new Vector3(-(T.width / 2 + P.radius + 0.05), 1.6, TRUCK_SHAPE.trailer.centre.z)
      .applyQuaternion(truck.rot)
      .add(truck.pos);
    const v = truck.body.linvel();
    sim.player.placeInAir(pos, new Vector3(v.x, v.y, v.z));
  }

  it('holding jump against a truck side climbs it and rides along', () => {
    const sim = new Sim({ seed: 1, god: true, level: singleTruckLevel() });
    const truck = sim.trucks[0];
    run(sim, 5, input());
    beside(sim, truck);
    const y0 = sim.player.pos.y;
    let clingSteps = 0;
    let topY = y0;
    // Lean toward the truck (it is to the right when facing forward... +X side is left of -X).
    const lean = input({ jumpHeld: true, yaw: -Math.PI / 2, moveF: 1 });
    run(sim, 60, lean, () => {
      if (sim.player.clinging) clingSteps++;
      topY = Math.max(topY, sim.player.pos.y);
    });
    expect(clingSteps).toBeGreaterThan(10);
    expect(topY - y0).toBeGreaterThan(1.5);
    // Ends up standing on the roof, still with the truck.
    run(sim, 40, input());
    expect(sim.player.grounded).toBe(true);
    expect(sim.player.feetY).toBeGreaterThan(T.trailerRoof - 0.1);
  });

  it('without jump held the player just falls', () => {
    const sim = new Sim({ seed: 1, god: true, level: singleTruckLevel() });
    run(sim, 5, input());
    beside(sim, sim.trucks[0]);
    const y0 = sim.player.pos.y;
    run(sim, 10, input());
    expect(sim.player.pos.y).toBeLessThan(y0 - 0.1);
    expect(sim.player.clinging).toBe(false);
  });

  it('tapping jump on a side kicks up and away', () => {
    const sim = new Sim({ seed: 1, god: true, level: singleTruckLevel() });
    run(sim, 5, input());
    beside(sim, sim.trucks[0]);
    run(sim, 2, input());
    sim.step(input({ jumpPressed: true }));
    expect(sim.player.vel.y).toBeGreaterThan(P.clingTapUp - 1);
    expect(sim.player.vel.x).toBeLessThan(-P.clingTapAway + 0.5);
  });
});

describe('explosions', () => {
  it('push the player without killing', () => {
    const sim = new Sim({ seed: 1, god: true, level: singleTruckLevel() });
    run(sim, 5, input());
    const before = sim.player.vel.clone();
    sim.player.blast(sim.player.pos.clone().add(new Vector3(0, -2, 0)));
    expect(sim.player.grounded).toBe(false);
    expect(sim.player.vel.y - before.y).toBeGreaterThan(5);
    expect(sim.falls).toBe(0);
  });
});
