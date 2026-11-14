import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import {
  SAVE_KEY,
  SAVE_VERSION,
  buy,
  claimWorldClear,
  emptySave,
  loadSave,
  recordTime,
  storeSave,
} from '../src/core/save';
import { Sim } from '../src/core/sim';
import { TEST_LEVELS } from '../src/level/levels';
import { initPhysics } from '../src/physics/world';
import { ScoreKeeper, speedBonus } from '../src/score/score';
import { input, run } from './helpers';

const S = TUNING.score;
const HZ = 1 / TUNING.loop.fixedStep;

beforeAll(async () => {
  await initPhysics();
});

describe('speed bonus', () => {
  it('is linear from 2 x par (nothing) to 0.6 x par (full)', () => {
    expect(speedBonus(40, 20)).toBe(0);
    expect(speedBonus(60, 20)).toBe(0);
    expect(speedBonus(12, 20)).toBe(S.speedMax);
    expect(speedBonus(5, 20)).toBe(S.speedMax);
    expect(speedBonus(26, 20)).toBe(S.speedMax / 2);
  });
});

describe('ScoreKeeper', () => {
  it('pays finish, first-try and speed bonuses on a win', () => {
    const k = new ScoreKeeper(20);
    const got = k.finished(26, true).map((b) => `${b.kind} ${b.points}`);
    expect(got).toEqual(['FINISH 500', 'ACE 1000', 'SPEED 750']);
    expect(k.total).toBe(2250);
    const again = new ScoreKeeper(20);
    expect(again.finished(50, false).map((b) => b.kind)).toEqual(['FINISH']);
  });

  it('pays air time only beyond the first second, per stretch', () => {
    const k = new ScoreKeeper(20);
    k.leftGround(0, true, false);
    expect(k.landed(0.9, 0)).toEqual([]);
    k.leftGround(2, true, false);
    expect(k.landed(5, 0)).toEqual([{ kind: 'AIR TIME', points: 2 * S.airTimePerSecond }]);
  });

  it('caps air time per attempt so it cannot be farmed', () => {
    const k = new ScoreKeeper(20);
    let t = 0;
    for (let i = 0; i < 10; i++) {
      k.leftGround(t, false, false);
      t += 11; // 10 s beyond the threshold = 1500 points each
      k.landed(t, 0);
    }
    const air = k.breakdown().find((b) => b.kind === 'AIR TIME')!;
    expect(air.points).toBe(S.airTimeCap);
    k.reset();
    expect(k.total).toBe(0);
    k.leftGround(0, false, false);
    expect(k.landed(3, 0)[0].points).toBe(2 * S.airTimePerSecond);
  });

  it('pays per row skipped, for hopping off an airborne truck, and for close calls', () => {
    const k = new ScoreKeeper(20);
    expect(k.leftGround(0, true, true)).toEqual([{ kind: 'AIRBORNE HOP', points: S.airborneHop }]);
    k.passedClose();
    expect(k.landed(0.5, 2)).toEqual([
      { kind: 'ROW SKIP', points: 2 * S.rowSkip },
      { kind: 'CLOSE CALL', points: S.closeCall },
    ]);
    // Walking off an airborne truck is not a hop; a close pass does not carry over.
    expect(k.leftGround(1, false, true)).toEqual([]);
    expect(k.landed(1.5, 0)).toEqual([]);
  });

  it('applies the multiplier to bonuses earned while it is set', () => {
    const k = new ScoreKeeper(20);
    k.multiplier = 2;
    k.leftGround(0, true, true);
    k.landed(0.5, 1);
    k.multiplier = 1;
    k.finished(100, false);
    expect(k.breakdown()).toEqual([
      { kind: 'AIRBORNE HOP', points: 2 * S.airborneHop },
      { kind: 'ROW SKIP', points: 2 * S.rowSkip },
      { kind: 'FINISH', points: S.finish },
    ]);
  });
});

describe('scoring in the simulation', () => {
  const playOut = (sim: Sim) => {
    for (let i = 0; i < 60 * HZ && sim.state === 'playing'; i++) sim.step(input());
  };

  it('riding to the goal earns finish, first try and some speed; a retry loses first try', () => {
    const sim = new Sim({ seed: 1, level: TEST_LEVELS.single });
    playOut(sim);
    expect(sim.score.breakdown().map((b) => b.kind)).toEqual(['FINISH', 'ACE', 'SPEED']);
    const first = sim.score.total;
    sim.reset();
    expect(sim.score.total).toBe(0);
    playOut(sim);
    expect(sim.score.breakdown().map((b) => b.kind)).toEqual(['FINISH', 'SPEED']);
    expect(sim.score.total).toBe(first - S.ace);
  });

  it('a long fall onto a truck pays air time; failing afterwards loses it', () => {
    const sim = new Sim({ seed: 1, level: TEST_LEVELS.single });
    run(sim, 5, input());
    const truck = sim.trucks[0];
    const v = truck.body.linvel();
    sim.player.placeInAir(new Vector3(0, 30, -1.4).add(truck.pos), new Vector3(v.x, 0, v.z));
    let bonusEvents = 0;
    for (let i = 0; i < 4 * HZ && !sim.player.grounded; i++) {
      sim.step(input());
      bonusEvents += sim.events.filter((e) => e.type === 'bonus').length;
    }
    expect(sim.player.grounded).toBe(true);
    expect(sim.score.breakdown().map((b) => b.kind)).toEqual(['AIR TIME']);
    expect(sim.score.total).toBeGreaterThan(40);
    expect(bonusEvents).toBe(1);
    run(sim, 300, input({ moveS: 1, sprint: true }));
    expect(sim.state).toBe('failed');
    sim.reset();
    expect(sim.score.total).toBe(0);
  });

  it('grabbing a truck side just above the ground and climbing back pays a close call', () => {
    const sim = new Sim({ seed: 1, level: TEST_LEVELS.single });
    run(sim, 5, input());
    const truck = sim.trucks[0];
    const v = truck.body.linvel();
    // Feet 0.7 m above the road, touching the trailer's side.
    sim.player.placeInAir(
      new Vector3(
        -(TUNING.truck.width / 2 + TUNING.player.radius + 0.05),
        0.7 + TUNING.player.height / 2,
        -1.4,
      ).add(truck.pos),
      new Vector3(v.x, v.y, v.z),
    );
    for (let i = 0; i < 3 * HZ && !sim.player.grounded; i++) {
      sim.step(input({ jumpHeld: true, yaw: -Math.PI / 2, moveF: 1 }));
    }
    expect(sim.state).toBe('playing');
    expect(sim.player.grounded).toBe(true);
    expect(sim.score.breakdown().map((b) => b.kind)).toContain('CLOSE CALL');
  });

  it('skipping a row in one jump pays a row skip', () => {
    const sim = new Sim({ seed: 2, god: true, level: TEST_LEVELS.convoy });
    run(sim, 5, input());
    // Drop onto the trailer two rows ahead of the starting truck.
    const target = sim.pool.find('main', 3, 1)!;
    const v = target.body.linvel();
    run(sim, 1, input({ jumpPressed: true, jumpHeld: true }));
    sim.player.placeInAir(
      new Vector3(0, 5.5, -1.4).applyQuaternion(target.rot).add(target.pos),
      new Vector3(v.x, 0, v.z),
    );
    for (let i = 0; i < 2 * HZ && !sim.player.grounded; i++) sim.step(input());
    expect(sim.player.groundTruck).toBe(target);
    expect(sim.score.breakdown()).toContainEqual({ kind: 'ROW SKIP', points: S.rowSkip });
  });
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
    save.points = 4200;
    storeSave(storage, save);
    const back = loadSave(storage);
    expect(back.bestTimes.a).toBe(18.5);
    expect(back.points).toBe(4200);
    expect(back.version).toBe(SAVE_VERSION);
  });

  it('falls back to an empty save on missing or broken data', () => {
    expect(loadSave(undefined)).toEqual(emptySave());
    expect(loadSave(fakeStorage('not json'))).toEqual(emptySave());
    expect(loadSave(fakeStorage('{"bestTimes":{"a":"x","b":-1,"c":12}}')).bestTimes).toEqual({
      c: 12,
    });
  });

  it('upgrades a version 1 save without losing best times', () => {
    const v1 = JSON.stringify({ version: 1, bestTimes: { '1-1': 14.2 } });
    const save = loadSave(fakeStorage(v1));
    expect(save).toEqual({ ...emptySave(), bestTimes: { '1-1': 14.2 } });
  });

  it('refuses damaged values: negative points, equipping something not owned', () => {
    const bad = JSON.stringify({
      points: -50,
      owned: ['a', 'a', 7],
      equipped: { movement: 'b', utility: 'a' },
    });
    const save = loadSave(fakeStorage(bad));
    expect(save.points).toBe(0);
    expect(save.owned).toEqual(['a']);
    expect(save.equipped).toEqual({ movement: null, utility: 'a' });
  });

  it('pays the world clear bonus exactly once, when every level is done', () => {
    const save = emptySave();
    const ids = ['1-1', '1-2'];
    recordTime(save, '1-1', 10);
    expect(claimWorldClear(save, 'w', ids)).toBe(false);
    recordTime(save, '1-2', 10);
    expect(claimWorldClear(save, 'w', ids)).toBe(true);
    expect(claimWorldClear(save, 'w', ids)).toBe(false);
  });

  it('buying needs enough points and happens once', () => {
    const save = emptySave();
    save.points = 1000;
    expect(buy(save, 'x', 1500)).toBe(false);
    expect(buy(save, 'x', 600)).toBe(true);
    expect(save.points).toBe(400);
    expect(buy(save, 'x', 100)).toBe(false);
    expect(save.owned).toEqual(['x']);
  });
});
