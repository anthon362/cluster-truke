import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { type BeamState, beamStateAt } from '../src/level/hazards/beam';
import { boulderDistanceAt } from '../src/level/hazards/boulder';
import { pendulumAt } from '../src/level/hazards/pendulum';
import { Belt } from '../src/level/hazards/belt';
import { meltDeadline, meltLevelAt } from '../src/level/hazards/melt';
import { Plate } from '../src/level/hazards/plate';
import { Press, type PressState, pressStateAt, underPress } from '../src/level/hazards/press';
import { Strike } from '../src/level/hazards/strike';
import { type WindState, inWind, windStateAt } from '../src/level/hazards/wind';
import { TEST_LEVELS } from '../src/level/levels';
import type {
  BeamDef,
  BeltDef,
  BoulderDef,
  HazardDef,
  LevelDef,
  MeltDef,
  PendulumDef,
  PlateDef,
  PressDef,
  StrikeDef,
  WindDef,
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

describe('wind', () => {
  const steady: WindDef = { type: 'wind', pos: [0, 0, 150], size: [60, 200], force: 6 };
  const state = (): WindState => ({ on: false, warning: false });

  it('blows all the time without gusts, and on and off with them, warning first', () => {
    expect(windStateAt(steady, 3, state()).on).toBe(true);
    const gusty: WindDef = { ...steady, gust: { on: 2, off: 3 } };
    expect(windStateAt(gusty, 1, state()).on).toBe(true);
    expect(windStateAt(gusty, 2.5, state())).toEqual({ on: false, warning: false });
    expect(windStateAt(gusty, 4.5, state())).toEqual({ on: false, warning: true });
    expect(windStateAt(gusty, 5.5, state()).on).toBe(true);
  });

  it('only reaches inside its zone', () => {
    expect(inWind(steady, 0, 4, 150)).toBe(true);
    expect(inWind(steady, 0, 4, 20)).toBe(false);
    expect(inWind(steady, 40, 4, 150)).toBe(false);
  });

  it('validates, and rejects wind with no force', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(withHazards([steady]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withHazards([steady])));
    bad.hazards[0].force = 0;
    expect(() => validateLevel(bad)).toThrow(/force/);
  });

  it('leaves a rider and the truck alone but carries a jump sideways', () => {
    const drift = (hazards: HazardDef[]): number => {
      const sim = new Sim({ seed: 1, level: withHazards(hazards) });
      run(sim, 5 * HZ, input());
      expect(sim.player.grounded).toBe(true);
      expect(Math.abs(sim.player.pos.x)).toBeLessThan(0.3);
      const x = sim.player.pos.x;
      run(sim, 1, input({ jumpPressed: true, jumpHeld: true }));
      run(sim, 40, input({ jumpHeld: true }));
      return sim.player.pos.x - x;
    };
    expect(Math.abs(drift([]))).toBeLessThan(0.1);
    const blown = drift([steady]);
    expect(blown).toBeGreaterThan(1);
    expect(drift([{ ...steady, force: -6 }])).toBeCloseTo(-blown, 1);
    // Twice the wind, twice the drift.
    expect(drift([{ ...steady, force: 12 }])).toBeCloseTo(blown * 2, 0);
  });

  it('does nothing between gusts', () => {
    const sim = new Sim({
      seed: 1,
      level: withHazards([{ ...steady, gust: { on: 1, off: 30, phase: 0.5 } }]),
    });
    run(sim, 5 * HZ, input());
    const x = sim.player.pos.x;
    run(sim, 1, input({ jumpPressed: true, jumpHeld: true }));
    run(sim, 40, input({ jumpHeld: true }));
    expect(Math.abs(sim.player.pos.x - x)).toBeLessThan(0.1);
  });
});

describe('lightning', () => {
  const def: StrikeDef = { type: 'strike', period: 4, warning: 1.5 };

  it('validates, and rejects a warning longer than the period', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(withHazards([def]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withHazards([def])));
    bad.hazards[0].warning = 5;
    expect(() => validateLevel(bad)).toThrow(/warning/);
  });

  it('marks the truck the player is on, then destroys it and kills a rider who stayed', () => {
    const sim = new Sim({ seed: 1, level: withHazards([def]) });
    const strike = sim.hazards[0] as Strike;
    run(sim, 2 * HZ, input());
    expect(strike.target).toBeNull();
    run(sim, HZ, input());
    expect(strike.target).toBe(sim.trucks[0]);
    expect(strike.strikeIn).toBeCloseTo(1, 1);
    expect(sim.state).toBe('playing');
    run(sim, 1.5 * HZ, input());
    expect(strike.strikes).toBe(1);
    expect(sim.trucks[0].state).not.toBe('alive');
    expect(sim.state).toBe('failed');
    expect(sim.time).toBeGreaterThan(3.9);
    expect(sim.time).toBeLessThan(4.6);
  });

  it('starts over on restart', () => {
    const sim = new Sim({ seed: 1, level: withHazards([def]) });
    run(sim, 5 * HZ, input());
    sim.reset();
    const strike = sim.hazards[0] as Strike;
    expect(strike.strikes).toBe(0);
    expect(strike.target).toBeNull();
    run(sim, 2 * HZ, input());
    expect(sim.state).toBe('playing');
  });
});

describe('boost belt', () => {
  const def: BeltDef = { type: 'belt', pos: [0, 0, 100], size: [12, 14], factor: 1.35, seconds: 3 };

  it('validates, and rejects a belt that does not speed anything up', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(withHazards([def]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withHazards([def])));
    bad.hazards[0].factor = 1;
    expect(() => validateLevel(bad)).toThrow(/factor/);
  });

  it('speeds the truck up once and it keeps the ground it gained', () => {
    const plain = new Sim({ seed: 1, level: withHazards([]) });
    const belted = new Sim({ seed: 1, level: withHazards([def]) });
    run(plain, 14 * HZ, input());
    let top = 0;
    for (let i = 0; i < 14 * HZ; i++) {
      run(belted, 1, input());
      top = Math.max(top, belted.trucks[0].body.linvel().z);
    }
    expect((belted.hazards[0] as Belt).boosted).toBe(1);
    expect(top).toBeGreaterThan(18 * 1.25);
    // 3 s at 0.35 x 18 m/s = 18.9 m ahead, and still ahead long after the boost ended.
    const gained = belted.trucks[0].pos.z - plain.trucks[0].pos.z;
    expect(gained).toBeGreaterThan(14);
    expect(gained).toBeLessThan(22);
    expect(belted.trucks[0].body.linvel().z).toBeCloseTo(18, 0);
    expect(belted.state).toBe('playing');
    expect(belted.player.onTruck).toBe(true);
  });
});

describe('press', () => {
  const def: PressDef = { type: 'press', pos: [0, 0, 120], size: [3, 8], period: 6, down: 1 };
  const state = (): PressState => ({ bottom: 0, warning: false });
  const H = TUNING.hazards;
  const wait = 6 - 1 - H.pressSlam - H.pressRise;

  it('waits at the top, warns, slams down, holds and rises', () => {
    expect(pressStateAt(def, 0, state())).toEqual({ bottom: H.pressTop, warning: false });
    expect(pressStateAt(def, wait - 0.5, state())).toEqual({ bottom: H.pressTop, warning: true });
    expect(pressStateAt(def, wait + H.pressSlam + 0.5, state()).bottom).toBeCloseTo(H.pressBottom);
    const rising = pressStateAt(def, wait + H.pressSlam + 1 + H.pressRise / 2, state()).bottom;
    expect(rising).toBeCloseTo((H.pressTop + H.pressBottom) / 2);
    expect(pressStateAt(def, 6, state()).bottom).toBeCloseTo(H.pressTop);
  });

  it('knows what is under it', () => {
    expect(underPress(def, 0, 120)).toBe(true);
    expect(underPress(def, 3.4, 120)).toBe(false);
    expect(underPress(def, 0, 126)).toBe(false);
    expect(underPress(def, 0, 126, 2.5)).toBe(true);
  });

  it('validates, and rejects a press that is down for most of its cycle', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(withHazards([def]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withHazards([def])));
    bad.hazards[0].down = 5;
    expect(() => validateLevel(bad)).toThrow(/down/);
  });

  // The truck's centre reaches z = 120 after 120 / 18 = 6.67 s.
  const phaseFor = (cycleTimeOnArrival: number): number =>
    ((((cycleTimeOnArrival - 120 / 18) / 6) % 1) + 1) % 1;

  it('crushes the truck under it when it comes down, and the rider with it', () => {
    const sim = new Sim({
      seed: 1,
      level: withHazards([{ ...def, phase: phaseFor(wait + H.pressSlam + 0.2) }]),
    });
    run(sim, 9 * HZ, input());
    expect((sim.hazards[0] as Press).crushed).toBe(1);
    expect(sim.trucks[0].state).toBe('gone');
    expect(sim.state).toBe('failed');
  });

  it('lets a truck through while it is up', () => {
    const sim = new Sim({ seed: 1, level: withHazards([{ ...def, phase: phaseFor(1) }]) });
    run(sim, 9 * HZ, input());
    expect((sim.hazards[0] as Press).crushed).toBe(0);
    expect(sim.state).toBe('playing');
    expect(sim.player.pos.z).toBeGreaterThan(140);
  });
});

describe('melt', () => {
  const def: MeltDef = { type: 'melt', rise: 0.2, delay: 1 };

  it('rises steadily after its delay and reaches the trucks on time', () => {
    expect(meltLevelAt(def, 0.5)).toBe(0);
    expect(meltLevelAt(def, 3)).toBeCloseTo(0.4);
    expect(meltDeadline(def)).toBeCloseTo(1 + TUNING.hazards.meltTruckHeight / 0.2);
  });

  it('validates, and rejects melt that does not rise', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(withHazards([def]))))).not.toThrow();
    const bad = JSON.parse(JSON.stringify(withHazards([def])));
    bad.hazards[0].rise = 0;
    expect(() => validateLevel(bad)).toThrow(/rise/);
  });

  it('leaves the trucks alone until the deadline, then takes them and whoever is on them', () => {
    const sim = new Sim({ seed: 1, level: withHazards([def]) });
    const deadline = meltDeadline(def);
    run(sim, Math.round((deadline - 0.3) * HZ), input());
    expect(sim.state).toBe('playing');
    expect(sim.trucks[0].state).toBe('alive');
    expect(sim.chase()!.text).toMatch(/^MELT 0\.[0-9] s$/);
    run(sim, 2 * HZ, input());
    expect(sim.trucks[0].state).toBe('gone');
    expect(sim.state).toBe('failed');
    expect(sim.time).toBeLessThan(deadline + 1.2);
  });
});

describe('moving goal', () => {
  const moving = (speed: number, travel?: number): LevelDef => ({
    ...TEST_LEVELS.single,
    id: 'moving-goal',
    goal: { pos: [0, 0, 100], width: 16, height: 12, speed, ...(travel ? { travel } : {}) },
  });

  it('validates, and rejects a gate faster than the trucks could ever catch', () => {
    expect(() => validateLevel(JSON.parse(JSON.stringify(moving(8))))).not.toThrow();
    expect(() => validateLevel(JSON.parse(JSON.stringify(moving(30))))).toThrow(/speed/);
  });

  it('travels away along the road and is caught later than a gate that stands still', () => {
    const still = new Sim({
      seed: 1,
      level: { ...moving(8), goal: { pos: [0, 0, 100], width: 16, height: 12 } },
    });
    run(still, 12 * HZ, input());
    expect(still.state).toBe('won');
    // The rider starts at z = -1.4 at 18 m/s: 101.4 / 18 = 5.6 s.
    expect(still.time).toBeCloseTo(101.4 / 18, 0);

    const sim = new Sim({ seed: 1, level: moving(8) });
    run(sim, 2 * HZ, input());
    expect(sim.goal.centre.z).toBeCloseTo(116, 0);
    run(sim, 12 * HZ, input());
    expect(sim.state).toBe('won');
    // Closing at 18 - 8 = 10 m/s: 101.4 / 10 = 10.1 s.
    expect(sim.time).toBeCloseTo(101.4 / 10, 0);
  });

  it('stops after its travel distance and goes back to the start on restart', () => {
    const sim = new Sim({ seed: 1, level: moving(8, 20) });
    run(sim, 4 * HZ, input());
    expect(sim.goal.centre.z).toBeCloseTo(120);
    sim.reset();
    expect(sim.goal.centre.z).toBeCloseTo(100);
    expect(sim.goal.prevCentre.z).toBeCloseTo(100);
  });
});
