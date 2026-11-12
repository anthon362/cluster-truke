import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { type BeamState, beamStateAt } from '../src/level/hazards/beam';
import { boulderDistanceAt } from '../src/level/hazards/boulder';
import { pendulumAt } from '../src/level/hazards/pendulum';
import { Plate } from '../src/level/hazards/plate';
import { TEST_LEVELS } from '../src/level/levels';
import type {
  BeamDef,
  BoulderDef,
  HazardDef,
  LevelDef,
  PendulumDef,
  PlateDef,
} from '../src/level/schema';
import { validateLevel } from '../src/level/schema';
import { input, run } from './helpers';
import { inBeam, inPendulum } from './levelBots';

const HZ = 1 / TUNING.loop.fixedStep;
const blank = (): BeamState => ({ x: 0, y: 0, z: 0, yaw: 0, on: true, warning: false });

const withBeams = (hazards: BeamDef[]): LevelDef => ({
  ...TEST_LEVELS.single,
  id: 'beams',
  hazards,
});

describe('beam timing', () => {
  it('a sweeping beam goes there and back once per period', () => {
    const def: BeamDef = {
      type: 'beam',
      pos: [-5, 6, 100],
      length: 12,
      vertical: true,
      sweep: { to: [5, 6, 100], period: 8 },
    };
    expect(beamStateAt(def, 0, blank()).x).toBeCloseTo(-5);
    expect(beamStateAt(def, 2, blank()).x).toBeCloseTo(0);
    expect(beamStateAt(def, 4, blank()).x).toBeCloseTo(5);
    expect(beamStateAt(def, 8, blank()).x).toBeCloseTo(-5);
  });

  it('a blinking beam is on, then off, and warns just before coming back', () => {
    const def: BeamDef = {
      type: 'beam',
      pos: [0, 5, 100],
      length: 16,
      blink: { on: 1.5, off: 2.5 },
    };
    expect(beamStateAt(def, 0.5, blank()).on).toBe(true);
    const mid = beamStateAt(def, 2.5, blank());
    expect(mid.on).toBe(false);
    expect(mid.warning).toBe(false);
    const late = beamStateAt(def, 3.6, blank());
    expect(late.on).toBe(false);
    expect(late.warning).toBe(true);
    expect(beamStateAt(def, 4.2, blank()).on).toBe(true);
  });

  it('a spinning beam turns at the set rate', () => {
    const def: BeamDef = { type: 'beam', pos: [0, 4.3, 100], length: 20, spin: 45 };
    expect(beamStateAt(def, 2, blank()).yaw).toBeCloseTo(Math.PI / 2);
  });
});

describe('beams in the simulation', () => {
  const low: BeamDef = { type: 'beam', pos: [0, 4.3, 120], length: 16 };

  it('validates, and rejects a beam with a bad sweep', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(withBeams([low]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withBeams([low])));
    bad.hazards[0].sweep = { to: [1, 2], period: 0 };
    expect(() => validateLevel(bad)).toThrow(/sweep/);
  });

  it('kills a rider who does nothing, lets a jumper through, and never touches the truck', () => {
    const sim = new Sim({ seed: 1, level: withBeams([low]) });
    run(sim, 8 * HZ, input());
    expect(sim.state).toBe('failed');
    expect(sim.failReason).toBe('scenery');
    expect(sim.trucks[0].state).toBe('alive');
    expect(sim.explosions).toBe(0);

    const jumper = new Sim({ seed: 1, level: withBeams([low]) });
    // The beam is at z = 120; the rider starts at z = -1.4 moving at 18 m/s.
    const jumpAt = Math.round(((120 + 1.4) / 18 - 0.45) * HZ);
    run(jumper, jumpAt, input());
    run(jumper, 1, input({ jumpPressed: true, jumpHeld: true }));
    run(jumper, 60, input({ jumpHeld: true }));
    expect(jumper.state).toBe('playing');
    expect(jumper.player.pos.z).toBeGreaterThan(125);
  });

  it('a head-height beam passes over someone standing on the cab', () => {
    const high: BeamDef = { type: 'beam', pos: [0, 5.25, 120], length: 16 };
    const sim = new Sim({ seed: 1, level: withBeams([high]) });
    const truck = sim.trucks[0];
    run(sim, 5, input());
    sim.player.placeInAir(
      new Vector3(0, TUNING.truck.cabRoof + 1, 3.8).add(truck.pos),
      new Vector3(0, 0, 18),
    );
    run(sim, 8 * HZ, input());
    expect(sim.state).toBe('playing');
    expect(sim.player.feetY).toBeCloseTo(TUNING.truck.cabRoof, 0);
  });

  it('is harmless while switched off and lethal once it comes back on', () => {
    // Off from 1 s to 21 s: a rider reaches z = 120 at about 6.7 s.
    const off: BeamDef = {
      type: 'beam',
      pos: [0, 5, 120],
      length: 16,
      thickness: 3,
      blink: { on: 1, off: 20 },
    };
    const sim = new Sim({ seed: 1, level: withBeams([off]) });
    run(sim, 9 * HZ, input());
    expect(sim.state).toBe('playing');
    const on: BeamDef = { ...off, blink: { on: 20, off: 1 } };
    const hit = new Sim({ seed: 1, level: withBeams([on]) });
    run(hit, 9 * HZ, input());
    expect(hit.state).toBe('failed');
  });

  it('goes back to its starting position on restart', () => {
    const sweeping: BeamDef = {
      type: 'beam',
      pos: [-5, 6, 100],
      length: 12,
      vertical: true,
      sweep: { to: [5, 6, 100], period: 4 },
    };
    const sim = new Sim({ seed: 1, god: true, level: withBeams([sweeping]) });
    const part = sim.hazards[0].parts[0];
    expect(part.pos.x).toBeCloseTo(-5);
    run(sim, 2 * HZ, input());
    expect(part.pos.x).toBeCloseTo(5, 0);
    sim.reset();
    expect(part.pos.x).toBeCloseTo(-5);
  });

  it('the scripted players use the same beam maths as the game', () => {
    const spin: BeamDef = { type: 'beam', pos: [0, 4.3, 100], length: 20, spin: 90 };
    // At t = 1 the beam has turned 90 degrees and lies along the road.
    expect(inBeam(spin, 0, 3.8, 108, 1)).toBe(true);
    expect(inBeam(spin, 8, 3.8, 100, 1)).toBe(false);
    expect(inBeam(spin, 8, 3.8, 100, 0)).toBe(true);
    expect(inBeam(spin, 8, 6.0, 100, 0)).toBe(false);
  });
});

const withHazards = (hazards: HazardDef[]): LevelDef => ({
  ...TEST_LEVELS.single,
  id: 'quarry-test',
  hazards,
});

describe('wrecking weight', () => {
  const def: PendulumDef = {
    type: 'pendulum',
    pos: [0, 18, 120],
    length: 12.5,
    swing: 28,
    period: 4,
    size: 2.4,
  };

  it('hangs straight down at the start and swings out to its full angle a quarter period later', () => {
    const p = new Vector3();
    pendulumAt(def, 0, p);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(5.5);
    pendulumAt(def, 1, p);
    expect(p.x).toBeCloseTo(12.5 * Math.sin((28 * Math.PI) / 180));
    expect(p.y).toBeGreaterThan(5.5);
    pendulumAt(def, 3, p);
    expect(p.x).toBeCloseTo(-12.5 * Math.sin((28 * Math.PI) / 180));
  });

  it('validates, and rejects a weight with no period', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(withHazards([def]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withHazards([def])));
    bad.hazards[0].period = 0;
    expect(() => validateLevel(bad)).toThrow(/period/);
  });

  it('kills a rider it swings through and leaves the truck driving', () => {
    // The rider reaches z = 120 after (120 + 1.4) / 18 s; time the weight to be at the middle then.
    const arrival = (120 + 1.4) / 18;
    const hit: PendulumDef = { ...def, phase: 1 - ((arrival / def.period) % 1) };
    const sim = new Sim({ seed: 1, level: withHazards([hit]) });
    run(sim, 9 * HZ, input());
    expect(sim.state).toBe('failed');
    expect(sim.trucks[0].state).toBe('alive');
  });

  it('misses a rider when it is out at the side', () => {
    const arrival = (120 + 1.4) / 18;
    const miss: PendulumDef = { ...def, phase: 1.25 - ((arrival / def.period) % 1) };
    const sim = new Sim({ seed: 1, level: withHazards([miss]) });
    run(sim, 9 * HZ, input());
    expect(sim.state).toBe('playing');
    expect(sim.player.pos.z).toBeGreaterThan(130);
  });

  it('the scripted players use the same weight maths as the game', () => {
    expect(inPendulum(def, 0, TUNING.truck.trailerRoof, 120, 0)).toBe(true);
    expect(inPendulum(def, 0, TUNING.truck.trailerRoof, 120, 1)).toBe(false);
    expect(inPendulum(def, 0, TUNING.truck.trailerRoof, 140, 0)).toBe(false);
  });
});

describe('blast plate', () => {
  const def: PlateDef = { type: 'plate', pos: [0, 0, 120], size: [14, 4], power: 9 };

  it('validates, and rejects a plate with no power', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(withHazards([def]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withHazards([def])));
    delete bad.hazards[0].power;
    expect(() => validateLevel(bad)).toThrow(/power/);
  });

  it('throws the truck into the air once, and it lands and drives on with its rider', () => {
    const sim = new Sim({ seed: 1, level: withHazards([def]) });
    const truck = sim.trucks[0];
    const rest = truck.pos.y;
    let top = rest;
    for (let i = 0; i < 12 * HZ && sim.state === 'playing'; i++) {
      run(sim, 1, input());
      top = Math.max(top, truck.pos.y);
    }
    expect((sim.hazards[0] as Plate).launched).toBe(1);
    expect(top).toBeGreaterThan(rest + 1.5);
    expect(sim.state).toBe('playing');
    expect(sim.explosions).toBe(0);
    expect(truck.state).toBe('alive');
    expect(truck.pos.y).toBeCloseTo(rest, 0);
    expect(sim.player.onTruck).toBe(true);
  });

  it('is ready to fire again after a restart', () => {
    const sim = new Sim({ seed: 1, level: withHazards([def]) });
    run(sim, 9 * HZ, input());
    expect((sim.hazards[0] as Plate).launched).toBe(1);
    sim.reset();
    expect((sim.hazards[0] as Plate).launched).toBe(0);
    run(sim, 9 * HZ, input());
    expect((sim.hazards[0] as Plate).launched).toBe(1);
  });
});

describe('boulder', () => {
  it('rolls along the road at its set speed', () => {
    const def: BoulderDef = { type: 'boulder', path: 'road', startAt: -40, speed: 24, radius: 4.5 };
    expect(boulderDistanceAt(def, 0)).toBe(-40);
    expect(boulderDistanceAt(def, 5)).toBe(80);
  });

  it('validates, and rejects a boulder on a road that does not exist', () => {
    const def: BoulderDef = { type: 'boulder', path: 'road', startAt: -40, speed: 24, radius: 4.5 };
    expect(() => validateLevel(JSON.parse(JSON.stringify(withHazards([def]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withHazards([def])));
    bad.hazards[0].path = 'nowhere';
    expect(() => validateLevel(bad)).toThrow(/nowhere/);
  });

  it('catches a truck it is faster than, wrecks it and kills the rider', () => {
    const def: BoulderDef = { type: 'boulder', path: 'road', startAt: -40, speed: 26, radius: 4.5 };
    const sim = new Sim({ seed: 1, level: withHazards([def]) });
    run(sim, 10 * HZ, input());
    expect(sim.state).toBe('failed');
    expect(sim.explosions).toBe(1);
    // It closes 8 m/s on a 40 m lead, less its own radius and the truck's length.
    expect(sim.time).toBeGreaterThan(2.5);
    expect(sim.time).toBeLessThan(6);
  });

  it('never reaches a truck it is slower than', () => {
    const def: BoulderDef = { type: 'boulder', path: 'road', startAt: -40, speed: 12, radius: 4.5 };
    const sim = new Sim({ seed: 1, level: withHazards([def]) });
    run(sim, 10 * HZ, input());
    expect(sim.state).toBe('playing');
    expect(sim.explosions).toBe(0);
  });
});

describe('chase gauge', () => {
  it('reports how far behind the boulder is, and nothing on a level without one', () => {
    const def: BoulderDef = { type: 'boulder', path: 'road', startAt: -40, speed: 26, radius: 4.5 };
    const sim = new Sim({ seed: 1, level: withHazards([def]) });
    run(sim, 1, input());
    const first = sim.chase()!;
    expect(first.label).toBe('BOULDER');
    expect(first.gap).toBeGreaterThan(25);
    expect(first.gap).toBeLessThan(40);
    run(sim, HZ, input());
    // It closes at 26 - 18 = 8 m/s.
    expect(sim.chase()!.gap).toBeCloseTo(first.gap - 8, 0);
    expect(new Sim({ seed: 1, level: withHazards([]) }).chase()).toBeNull();
  });
});
