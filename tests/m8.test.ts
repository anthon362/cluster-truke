import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { type BeamState, beamStateAt } from '../src/level/hazards/beam';
import { TEST_LEVELS } from '../src/level/levels';
import type { BeamDef, LevelDef } from '../src/level/schema';
import { validateLevel } from '../src/level/schema';
import { input, run } from './helpers';
import { inBeam } from './levelBots';

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
