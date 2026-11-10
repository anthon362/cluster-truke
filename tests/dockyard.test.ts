import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { LEVELS, findLevel } from '../src/level/levels';
import type { LevelDef } from '../src/level/schema';
import { initPhysics } from '../src/physics/world';
import { NO_INPUT, type MoveInput } from '../src/player/movement';
import { bot } from './helpers';

const HZ = 1 / TUNING.loop.fixedStep;
const SEEDS = [1, 2, 3, 4, 5, 6];

beforeAll(async () => {
  await initPhysics();
});

/** What a scripted no-ability player does at time `t`. Returning null means "just ride". */
export type Script = (sim: Sim, t: number) => MoveInput | null;

/** Input that moves toward a world-space direction. */
function toward(dx: number, dz: number, extra: Partial<MoveInput> = {}): MoveInput {
  return { ...NO_INPUT, yaw: Math.atan2(-dx, -dz), moveF: 1, ...extra };
}

interface Outcome {
  seed: number;
  won: boolean;
  time: number;
  reason: string;
}

function play(level: LevelDef, script: Script, seed: number): Outcome {
  const sim = new Sim({ seed, level });
  const limit = level.parTime * 4 * HZ;
  for (let i = 0; i < limit && sim.state === 'playing'; i++) {
    sim.step(script(sim, sim.time) ?? NO_INPUT);
  }
  return {
    seed,
    won: sim.state === 'won',
    time: sim.time,
    reason: sim.failReason ?? (sim.state === 'playing' ? 'timeout' : ''),
  };
}

function summary(level: LevelDef, label: string, results: Outcome[]): string {
  const wins = results.filter((r) => r.won);
  const best = wins.length ? Math.min(...wins.map((r) => r.time)).toFixed(1) : '-';
  const fails = results
    .filter((r) => !r.won)
    .map((r) => `seed ${r.seed}: ${r.reason} at ${r.time.toFixed(1)}s`);
  return `${level.id} ${label}: ${wins.length}/${results.length} wins, best ${best}s, par ${level.parTime}s${fails.length ? ' [' + fails.join('; ') + ']' : ''}`;
}

const ride: Script = () => null;
const runForward: Script = (sim) => {
  // Run the convoy forward; once on the lead row there is nothing to hop to, so ride.
  const here = sim.player.groundTruck ?? sim.player.lastTruck!;
  const a = here.assignment;
  const hasNext = !!sim.pool.find(a.convoy, a.row + 1, a.lane);
  return hasNext || !sim.player.grounded ? bot(sim, 1) : null;
};

/** One sideways hop to the next lane on the given side (+1 = toward +X). */
function hopLane(at: number, side: 1 | -1): Script {
  return (sim, t) => {
    if (t < at || t > at + 0.6) return null;
    const first = t < at + TUNING.loop.fixedStep * 1.5;
    // A low jump (tap) covers about one lane at strafe speed.
    return toward(side, 0, { jumpPressed: first && sim.player.grounded });
  };
}

/**
 * Sprint sideways off the truck on the upper deck (no jump needed: the lower
 * quay is 6 m down), steer onto the lower convoy, grab a side if short.
 */
export const leaveDeck: Script = (sim, t) => {
  const p = sim.player;
  const onLower = (p.groundTruck ?? p.lastTruck)?.assignment.convoy === 'lower';
  if (p.grounded && onLower) return null;
  if (t < 2) return null;
  if (p.grounded) return toward(1, 0, { sprint: true });
  // In the air: line up with the nearest lower lane (x = 15 or 18.4), then let go.
  const lane = Math.abs(p.pos.x - 15) < Math.abs(p.pos.x - 18.4) ? 15 : 18.4;
  const dx = lane - p.pos.x;
  const falling = p.feetY < -1.5;
  if (dx > 2.5) return toward(1, 0, { sprint: true, jumpHeld: falling });
  if (dx < -1) return toward(-1, 0, { jumpHeld: falling });
  return { ...NO_INPUT, yaw: Math.PI, jumpHeld: falling };
};

interface Case {
  id: string;
  /** The no-ability demonstration for this level. */
  demo: Script;
  demoName: string;
  /** Minimum wins out of the seeds (chaos is allowed to cost a few). */
  minWins: number;
  /** Also check a fast run beats par. */
  runner?: boolean;
}

const CASES: Case[] = [
  { id: '1-1', demo: ride, demoName: 'riding one truck', minWins: 6, runner: true },
  { id: '1-2', demo: ride, demoName: 'riding one truck', minWins: 4 },
  { id: '1-3', demo: ride, demoName: 'riding one truck', minWins: 4, runner: true },
  { id: '1-4', demo: hopLane(1.0, 1), demoName: 'one lane change', minWins: 4 },
  { id: '1-5', demo: leaveDeck, demoName: 'leap to the lower convoy', minWins: 4 },
  { id: '1-6', demo: ride, demoName: 'riding one truck', minWins: 3 },
];

describe('DOCKYARD levels are completable without abilities', () => {
  it('there are six of them, in order', () => {
    const ids = LEVELS.filter((l) => l.world === 'dockyard').map((l) => l.id);
    expect(ids).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6']);
  });

  const report: string[] = [];
  for (const c of CASES) {
    it(`${c.id} by ${c.demoName}`, () => {
      const level = findLevel(c.id)!;
      const results = SEEDS.map((seed) => play(level, c.demo, seed));
      const line = summary(level, c.demoName, results);
      report.push(line);
      const wins = results.filter((r) => r.won);
      expect(wins.length, line).toBeGreaterThanOrEqual(c.minWins);
      // Riding should land between par and twice par.
      const best = Math.min(...wins.map((r) => r.time));
      expect(best, line).toBeGreaterThan(level.parTime);
      expect(best, line).toBeLessThan(level.parTime * 2);
    }, 120000);

    if (c.runner) {
      it(`${c.id} a fast run beats par`, () => {
        const level = findLevel(c.id)!;
        const results = SEEDS.slice(0, 4).map((seed) => play(level, runForward, seed));
        const line = summary(level, 'running the convoy', results);
        report.push(line);
        const wins = results.filter((r) => r.won);
        expect(wins.length, line).toBeGreaterThanOrEqual(2);
        expect(Math.min(...wins.map((r) => r.time)), line).toBeLessThan(level.parTime);
      }, 120000);
    }
  }

  it('writes the completion report (dockyard-report.txt)', () => {
    writeFileSync('dockyard-report.txt', report.join('\n') + '\n');
    expect(report.length).toBeGreaterThan(0);
  });
});
