import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SpareRig } from '../src/abilities/spareRig';
import type { Tailwind } from '../src/abilities/tailwind';
import type { TowLine } from '../src/abilities/towLine';
import { ABILITIES, type AbilityId } from '../src/config/abilities';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { TEST_LEVELS, findLevel } from '../src/level/levels';
import { GROUP, RAPIER, groups, initPhysics } from '../src/physics/world';
import { input, run } from './helpers';

const A = TUNING.abilities;
const P = TUNING.player;
const T = TUNING.truck;
const HZ = 1 / TUNING.loop.fixedStep;
const dt = TUNING.loop.fixedStep;

beforeAll(async () => {
  await initPhysics();
});

const single = (movement: AbilityId | null, utility: AbilityId | null = null, god = true) =>
  new Sim({ seed: 1, god, level: TEST_LEVELS.single, movement, utility });

/** Highest point reached above the starting height while running `steps` with `inp`. */
function apex(sim: Sim, steps: number, inp = input()): number {
  const y0 = sim.player.pos.y;
  let top = 0;
  run(sim, steps, inp, () => (top = Math.max(top, sim.player.pos.y - y0)));
  return top;
}

describe('ability table', () => {
  it('has six movement and six utility abilities with unique ids and sane costs', () => {
    expect(ABILITIES.filter((a) => a.slot === 'movement').length).toBe(6);
    expect(ABILITIES.filter((a) => a.slot === 'utility').length).toBe(6);
    expect(new Set(ABILITIES.map((a) => a.id)).size).toBe(12);
    expect(new Set(ABILITIES.map((a) => a.name)).size).toBe(12);
    for (const a of ABILITIES) expect(a.cost).toBeGreaterThanOrEqual(10000);
  });

  it('every ability can be equipped, used and reset without errors', () => {
    for (const a of ABILITIES) {
      const sim = new Sim({
        seed: 2,
        god: true,
        level: TEST_LEVELS.convoy,
        movement: a.slot === 'movement' ? a.id : null,
        utility: a.slot === 'utility' ? a.id : null,
      });
      const held = input({ primaryHeld: true, secondaryHeld: true, pitch: -0.5, moveF: 1 });
      run(sim, 40, held);
      run(sim, 1, input({ jumpPressed: true, jumpHeld: true, primaryHeld: true, secondaryHeld: true }));
      run(sim, 90, held);
      run(sim, 30, input());
      sim.reset();
      run(sim, 30, input());
      const ab = sim.abilities.get(a.id)!;
      expect(ab.energy01).toBeGreaterThanOrEqual(0);
      expect(ab.energy01).toBeLessThanOrEqual(1);
      expect(Number.isFinite(sim.player.pos.x + sim.player.pos.y + sim.player.pos.z)).toBe(true);
    }
  });

  it('refuses an ability in the wrong slot', () => {
    const sim = single(null);
    expect(() => sim.abilities.equip('utility', 'lunge')).toThrow();
  });
});

describe('SECOND WIND', () => {
  it('gives exactly one weaker jump in the air, recharged by landing', () => {
    const sim = single('secondWind');
    run(sim, 5, input());
    run(sim, 20, input({ jumpPressed: true, jumpHeld: true }));
    const vy = sim.player.vel.y;
    sim.step(input({ jumpPressed: true, jumpHeld: true }));
    expect(sim.player.airJumped).toBe(true);
    expect(sim.player.vel.y).toBeGreaterThan(vy);
    expect(sim.player.vel.y).toBeLessThan(P.jumpVelocity);
    // A third press does nothing.
    run(sim, 5, input({ jumpHeld: true }));
    const before = sim.player.vel.y;
    sim.step(input({ jumpPressed: true, jumpHeld: true }));
    expect(sim.player.airJumped).toBe(false);
    expect(sim.player.vel.y).toBeLessThan(before);
    // Land, then it works again.
    for (let i = 0; i < 300 && !sim.player.grounded; i++) sim.step(input());
    expect(sim.abilities.movement!.energy01).toBe(1);
  });

  it('reaches clearly higher than a plain jump', () => {
    const plain = single(null);
    run(plain, 5, input());
    const base = apex(plain, 80, input({ jumpPressed: true, jumpHeld: true }));
    const sim = single('secondWind');
    run(sim, 5, input());
    const y0 = sim.player.pos.y;
    let top = 0;
    const track = () => (top = Math.max(top, sim.player.pos.y - y0));
    run(sim, 26, input({ jumpPressed: true, jumpHeld: true }), track);
    run(sim, 60, input({ jumpPressed: true, jumpHeld: true }), track);
    expect(top).toBeGreaterThan(base + 1);
  });
});

describe('LUNGE', () => {
  it('adds about the set speed along the view direction, then cools down', () => {
    const sim = single('lunge');
    run(sim, 5, input());
    run(sim, 10, input({ jumpPressed: true, jumpHeld: true }));
    const before = sim.player.vel.clone();
    // Look straight along +X (yaw -90 degrees), level.
    const aim = { yaw: -Math.PI / 2, pitch: 0 };
    run(sim, Math.ceil(A.lunge.duration * HZ) + 1, input({ ...aim, primaryHeld: true }));
    const gained = sim.player.vel.x - before.x;
    expect(gained).toBeGreaterThan(A.lunge.speed * 0.9);
    expect(gained).toBeLessThan(A.lunge.speed * 1.1);
    expect(sim.abilities.movement!.cooldown01).toBeGreaterThan(0.9);
    // Pressing again during the cooldown does nothing.
    run(sim, 2, input(aim));
    const vx = sim.player.vel.x;
    run(sim, 12, input({ ...aim, primaryHeld: true }));
    expect(sim.player.vel.x).toBeLessThanOrEqual(vx + 0.01);
    run(sim, Math.ceil(A.lunge.cooldown * HZ), input());
    expect(sim.abilities.movement!.cooldown01).toBe(0);
  });
});

describe('HANG TIME', () => {
  it('holds height while held, runs out, and recharges', () => {
    const sim = single('hangTime');
    run(sim, 5, input());
    run(sim, 28, input({ jumpPressed: true, jumpHeld: true })); // near the top
    const y = sim.player.pos.y;
    run(sim, 60, input({ primaryHeld: true }));
    expect(Math.abs(sim.player.pos.y - y)).toBeLessThan(0.6);
    expect(sim.player.grounded).toBe(false);
    // Out of energy after the full duration: falling again.
    run(sim, Math.ceil(A.hangTime.duration * HZ) - 60 + 14, input({ primaryHeld: true }));
    expect(sim.abilities.movement!.energy01).toBe(0);
    expect(sim.player.vel.y).toBeLessThan(sim.player.frameVel.y - 1);
    run(sim, Math.ceil(A.hangTime.recharge * HZ) + 2, input());
    expect(sim.abilities.movement!.energy01).toBe(1);
  });

  it('keeps steering while hovering', () => {
    const sim = single('hangTime');
    run(sim, 5, input());
    run(sim, 20, input({ jumpPressed: true, jumpHeld: true }));
    const x = sim.player.pos.x;
    run(sim, 40, input({ primaryHeld: true, moveS: 1 }));
    expect(Math.abs(sim.player.pos.x - x)).toBeGreaterThan(1);
  });
});

describe('TOW LINE', () => {
  it('pulls the player to a hooked truck and costs nothing on a miss', () => {
    const sim = new Sim({ seed: 2, god: true, level: TEST_LEVELS.convoy, movement: 'towLine' });
    run(sim, 10, input());
    const tow = sim.abilities.get<TowLine>('towLine')!;
    // Aim at the sky: no hook, no cooldown.
    run(sim, 3, input({ pitch: 1.2, primaryHeld: true }));
    expect(tow.active).toBe(false);
    expect(tow.cooldown01).toBe(0);
    run(sim, 2, input());
    // Aim at the roof of the trailer ahead.
    const here = sim.player.groundTruck!;
    const target = sim.pool.find('main', here.assignment.row + 1, here.assignment.lane)!;
    const to = target.pos.clone().add(new Vector3(0, T.trailerRoof, -1.4)).sub(sim.player.pos).add(new Vector3(0, -A.towLine.eyeHeight, 0));
    const aim = { yaw: Math.atan2(-to.x, -to.z), pitch: Math.atan2(to.y, Math.hypot(to.x, to.z)) };
    const d0 = sim.player.pos.distanceTo(target.pos);
    sim.step(input({ ...aim, primaryHeld: true }));
    expect(tow.active).toBe(true);
    let closest = d0;
    for (let i = 0; i < 3 * HZ && tow.active; i++) {
      // Holding jump climbs the trailer's back if the pull ends up against it.
      sim.step(input({ ...aim, primaryHeld: true, jumpHeld: true }));
      closest = Math.min(closest, sim.player.pos.distanceTo(tow.hookPoint));
    }
    expect(closest).toBeLessThan(A.towLine.releaseDistance + 0.5);
    expect(tow.cooldown01).toBeGreaterThan(0);
  });

  it('letting go early stops the pull', () => {
    const sim = new Sim({ seed: 2, god: true, level: TEST_LEVELS.convoy, movement: 'towLine' });
    run(sim, 10, input());
    const tow = sim.abilities.get<TowLine>('towLine')!;
    const aim = { yaw: Math.PI, pitch: -0.12 };
    run(sim, 6, input({ ...aim, primaryHeld: true }));
    expect(tow.active).toBe(true);
    sim.step(input(aim));
    expect(tow.active).toBe(false);
  });
});

describe('SLIPSTREAM and KICK OFF', () => {
  const jumpSpeed = (movement: AbilityId | null, wait: number) => {
    const sim = single(movement);
    run(sim, wait, input());
    run(sim, 12, input({ moveF: 1, sprint: true }));
    run(sim, 4, input({ moveF: 1, sprint: true, jumpPressed: true, jumpHeld: true }));
    return { sim, speed: sim.player.relativeSpeed };
  };

  it('SLIPSTREAM: a charged jump is faster; an uncharged one is not', () => {
    const base = jumpSpeed(null, 150).speed;
    const charged = jumpSpeed('slipstream', 150).speed;
    expect(charged - base).toBeGreaterThan(A.slipstream.boost * 0.8);
    expect(charged - base).toBeLessThan(A.slipstream.boost * 1.1);
  });

  it('KICK OFF: the jump adds speed and shoves the truck back', () => {
    const base = jumpSpeed(null, 30);
    const kicked = jumpSpeed('kickOff', 30);
    expect(kicked.speed - base.speed).toBeGreaterThan(A.kickOff.playerBoost * 0.7);
    expect(kicked.sim.trucks[0].pos.z).toBeLessThan(base.sim.trucks[0].pos.z - 0.05);
  });
});

describe('SLOW LANE', () => {
  it('slows time while held, for a limited real time, then refills after a pause', () => {
    const sim = single(null, 'slowLane');
    run(sim, 5, input());
    sim.step(input({ secondaryHeld: true }));
    expect(sim.timeScale).toBe(A.slowLane.timeScale);
    // The meter is in real seconds: it lasts duration * timeScale of simulated time.
    const simSteps = Math.ceil(A.slowLane.duration * A.slowLane.timeScale * HZ) + 2;
    run(sim, simSteps, input({ secondaryHeld: true }));
    expect(sim.abilities.utility!.energy01).toBe(0);
    expect(sim.timeScale).toBe(1);
    sim.step(input());
    expect(sim.timeScale).toBe(1);
    run(sim, Math.floor(A.slowLane.refillDelay * HZ) - 3, input());
    expect(sim.abilities.utility!.energy01).toBe(0);
    run(sim, Math.ceil(A.slowLane.refillTime * HZ) + 6, input());
    expect(sim.abilities.utility!.energy01).toBe(1);
  });
});

describe('SPARE RIG', () => {
  /** Does the truck's bounding box overlap any other truck, scenery or hazard? */
  function overlapsAnything(sim: Sim, truck: Sim['trucks'][number]): boolean {
    const shape = new RAPIER.Cuboid(T.width / 2 - 0.05, T.trailerRoof / 2 - 0.05, T.length / 2 - 0.05);
    const centre = new Vector3(0, T.trailerRoof / 2, 0).applyQuaternion(truck.rot).add(truck.pos);
    let hit = false;
    sim.physics.world.intersectionsWithShape(
      centre,
      truck.rot,
      shape,
      () => {
        hit = true;
        return false;
      },
      undefined,
      groups(GROUP.TRUCK, GROUP.TRUCK | GROUP.WORLD | GROUP.HAZARD),
      undefined,
      truck.body,
    );
    return hit;
  }

  it('throwing it brings in a truck that then drives along the road', () => {
    const sim = single(null, 'spareRig');
    const rig = sim.abilities.get<SpareRig>('spareRig')!;
    const spare = sim.trucks.find((t) => t.spare)!;
    expect(spare.state).toBe('gone');
    run(sim, 5, input());
    // Throw forward and a little down, onto the road ahead.
    sim.step(input({ pitch: -0.1, secondaryHeld: true }));
    for (let i = 0; i < 3 * HZ && rig.spawned === 0; i++) sim.step(input());
    expect(rig.spawned).toBe(1);
    expect(spare.state).toBe('alive');
    run(sim, 2 * HZ, input());
    expect(spare.driving).toBe(true);
    expect(spare.body.linvel().z).toBeGreaterThan(10);
    expect(sim.explosions).toBe(0);
  });

  it('never appears inside geometry, even when aimed straight into it', () => {
    const cases: [string, Vector3][] = [
      ['inside a block', new Vector3(45, 1.5, 400)],
      ['on a block', new Vector3(45, 3.5, 400)],
      ['inside a truck', new Vector3(0, 1, 0)],
    ];
    for (const [name, point] of cases) {
      const sim = new Sim({ seed: 21, god: true, level: TEST_LEVELS.block, utility: 'spareRig' });
      run(sim, 3, input());
      const rig = sim.abilities.get<SpareRig>('spareRig')!;
      if (name === 'inside a truck') point.copy(sim.pool.find('main', 10, 1)!.pos).add(new Vector3(0, 1, 0));
      const ok = rig.spawnAt(point);
      const spare = sim.trucks.find((t) => t.spare && t.state === 'alive');
      expect(ok, name).toBe(true);
      expect(overlapsAnything(sim, spare!), name).toBe(false);
      // No violent ejection afterwards.
      let top = 0;
      run(sim, 30, input(), () => {
        const v = spare!.body.linvel();
        top = Math.max(top, Math.hypot(v.x, v.y, v.z));
      });
      expect(top, name).toBeLessThan(30);
    }
  });

  it('is put away again on restart', () => {
    const sim = single(null, 'spareRig');
    const bodies = sim.physics.bodyCount;
    run(sim, 5, input());
    sim.abilities.get<SpareRig>('spareRig')!.spawnAt(new Vector3(0, 0.1, 60));
    sim.reset();
    expect(sim.trucks.filter((t) => t.spare).every((t) => t.state === 'gone')).toBe(true);
    expect(sim.physics.bodyCount).toBe(bodies);
  });
});

describe('ROAD FLARE', () => {
  it('makes nearby trucks swerve away from where it lands', () => {
    const offsets = (utility: AbilityId | null) => {
      const sim = new Sim({ seed: 6, god: true, level: findLevel('1-1')!, utility });
      run(sim, 10, input());
      // Throw onto the road ahead, in the middle lane.
      sim.step(input({ pitch: -0.25, secondaryHeld: true }));
      let widest = 0;
      run(sim, 3 * HZ, input(), () => {
        for (const t of sim.trucks) {
          if (!t.driving || t.assignment.lane === 1) continue;
          widest = Math.max(widest, Math.abs(t.assignment.path.lateralAt(t.pos, t.s)));
        }
      });
      return widest;
    };
    expect(offsets('roadFlare')).toBeGreaterThan(offsets(null) + 1);
  });
});

describe('MAGNET BOOTS', () => {
  it('keeps the player on a truck that is thrown into a spin', () => {
    const tossed = (utility: AbilityId | null) => {
      const sim = single(null, utility);
      run(sim, 5, input());
      const truck = sim.trucks[0];
      run(sim, 2, input({ secondaryHeld: true }));
      truck.body.applyImpulse({ x: 0, y: 9 * T.mass, z: 0 }, true);
      truck.body.applyTorqueImpulse({ x: 0, y: 0, z: 2.5 * T.mass * 8 }, true);
      run(sim, 40, input({ secondaryHeld: true }));
      return { sim, onTruck: sim.player.grounded && sim.player.groundTruck === truck };
    };
    expect(tossed(null).onTruck).toBe(false);
    const held = tossed('magnetBoots');
    expect(held.onTruck).toBe(true);
    // Letting go ends the lock.
    held.sim.step(input());
    expect(held.sim.player.magnet).toBe(false);
  });

  it('runs out of energy', () => {
    const sim = single(null, 'magnetBoots');
    run(sim, 5, input());
    run(sim, Math.ceil(A.magnetBoots.duration * HZ) + 2, input({ secondaryHeld: true }));
    expect(sim.abilities.utility!.energy01).toBe(0);
    expect(sim.player.magnet).toBe(false);
  });
});

describe('TAILWIND', () => {
  it('speeds up nearby trucks for a few seconds, then they settle back', () => {
    const sim = new Sim({ seed: 2, god: true, level: TEST_LEVELS.convoy, utility: 'tailwind' });
    run(sim, 30, input());
    const mine = sim.player.groundTruck!;
    const far = sim.pool.find('main', 19, 1)!;
    sim.step(input({ secondaryHeld: true }));
    const wind = sim.abilities.get<Tailwind>('tailwind')!;
    expect(wind.lastBoosted).toBeGreaterThan(3);
    expect(wind.lastBoosted).toBeLessThan(30);
    const speed = (t: typeof mine) => Math.hypot(t.body.linvel().x, t.body.linvel().z);
    let top = 0;
    let farTop = 0;
    run(sim, Math.ceil(A.tailwind.duration * HZ), input(), () => {
      top = Math.max(top, speed(mine));
      farTop = Math.max(farTop, speed(far));
    });
    expect(top).toBeGreaterThan(T.cruiseSpeed * 1.15);
    expect(farTop).toBeLessThan(T.cruiseSpeed * 1.25);
    run(sim, 4 * HZ, input());
    expect(speed(mine)).toBeLessThan(T.cruiseSpeed * 1.25);
  });
});

describe('SHOWTIME', () => {
  it('slows time and doubles points earned while it runs', () => {
    const sim = single(null, 'showtime');
    run(sim, 5, input());
    sim.step(input({ secondaryHeld: true }));
    sim.step(input());
    expect(sim.cinematic).toBe(true);
    expect(sim.timeScale).toBe(A.showtime.timeScale);
    expect(sim.score.multiplier).toBe(A.showtime.multiplier);
    const truck = sim.trucks[0];
    const v = truck.body.linvel();
    sim.player.placeInAir(new Vector3(0, 30, -1.4).add(truck.pos), new Vector3(v.x, 0, v.z));
    for (let i = 0; i < 4 * HZ && !sim.player.grounded; i++) sim.step(input());
    const doubled = sim.score.total;
    // Same fall without the ability.
    const plain = single(null);
    run(plain, 7, input());
    const pv = plain.trucks[0].body.linvel();
    plain.player.placeInAir(new Vector3(0, 30, -1.4).add(plain.trucks[0].pos), new Vector3(pv.x, 0, pv.z));
    for (let i = 0; i < 4 * HZ && !plain.player.grounded; i++) plain.step(input());
    expect(doubled).toBeGreaterThan(plain.score.total * 1.8);
    // It ends on its own.
    run(sim, Math.ceil(A.showtime.duration * HZ), input());
    expect(sim.cinematic).toBe(false);
    expect(sim.timeScale).toBe(1);
    expect(sim.score.multiplier).toBe(1);
  });
});

describe('velocity clamps hold with every ability', () => {
  it('neither the player nor any truck exceeds its limit under ability spam', () => {
    for (const a of ABILITIES) {
      const sim = new Sim({
        seed: 4,
        god: true,
        level: TEST_LEVELS.block,
        movement: a.slot === 'movement' ? a.id : null,
        utility: a.slot === 'utility' ? a.id : null,
      });
      let playerTop = 0;
      let truckTop = 0;
      for (let i = 0; i < 12 * HZ; i++) {
        const on = Math.floor(i / 7) % 2 === 0;
        sim.step(
          input({
            moveF: 1,
            sprint: true,
            pitch: i % 90 < 45 ? 0.6 : -0.6,
            primaryHeld: on,
            secondaryHeld: on,
            jumpPressed: i % 23 === 0,
            jumpHeld: i % 23 < 12,
          }),
        );
        playerTop = Math.max(playerTop, sim.player.vel.length());
        for (const t of sim.trucks) {
          if (!t.isSolid) continue;
          const v = t.body.linvel();
          truckTop = Math.max(truckTop, Math.hypot(v.x, v.y, v.z));
        }
      }
      expect(playerTop, a.id).toBeLessThanOrEqual(P.maxSpeed + 0.01);
      expect(truckTop, a.id).toBeLessThanOrEqual(TUNING.physics.maxTruckSpeed + dt * TUNING.physics.gravity + 0.01);
    }
  }, 180000);
});
