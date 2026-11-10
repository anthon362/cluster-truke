import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Accumulator } from '../src/core/loop';
import { Rng } from '../src/core/rng';
import { NO_INPUT, airMove, groundMove, wishVelocity } from '../src/player/movement';

const P = TUNING.player;
const dt = TUNING.loop.fixedStep;

describe('Rng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    let differs = false;
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      if (x !== c.next()) differs = true;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(differs).toBe(true);
  });
});

describe('Accumulator', () => {
  it('runs one step per 60 Hz frame', () => {
    const acc = new Accumulator();
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += acc.advance(1 / 60);
    expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1);
  });

  it('caps sub-steps and drops the rest', () => {
    const acc = new Accumulator();
    expect(acc.advance(0.2)).toBe(acc.maxSubSteps);
    expect(acc.alpha).toBeLessThan(1);
    expect(acc.advance(1 / 60)).toBeLessThanOrEqual(2);
  });

  it('carries no time across a reset (clean pause)', () => {
    const acc = new Accumulator();
    acc.advance(0.01);
    acc.reset();
    expect(acc.alpha).toBe(0);
    expect(acc.advance(0.01)).toBe(0);
  });

  it('respects time scale', () => {
    const acc = new Accumulator();
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += acc.advance(1 / 60, 0.5);
    expect(Math.abs(steps - 300)).toBeLessThanOrEqual(1);
  });
});

describe('movement maths', () => {
  it('does not normalise diagonal input', () => {
    const w = wishVelocity({ ...NO_INPUT, moveF: 1, moveS: 1, sprint: true }, { x: 0, z: 0 });
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(
      Math.hypot(P.sprintSpeed, P.sprintSpeed * P.strafeMultiplier),
    );
    expect(Math.hypot(w.x, w.z)).toBeGreaterThan(P.sprintSpeed);
  });

  it('yaw 0 walks toward -Z', () => {
    const w = wishVelocity({ ...NO_INPUT, moveF: 1 }, { x: 0, z: 0 });
    expect(w.x).toBeCloseTo(0);
    expect(w.z).toBeCloseTo(-P.walkSpeed);
  });

  it('built-up ground speed bleeds slowly instead of snapping to the cap', () => {
    const rel = { x: 0, z: 25 };
    const wish = { x: 0, z: P.sprintSpeed };
    groundMove(rel, wish, dt);
    expect(rel.z).toBeCloseTo(25 - P.overspeedBleed * dt);
  });

  it('stops quickly with no input', () => {
    const rel = { x: 0, z: P.sprintSpeed };
    for (let i = 0; i < 30; i++) groundMove(rel, { x: 0, z: 0 }, dt);
    expect(Math.hypot(rel.x, rel.z)).toBe(0);
  });

  it('air control never removes speed and stops adding at the cap', () => {
    const fast = { x: 0, z: 30 };
    airMove(fast, { x: 0, z: P.sprintSpeed }, dt);
    expect(fast.z).toBe(30);
    const slow = { x: 0, z: 0 };
    airMove(slow, { x: 0, z: P.sprintSpeed }, dt);
    expect(slow.z).toBeCloseTo(P.airAccel * dt);
    // Sideways wish adds sideways speed without touching forward speed.
    const side = { x: 0, z: 30 };
    airMove(side, { x: 5, z: 0 }, dt);
    expect(side.z).toBe(30);
    expect(side.x).toBeGreaterThan(0);
  });
});
