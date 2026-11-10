import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { TEST_LEVELS } from '../src/level/levels';
import { initPhysics } from '../src/physics/world';
import { Path } from '../src/trucks/path';
import { TRUCK_SHAPE, Truck } from '../src/trucks/truck';
import { bot, input, run } from './helpers';

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

describe('convoy', () => {
  it('60 trucks follow the curved road for 400 m', () => {
    const sim = new Sim({ seed: 11, god: true, level: TEST_LEVELS.convoy });
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
        ...TEST_LEVELS.convoy,
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
    const sim = new Sim({ seed: 2, god: true, level: TEST_LEVELS.block });
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
    const fixed = new Sim({ seed: 9, god: true, level: TEST_LEVELS.convoy });
    const a = noise(fixed);
    fixed.reset();
    expect(noise(fixed)).toBe(a);
    const free = new Sim({ god: true, level: TEST_LEVELS.convoy });
    const b = noise(free);
    free.reset();
    expect(noise(free)).not.toBe(b);
  });

  it('a fixed seed reproduces a run exactly from a fresh start', () => {
    const fingerprint = () => {
      const sim = new Sim({ seed: 9, god: true, level: TEST_LEVELS.block });
      run(sim, 600, input());
      return sim.trucks.map((t) => t.pos.x.toFixed(3) + '/' + t.pos.z.toFixed(3)).join();
    };
    expect(fingerprint()).toBe(fingerprint());
  });

  it('keeps its formation: rows stay within jumping distance', () => {
    const sim = new Sim({ seed: 13, god: true, level: TEST_LEVELS.convoy });
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
    const sim = new Sim({ seed: 21, god: true, level: TEST_LEVELS.block });
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
    const sim = new Sim({ seed: 1, god: true, level: TEST_LEVELS.single });
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

  it('hanging at the top edge of the back of a truck always gets onto the roof', () => {
    const sim = new Sim({ seed: 1, god: true, level: TEST_LEVELS.single });
    const truck = sim.trucks[0];
    run(sim, 5, input());
    // Feet just below roof height, touching the rear face: the awkward spot.
    const pos = new Vector3(
      0,
      T.trailerRoof - 0.2 + P.height / 2,
      -T.length / 2 - P.radius - 0.03,
    ).add(truck.pos);
    const v = truck.body.linvel();
    sim.player.placeInAir(pos, new Vector3(v.x, v.y, v.z));
    let stoodAt = -1;
    run(sim, 30, input({ jumpHeld: true, moveF: 1 }), (i) => {
      if (stoodAt < 0 && sim.player.grounded) stoodAt = i;
    });
    expect(stoodAt).toBeGreaterThanOrEqual(0);
    expect(stoodAt).toBeLessThan(24);
    expect(sim.player.feetY).toBeGreaterThan(T.trailerRoof - 0.05);
  });

  it('without jump held the player just falls', () => {
    const sim = new Sim({ seed: 1, god: true, level: TEST_LEVELS.single });
    run(sim, 5, input());
    beside(sim, sim.trucks[0]);
    const y0 = sim.player.pos.y;
    run(sim, 10, input());
    expect(sim.player.pos.y).toBeLessThan(y0 - 0.1);
    expect(sim.player.clinging).toBe(false);
  });

  it('tapping jump on a side kicks up and away', () => {
    const sim = new Sim({ seed: 1, god: true, level: TEST_LEVELS.single });
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
    const sim = new Sim({ seed: 1, god: true, level: TEST_LEVELS.single });
    run(sim, 5, input());
    const before = sim.player.vel.clone();
    sim.player.blast(sim.player.pos.clone().add(new Vector3(0, -2, 0)));
    expect(sim.player.grounded).toBe(false);
    expect(sim.player.vel.y - before.y).toBeGreaterThan(5);
    expect(sim.falls).toBe(0);
  });
});
