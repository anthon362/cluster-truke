import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { TEST_LEVELS, findLevel } from '../src/level/levels';
import type { LevelDef } from '../src/level/schema';
import { validateLevel } from '../src/level/schema';
import { initPhysics } from '../src/physics/world';
import { input, run } from './helpers';

const T = TUNING.truck;
const HZ = 1 / TUNING.loop.fixedStep;

beforeAll(async () => {
  await initPhysics();
});

describe('carried (floating) convoys', () => {
  const level = (): LevelDef => ({
    ...TEST_LEVELS.single,
    id: 'float',
    ground: 'none',
    killY: -30,
    paths: [{ id: 'air', width: 6, lanes: 1, points: [[0, 5, 0], [0, 5, 200], [0, 12, 300], [0, 12, 600]] }],
    convoys: [{ id: 'main', path: 'air', rows: 3, lanesUsed: [0], startAt: 20, float: true }],
    goal: { pos: [0, 12, 580], width: 16, height: 12 },
  });

  it('pass validation', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(level())))).not.toThrow();
  });

  it('glide along the path with nothing under them, climb with it, and carry the player', () => {
    const sim = new Sim({ seed: 1, level: level() });
    const truck = sim.player.groundTruck!;
    const startRel = sim.player.pos.clone().sub(truck.pos);
    let ungrounded = 0;
    run(sim, 17 * HZ, input(), () => {
      if (!sim.player.grounded) ungrounded++;
    });
    expect(ungrounded).toBe(0);
    expect(sim.state).toBe('playing');
    expect(truck.pos.y).toBeGreaterThan(11.5); // followed the path up
    expect(truck.pos.z).toBeGreaterThan(T.cruiseSpeed * 16);
    const rel = sim.player.pos.clone().sub(truck.pos);
    expect(rel.distanceTo(startRel)).toBeLessThan(0.05);
  });

  it('give a jumping player their speed, and cannot be blown up or shoved', () => {
    const sim = new Sim({ seed: 1, god: true, level: level() });
    run(sim, 30, input());
    const truck = sim.player.groundTruck!;
    const before = sim.player.pos.z - truck.pos.z;
    run(sim, 70, input({ jumpPressed: true, jumpHeld: true }));
    expect(sim.player.grounded).toBe(true);
    expect(Math.abs(sim.player.pos.z - truck.pos.z - before)).toBeLessThan(0.2);
    truck.blast(truck.pos.clone().add(new Vector3(1, 0, 0)), sim.rng);
    truck.explode(sim.rng);
    run(sim, 30, input());
    expect(truck.state).toBe('alive');
    expect(Math.abs(truck.pos.x)).toBeLessThan(0.01);
  });
});

describe('ice', () => {
  /** How far trucks get pushed off line by a sideways shove, with and without ice under them. */
  const drift = (icy: boolean) => {
    const level: LevelDef = {
      ...TEST_LEVELS.single,
      id: icy ? 'icy' : 'dry',
      hazards: icy ? [{ type: 'ice', pos: [0, 0, 150], size: [30, 300] }] : [],
    };
    const sim = new Sim({ seed: 1, god: true, level });
    run(sim, 30, input());
    const truck = sim.trucks[0];
    truck.body.applyImpulse({ x: 6 * T.mass, y: 0, z: 0 }, true);
    let widest = 0;
    run(sim, 2 * HZ, input(), () => (widest = Math.max(widest, Math.abs(truck.pos.x))));
    return widest;
  };

  it('lets a shoved truck slide much further than on a dry road', () => {
    const dry = drift(false);
    const icy = drift(true);
    expect(dry).toBeLessThan(0.5);
    expect(icy).toBeGreaterThan(dry * 4);
    expect(icy).toBeGreaterThan(1.5);
  });
});

describe('rotor', () => {
  const rotorLevel = (): LevelDef => ({
    ...TEST_LEVELS.single,
    id: 'rotor-test',
    hazards: [{ type: 'rotor', pos: [0, 10.2, 120], radius: 6, spokes: 3, speed: 90 }],
  });

  it('turns at the set rate and resets', () => {
    const sim = new Sim({ seed: 1, god: true, level: rotorLevel() });
    const spoke = sim.hazards[0].parts[0];
    // Spoke 0 starts pointing straight down from the hub.
    expect(spoke.pos.y).toBeCloseTo(10.2 - 3, 2);
    expect(spoke.pos.x).toBeCloseTo(0, 2);
    run(sim, HZ, input()); // 90 degrees later it is horizontal
    expect(Math.abs(spoke.pos.x)).toBeCloseTo(3, 1);
    expect(spoke.pos.y).toBeCloseTo(10.2, 1);
    sim.reset();
    expect(spoke.pos.x).toBeCloseTo(0, 2);
  });

  it('lets trucks drive straight through but kills a player in a spoke', () => {
    const sim = new Sim({ seed: 1, level: rotorLevel() });
    run(sim, 3, input());
    // In the path of the downward spoke, above the truck roofs.
    sim.player.placeInAir(new Vector3(0, 6, 120), new Vector3());
    run(sim, 8, input());
    expect(sim.state).toBe('failed');

    const through = new Sim({ seed: 1, god: true, level: rotorLevel() });
    run(through, 9 * HZ, input());
    expect(through.trucks[0].state).toBe('alive');
    expect(through.trucks[0].pos.z).toBeGreaterThan(150);
    expect(through.explosions).toBe(0);
  });
});

describe('world palettes', () => {
  it('each world has its own look', () => {
    const skies = ['1-1', '2-1', '3-1'].map((id) => findLevel(id)!.palette.sky);
    expect(new Set(skies).size).toBe(3);
    for (const world of ['dockyard', 'overpass', 'whiteout']) {
      const levels = ['1', '2', '3', '4', '5', '6'].map((n) => findLevel(`${{ dockyard: 1, overpass: 2, whiteout: 3 }[world]}-${n}`)!);
      expect(new Set(levels.map((l) => l.palette.sky)).size).toBe(1);
      expect(levels.every((l) => l.world === world)).toBe(true);
    }
  });
});
