import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { emptySave, loadSave, recordTime, SAVE_KEY, storeSave } from '../src/core/save';
import { Sim } from '../src/core/sim';
import { Goal } from '../src/level/goal';
import { TEST_LEVELS } from '../src/level/levels';
import { initPhysics } from '../src/physics/world';
import { formatTime } from '../src/ui/format';
import { input, run } from './helpers';

const T = TUNING.truck;
const P = TUNING.player;
const HZ = 1 / TUNING.loop.fixedStep;

beforeAll(async () => {
  await initPhysics();
});

describe('Goal gate', () => {
  const goal = new Goal({ pos: [0, 0, 100], width: 10, height: 8, yaw: 0 }, []);
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

  it('is crossed in either direction, on the ground or in the air', () => {
    expect(goal.crossed(v(0, 1, 99), v(0, 1, 101))).toBe(true);
    expect(goal.crossed(v(0, 1, 101), v(0, 1, 99))).toBe(true);
    expect(goal.crossed(v(3, 7.5, 99.9), v(3, 7.4, 100.2))).toBe(true);
  });

  it('is not crossed beside, above or short of it', () => {
    expect(goal.crossed(v(8, 1, 99), v(8, 1, 101))).toBe(false);
    expect(goal.crossed(v(0, 12, 99), v(0, 12, 101))).toBe(false);
    expect(goal.crossed(v(0, 1, 90), v(0, 1, 99))).toBe(false);
    expect(goal.crossed(v(-2, 1, 100), v(2, 1, 100))).toBe(false);
  });

  it('faces along the nearest path when no yaw is given', () => {
    const sim = new Sim({ seed: 1, level: TEST_LEVELS.single });
    expect(sim.goal.normal.z).toBeCloseTo(1, 3);
  });
});

describe('winning', () => {
  it('riding the truck through the gate wins and stops the timer', () => {
    const sim = new Sim({ seed: 1, level: TEST_LEVELS.single });
    let wonEvents = 0;
    let guard = 0;
    while (sim.state === 'playing' && guard++ < 40 * HZ) {
      sim.step(input());
      wonEvents += sim.events.filter((e) => e.type === 'won').length;
    }
    expect(sim.state).toBe('won');
    expect(wonEvents).toBe(1);
    const startZ = -1.4;
    expect(sim.time).toBeCloseTo((400 - startZ) / T.cruiseSpeed, 0);
    const finish = sim.time;
    // After the win nothing can fail the attempt and the clock stays put.
    run(sim, 120, input({ moveS: 1, sprint: true }));
    expect(sim.state).toBe('won');
    expect(sim.time).toBe(finish);
  });

  it('counts when passing through airborne', () => {
    const sim = new Sim({ seed: 1, level: TEST_LEVELS.single });
    run(sim, 5, input());
    sim.player.placeInAir(new Vector3(0, 9, 399), new Vector3(0, 0, 20));
    run(sim, 6, input());
    expect(sim.state).toBe('won');
  });
});

describe('failing', () => {
  it('touching the ground fails; the player freezes while trucks drive on', () => {
    const sim = new Sim({ seed: 1, level: TEST_LEVELS.single });
    let failedEvents = 0;
    run(sim, 300, input({ moveS: 1, sprint: true }), () => {
      failedEvents += sim.events.filter((e) => e.type === 'failed').length;
    });
    expect(sim.state).toBe('failed');
    expect(sim.failReason).toBe('ground');
    expect(failedEvents).toBe(1);
    expect(sim.falls).toBe(1);
    const at = sim.player.pos.clone();
    const time = sim.time;
    const truckZ = sim.trucks[0].pos.z;
    run(sim, 60, input({ moveF: 1 }));
    expect(sim.player.pos.distanceTo(at)).toBe(0);
    expect(sim.time).toBe(time);
    expect(sim.trucks[0].pos.z).toBeGreaterThan(truckZ + 10);
  });

  it('standing on a truck never fails, even for a long ride', () => {
    const sim = new Sim({ seed: 5, level: TEST_LEVELS.convoy });
    run(sim, 20 * HZ, input());
    expect(sim.state).toBe('playing');
  });

  it('lethal scenery fails even while riding a truck', () => {
    const sim = new Sim({ seed: 21, level: TEST_LEVELS.block });
    run(sim, 3, input());
    // Drop the player into the block.
    sim.player.placeInAir(new Vector3(45, 1.75, 400), new Vector3());
    run(sim, 10, input());
    expect(sim.state).toBe('failed');
    expect(sim.failReason).toBe('scenery');
  });

  it('a lethal touch shorter than the grace time is forgiven', () => {
    const sim = new Sim({ seed: 21, level: TEST_LEVELS.block });
    run(sim, 3, input());
    // Clip the block's top corner for a single step, then be gone.
    const graceSteps = Math.floor(P.lethalGrace * HZ);
    sim.player.placeInAir(new Vector3(45, 3.5 + 0.7, 400), new Vector3(0, 30, 0));
    run(sim, Math.max(1, graceSteps - 1), input());
    expect(sim.state).toBe('playing');
  });

  it('falling below the kill height fails', () => {
    const sim = new Sim({ seed: 1, level: TEST_LEVELS.single });
    run(sim, 3, input());
    sim.player.placeInAir(new Vector3(0, -20, 50), new Vector3());
    run(sim, 2, input());
    expect(sim.failReason).toBe('fell');
  });

  it('god mode never fails', () => {
    const sim = new Sim({ seed: 1, god: true, level: TEST_LEVELS.single });
    run(sim, 300, input({ moveS: 1, sprint: true }));
    expect(sim.state).toBe('playing');
  });
});

describe('instant restart', () => {
  it('50 restarts leave bodies, colliders and state clean, and are fast', () => {
    const sim = new Sim({ seed: 21, level: TEST_LEVELS.block });
    const bodies = sim.physics.bodyCount;
    const colliders = sim.physics.world.colliders.len();
    let worst = 0;
    for (let i = 0; i < 50; i++) {
      // Vary how far each attempt gets, including into the pile-up.
      run(
        sim,
        i % 10 === 9 ? 600 : 20 + i * 5,
        input({ moveS: i % 3 === 0 ? 1 : 0, sprint: true }),
      );
      const t0 = performance.now();
      sim.reset();
      worst = Math.max(worst, performance.now() - t0);
      expect(sim.state).toBe('playing');
      expect(sim.time).toBe(0);
      expect(sim.player.grounded).toBe(true);
    }
    expect(sim.physics.bodyCount).toBe(bodies);
    expect(sim.physics.world.colliders.len()).toBe(colliders);
    expect(sim.trucks.every((t) => t.state === 'alive')).toBe(true);
    expect(sim.attempts).toBe(51);
    expect(worst).toBeLessThan(50);
    // And the level still plays normally afterwards.
    run(sim, 5 * HZ, input());
    expect(sim.state).toBe('playing');
    expect(sim.trucks.filter((t) => t.driving).length).toBe(60);
  }, 30000);
});

describe('save data', () => {
  function fakeStorage(initial?: string) {
    const map = new Map<string, string>();
    if (initial !== undefined) map.set(SAVE_KEY, initial);
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  }

  it('keeps only improvements and survives a reload', () => {
    const storage = fakeStorage();
    const save = loadSave(storage);
    expect(recordTime(save, 'a', 20)).toBe(true);
    expect(recordTime(save, 'a', 25)).toBe(false);
    expect(recordTime(save, 'a', 18.5)).toBe(true);
    storeSave(storage, save);
    expect(loadSave(storage).bestTimes.a).toBe(18.5);
  });

  it('falls back to an empty save on missing or broken data', () => {
    expect(loadSave(undefined)).toEqual(emptySave());
    expect(loadSave(fakeStorage('not json'))).toEqual(emptySave());
    expect(loadSave(fakeStorage('{"bestTimes":{"a":"x","b":-1,"c":12}}')).bestTimes).toEqual({
      c: 12,
    });
  });
});

describe('formatTime', () => {
  it('formats seconds and minutes', () => {
    expect(formatTime(0)).toBe('0.00');
    expect(formatTime(7.256)).toBe('7.25');
    expect(formatTime(23.4)).toBe('23.40');
    expect(formatTime(83.45)).toBe('1:23.45');
  });
});
