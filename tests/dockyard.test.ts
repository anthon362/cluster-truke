import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS, findLevel } from '../src/level/levels';
import { initPhysics } from '../src/physics/world';
import { type Script, dropTo, hopLane, play, ride, runForward, summary } from './levelBots';

const SEEDS = [1, 2, 3, 4, 5, 6];

beforeAll(async () => {
  await initPhysics();
});

interface Case {
  id: string;
  /** The no-ability demonstration for this level. */
  demo: () => Script;
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
  { id: '1-5', demo: dropTo('lower', 2, 1), demoName: 'leap to the lower convoy', minWins: 4 },
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
