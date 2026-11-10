import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { initPhysics } from '../src/physics/world';
import { input, run } from './helpers';

const P = TUNING.player;
const T = TUNING.truck;
const HZ = 1 / TUNING.loop.fixedStep;

beforeAll(async () => {
  await initPhysics();
});

function relZ(sim: Sim): number {
  return sim.player.pos.z - sim.trucks[0].pos.z;
}

describe('standing on a moving truck', () => {
  it('stays put with no drift or jitter for 30 s', () => {
    const sim = new Sim({ seed: 1 });
    const startRelZ = relZ(sim);
    const startX = sim.player.pos.x;
    let maxDev = 0;
    let maxYDev = 0;
    let ungrounded = 0;
    let y0 = 0;
    run(sim, 30 * HZ, input(), (i) => {
      if (i === 10) y0 = sim.player.pos.y;
      if (i > 10) maxYDev = Math.max(maxYDev, Math.abs(sim.player.pos.y - y0));
      maxDev = Math.max(
        maxDev,
        Math.abs(relZ(sim) - startRelZ),
        Math.abs(sim.player.pos.x - startX),
      );
      if (!sim.player.grounded) ungrounded++;
    });
    expect(sim.falls).toBe(0);
    expect(ungrounded).toBe(0);
    expect(maxDev).toBeLessThan(0.01);
    expect(maxYDev).toBeLessThan(0.002);
    // The truck really did travel.
    expect(sim.trucks[0].pos.z).toBeGreaterThan(T.cruiseSpeed * 29);
  });

  it('truck holds its lane and cruise speed', () => {
    const sim = new Sim({ seed: 1 });
    run(sim, 20 * HZ, input());
    const truck = sim.trucks[0];
    expect(Math.abs(truck.pos.x)).toBeLessThan(0.05);
    expect(truck.body.linvel().z).toBeCloseTo(T.cruiseSpeed, 1);
    expect(truck.driving).toBe(true);
  });
});

describe('running', () => {
  it('reaches walk and sprint speed relative to the truck', () => {
    const sim = new Sim({ seed: 1 });
    run(sim, 15, input({ moveF: 1 }));
    expect(sim.player.relativeSpeed).toBeCloseTo(P.walkSpeed, 3);
    const sim2 = new Sim({ seed: 1 });
    run(sim2, 15, input({ moveF: 1, sprint: true }));
    expect(sim2.player.relativeSpeed).toBeCloseTo(P.sprintSpeed, 3);
    expect(sim2.player.vel.z).toBeCloseTo(T.cruiseSpeed + P.sprintSpeed, 1);
  });

  it('is slow sideways and backward, fastest on the diagonal', () => {
    const speedFor = (f: number, s: number) => {
      const sim = new Sim({ seed: 1, god: true });
      run(sim, 17, input({ moveF: f, moveS: s, sprint: true }));
      return sim.player.relativeSpeed;
    };
    const side = P.sprintSpeed * P.strafeMultiplier;
    expect(speedFor(0, 1)).toBeCloseTo(side, 3);
    expect(speedFor(-1, 0)).toBeCloseTo(side, 3);
    expect(speedFor(1, 1)).toBeCloseTo(Math.hypot(P.sprintSpeed, side), 3);
  });
});

describe('jumping', () => {
  it('standing jump inherits truck speed and lands on the same spot', () => {
    const sim = new Sim({ seed: 1 });
    run(sim, 30, input());
    const before = relZ(sim);
    const y0 = sim.player.pos.y;
    let apex = 0;
    let airSteps = 0;
    run(sim, 90, input({ jumpPressed: true, jumpHeld: true }), () => {
      apex = Math.max(apex, sim.player.pos.y - y0);
      if (!sim.player.grounded) airSteps++;
    });
    expect(sim.player.grounded).toBe(true);
    expect(sim.falls).toBe(0);
    expect(Math.abs(relZ(sim) - before)).toBeLessThan(0.05);
    const expectedApex = (P.jumpVelocity * P.jumpVelocity) / (2 * P.gravity);
    expect(apex).toBeGreaterThan(expectedApex - 0.15);
    expect(apex).toBeLessThan(expectedApex + 0.1);
    const expectedAir = (2 * P.jumpVelocity) / P.gravity;
    expect(Math.abs(airSteps / HZ - expectedAir)).toBeLessThan(0.06);
  });

  it('releasing jump early gives a clearly lower jump', () => {
    const apexFor = (holdSteps: number) => {
      const sim = new Sim({ seed: 1 });
      run(sim, 10, input());
      const y0 = sim.player.pos.y;
      let apex = 0;
      const track = () => (apex = Math.max(apex, sim.player.pos.y - y0));
      run(sim, holdSteps, input({ jumpPressed: true, jumpHeld: true }), track);
      run(sim, 90, input(), track);
      return apex;
    };
    const full = apexFor(60);
    const short = apexFor(3);
    expect(short).toBeLessThan(full * 0.6);
    expect(short).toBeGreaterThan(0.3);
  });

  it('buffers a jump pressed just before landing', () => {
    const sim = new Sim({ seed: 1 });
    run(sim, 10, input());
    run(sim, 1, input({ jumpPressed: true, jumpHeld: true }));
    let landedAt = -1;
    let i = 0;
    // Find the landing step, then replay pressing jump a few steps earlier.
    while (landedAt < 0 && i < 200) {
      sim.step(input({ jumpHeld: false }));
      i++;
      if (sim.player.grounded) landedAt = i;
    }
    expect(landedAt).toBeGreaterThan(0);

    const sim2 = new Sim({ seed: 1 });
    run(sim2, 10, input());
    run(sim2, 1, input({ jumpPressed: true, jumpHeld: true }));
    const early = Math.floor(P.jumpBuffer * HZ) - 2;
    run(sim2, landedAt - early - 1, input());
    run(sim2, 1, input({ jumpPressed: true, jumpHeld: true }));
    run(sim2, early + 3, input({ jumpHeld: true }));
    expect(sim2.player.grounded).toBe(false);
    expect(sim2.player.vel.y).toBeGreaterThan(0);
  });

  it('sprint-jump travels about a truck length relative to the truck', () => {
    const sim = new Sim({ seed: 1, god: true });
    // Run backward first for room, then sprint forward and jump off the trailer.
    run(sim, 20, input({ moveF: 1, sprint: true }));
    const start = relZ(sim);
    run(sim, 1, input({ moveF: 1, sprint: true, jumpPressed: true, jumpHeld: true }));
    const y0 = sim.player.pos.y;
    let dist = 0;
    for (let i = 0; i < 120; i++) {
      sim.step(input({ moveF: 1, sprint: true, jumpHeld: true }));
      if (sim.player.pos.y <= y0 && sim.player.vel.y < 0) {
        dist = relZ(sim) - start;
        break;
      }
    }
    expect(dist).toBeGreaterThan(11.5);
    expect(dist).toBeLessThan(13.5);
  });
});

describe('coyote time', () => {
  /** Walk off the rear edge of the trailer and try to jump `delay` s later. */
  function jumpAfterLeaving(delaySteps: number): boolean {
    const sim = new Sim({ seed: 1, god: true });
    const back = input({ moveF: -1 });
    let guard = 0;
    while (sim.player.grounded && guard++ < 600) sim.step(back);
    expect(sim.player.grounded).toBe(false);
    // The step that left the ground already counts as one airborne step.
    run(sim, delaySteps - 1, back);
    const vyBefore = sim.player.vel.y;
    sim.step({ ...back, jumpPressed: true, jumpHeld: true });
    return sim.player.vel.y > vyBefore + P.jumpVelocity * 0.5;
  }

  it('allows a jump shortly after running off an edge', () => {
    expect(jumpAfterLeaving(Math.floor(P.coyoteTime * HZ) - 1)).toBe(true);
  });

  it('refuses a jump after the window', () => {
    expect(jumpAfterLeaving(Math.ceil(P.coyoteTime * HZ) + 3)).toBe(false);
  });

  it('gives no second jump in the air', () => {
    const sim = new Sim({ seed: 1, god: true });
    run(sim, 5, input());
    run(sim, 5, input({ jumpPressed: true, jumpHeld: true }));
    const vy = sim.player.vel.y;
    run(sim, 1, input({ jumpPressed: true, jumpHeld: true }));
    expect(sim.player.vel.y).toBeLessThan(vy);
  });
});

describe('truck geometry', () => {
  it('lets the player step down onto the cab, which is lower than the trailer', () => {
    const sim = new Sim({ seed: 1, god: true });
    const yTrailer = sim.player.feetY;
    let guard = 0;
    // Walk forward off the trailer front; the cab roof should catch the player.
    while (guard++ < 3000) {
      // Tap forward so the approach is slow enough not to overshoot the cab.
      sim.step(input({ moveF: guard % 6 < 2 ? 1 : 0 }));
      if (sim.player.grounded && sim.player.feetY < yTrailer - 0.5) break;
    }
    run(sim, 20, input());
    expect(sim.player.grounded).toBe(true);
    expect(sim.player.feetY).toBeCloseTo(T.cabRoof + P.skin, 1);
    expect(yTrailer - sim.player.feetY).toBeCloseTo(T.trailerRoof - T.cabRoof, 1);
  });

  it('resets when the player touches the ground', () => {
    const sim = new Sim({ seed: 1 });
    run(sim, 300, input({ moveS: 1, sprint: true }));
    expect(sim.falls).toBeGreaterThan(0);
  });
});
