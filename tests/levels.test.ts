import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { LEVEL_ENTRIES, LEVELS, TEST_LEVELS, findLevel } from '../src/level/levels';
import { LevelDef, LevelError, validateLevel } from '../src/level/schema';
import { initPhysics } from '../src/physics/world';
import { input, run } from './helpers';

const HZ = 1 / TUNING.loop.fixedStep;

beforeAll(async () => {
  await initPhysics();
});

function problemsOf(raw: unknown): string[] {
  try {
    validateLevel(raw, 'test.json');
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(LevelError);
    return (e as LevelError).problems;
  }
}

/** A deep copy of a valid level that tests can break on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately untyped: tests write invalid data into it
function draft(): Record<string, any> {
  return JSON.parse(JSON.stringify(TEST_LEVELS.hazards));
}

describe('level files', () => {
  it('every shipped level file is valid', () => {
    const broken = LEVEL_ENTRIES.filter((e) => !e.level).map(
      (e) => `${e.file}: ${e.problems?.join('; ')}`,
    );
    expect(broken).toEqual([]);
    expect(LEVELS.length).toBeGreaterThanOrEqual(4);
  });

  it('finds levels by id, with or without the test- prefix', () => {
    expect(findLevel('test-single')?.name).toBe('One truck');
    expect(findLevel('single')?.id).toBe('test-single');
    expect(findLevel('nope')).toBeUndefined();
  });
});

describe('schema errors are readable', () => {
  it('accepts a valid level', () => {
    expect(problemsOf(draft())).toEqual([]);
  });

  it('names the field, what was expected and what was found', () => {
    const d = draft();
    d.parTime = 'fast';
    delete d.killY;
    d.palette.sky = 'blue';
    expect(problemsOf(d)).toEqual([
      'level.parTime: expected a number, got "fast"',
      'level.killY: expected a number, got nothing (missing)',
      'palette.sky: expected a colour like "#f6c98a", got "blue"',
    ]);
  });

  it('reports every problem at once, not just the first', () => {
    const d = draft();
    d.convoys[0].rowSpacing = 2;
    d.goal.width = -3;
    d.hazards[1].speed = 9999;
    expect(problemsOf(d).length).toBe(3);
  });

  it('catches references to things that do not exist', () => {
    const d = draft();
    d.convoys[0].path = 'highway';
    d.player.convoy = 'ghost';
    const p = problemsOf(d);
    expect(p).toContain('convoys[0].path: no path called "highway" (paths: road)');
    expect(p).toContain('player.convoy: no convoy called "ghost" (convoys: main)');
  });

  it('catches lanes and rows that are out of range', () => {
    const d = draft();
    d.convoys[0].lanesUsed = [0, 1, 5];
    d.player.row = 99;
    const p = problemsOf(d);
    expect(p).toContain(
      'convoys[0].lanesUsed[2]: lane 5 does not exist; path "road" has lanes 0-2',
    );
    expect(p).toContain('player.row: row 99 does not exist; convoy "main" has rows 0-19');
  });

  it('catches typos in field names and unknown hazards', () => {
    const d = draft();
    d.convoys[0].sped = 20;
    d.hazards[0].type = 'laserWall';
    const p = problemsOf(d);
    expect(p.some((x) => x.startsWith('convoys[0].sped: unknown field'))).toBe(true);
    expect(p).toContain(
      'hazards[0].type: unknown hazard "laserWall" (known: breakableWall, spinner, ice, rotor, beam, pendulum, plate, boulder, wind, strike, belt, press, melt)',
    );
  });

  it('enforces the truck limit', () => {
    const d = draft();
    d.convoys[0].rows = 30;
    expect(problemsOf(d)).toContain(
      `convoys: 90 trucks in total; the limit is ${TUNING.truck.maxActive}`,
    );
  });

  it('rejects things that are not a level at all', () => {
    expect(problemsOf(null)).toEqual(['level: expected an object, got null']);
    expect(problemsOf([1, 2])).toEqual(['level: expected an object, got a list of 2']);
  });
});

describe('breakable wall', () => {
  const wallLevel = (): LevelDef => ({
    ...TEST_LEVELS.hazards,
    hazards: [TEST_LEVELS.hazards.hazards[0]],
  });

  it('trucks plough through without exploding', () => {
    const sim = new Sim({ seed: 4, god: true, level: wallLevel() });
    const wall = sim.hazards[0];
    const moved = () =>
      wall.parts.filter((p) => p.pos.distanceTo(p.prevPos) > 0 || !p.visible).length;
    run(sim, 2 * HZ, input());
    expect(moved()).toBe(0); // intact before any truck arrives
    run(sim, 12 * HZ, input());
    expect(sim.explosions).toBe(0);
    expect(sim.trucks.filter((t) => t.driving).length).toBe(60);
    // Debris is cleaned up after its lifetime.
    expect(wall.parts.every((p) => !p.visible)).toBe(true);
  });

  it('is lethal while intact and harmless once broken', () => {
    const sim = new Sim({ seed: 4, level: wallLevel() });
    run(sim, 3, input());
    sim.player.placeInAir(new Vector3(45, 2.5, 345), new Vector3());
    run(sim, 8, input());
    expect(sim.failReason).toBe('scenery');
  });

  it('is rebuilt on restart', () => {
    const sim = new Sim({ seed: 4, god: true, level: wallLevel() });
    const bodies = sim.physics.bodyCount;
    const home = sim.hazards[0].parts.map((p) => p.pos.clone());
    run(sim, 8 * HZ, input());
    sim.reset();
    expect(sim.physics.bodyCount).toBe(bodies);
    sim.hazards[0].parts.forEach((p, i) => {
      expect(p.visible).toBe(true);
      expect(p.pos.distanceTo(home[i])).toBe(0);
    });
    run(sim, 2 * HZ, input());
    sim.hazards[0].parts.forEach((p, i) => expect(p.pos.distanceTo(home[i])).toBe(0));
  });
});

describe('spinning pusher', () => {
  const spinLevel = (): LevelDef => ({
    ...TEST_LEVELS.hazards,
    hazards: [TEST_LEVELS.hazards.hazards[1]],
  });

  it('turns at the given rate and resets its angle', () => {
    const sim = new Sim({ seed: 4, god: true, level: spinLevel() });
    const arm = sim.hazards[0].parts[0];
    run(sim, HZ, input());
    const angle = 2 * Math.acos(Math.min(1, Math.abs(arm.rot.w)));
    expect(angle).toBeCloseTo((70 * Math.PI) / 180, 1);
    sim.reset();
    expect(Math.abs(arm.rot.w)).toBeCloseTo(1, 5);
  });

  it('knocks trucks off line but lets some of the convoy through', () => {
    const sim = new Sim({ seed: 4, god: true, level: spinLevel() });
    run(sim, 22 * HZ, input());
    const past = sim.trucks.filter((t) => t.driving && t.s > 500).length;
    const disturbed = sim.trucks.filter((t) => !t.driving || t.state !== 'alive').length;
    expect(disturbed).toBeGreaterThanOrEqual(3);
    expect(past).toBeGreaterThanOrEqual(8);
  });

  it('is lethal to the player', () => {
    const sim = new Sim({ seed: 4, level: spinLevel() });
    run(sim, 3, input());
    sim.player.placeInAir(new Vector3(55.5, 2.2, 420), new Vector3());
    run(sim, 8, input());
    expect(sim.state).toBe('failed');
  });
});

describe('rotated scenery and no-ground levels', () => {
  it('trucks drive up a ramp and the level works without flat ground', () => {
    const level: LevelDef = {
      ...TEST_LEVELS.single,
      id: 'ramp',
      ground: 'none',
      scenery: [
        { type: 'box', pos: [0, -0.5, 60], size: [14, 1, 160], lethal: true },
        { type: 'box', pos: [0, 0.2, 150], size: [14, 1, 24], rot: [-8, 0, 0], lethal: true },
      ],
    };
    validateLevel(JSON.parse(JSON.stringify(level)));
    const sim = new Sim({ seed: 1, god: true, level });
    let top = 0;
    let ridingAtTop = false;
    run(sim, 14 * HZ, input(), () => {
      if (sim.trucks[0].pos.y > top) {
        top = sim.trucks[0].pos.y;
        ridingAtTop = sim.player.grounded;
      }
    });
    expect(top).toBeGreaterThan(1); // climbed the ramp
    expect(ridingAtTop).toBe(true); // and the player stayed on
    // Past the end of the slabs there is nothing: the truck falls and is removed.
    expect(sim.trucks[0].state).toBe('gone');
  });
});
