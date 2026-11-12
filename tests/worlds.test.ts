import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEVELS, findLevel } from '../src/level/levels';
import { campaignLevels, isUnlocked, nextCampaignLevel } from '../src/level/progress';
import { initPhysics } from '../src/physics/world';
import {
  type Script,
  dodgeBeams,
  dodgeRotors,
  dropTo,
  either,
  hopBars,
  hopBeams,
  hopTo,
  play,
  ride,
  summary,
  toCab,
} from './levelBots';

const SEEDS = [1, 2, 3, 4, 5, 6];

beforeAll(async () => {
  await initPhysics();
});

interface Case {
  id: string;
  demo: () => Script;
  demoName: string;
  /** Minimum wins out of the six seeds; chaos is allowed to cost some. */
  minWins: number;
}

const CASES: Case[] = [
  { id: '2-1', demo: hopBars, demoName: 'riding, jumping the signs', minWins: 4 },
  { id: '2-2', demo: hopBars, demoName: 'riding, jumping the sign', minWins: 4 },
  {
    id: '2-3',
    demo: dropTo('lower', 2, -1, false),
    demoName: 'dropping to the lower convoy',
    minWins: 4,
  },
  {
    id: '2-4',
    demo: hopTo('carried', 3, 1),
    demoName: 'one hop onto the carried trucks',
    minWins: 4,
  },
  { id: '2-5', demo: hopBars, demoName: 'riding, jumping the signs', minWins: 4 },
  {
    id: '2-6',
    demo: either(dropTo('lower', 9, -1, false), hopBars),
    demoName: 'jumping signs, then dropping to the lower convoy',
    minWins: 3,
  },
  { id: '3-1', demo: ride, demoName: 'riding one truck', minWins: 4 },
  { id: '3-2', demo: dodgeRotors, demoName: 'riding, changing lane for the rotor', minWins: 4 },
  { id: '3-3', demo: ride, demoName: 'riding one truck', minWins: 3 },
  { id: '3-4', demo: ride, demoName: 'riding one truck', minWins: 4 },
  { id: '3-5', demo: dodgeRotors, demoName: 'riding, changing lane for the rotors', minWins: 3 },
  {
    id: '3-6',
    demo: either(hopTo('side', 18, 1, false, true), dodgeRotors),
    demoName: 'dodging the rotor, then hopping to the side convoy',
    minWins: 3,
  },
  { id: '4-1', demo: hopBeams, demoName: 'riding, jumping the beams', minWins: 4 },
  { id: '4-2', demo: toCab, demoName: 'riding on the cab, under the beams', minWins: 4 },
  { id: '4-3', demo: dodgeBeams, demoName: 'riding, changing lane for the columns', minWins: 4 },
  { id: '4-4', demo: ride, demoName: 'riding one truck through the gaps', minWins: 4 },
  { id: '4-5', demo: hopBeams, demoName: 'riding, jumping the turning beams', minWins: 3 },
  {
    id: '4-6',
    demo: either(hopTo('side', 18, 1, false, true), hopBeams, dodgeBeams),
    demoName: 'jumping and dodging beams, then hopping to the side convoy',
    minWins: 3,
  },
];

describe('worlds 2 to 4 are completable without abilities', () => {
  it('each has six levels, in order', () => {
    for (const [world, n] of [
      ['overpass', 2],
      ['whiteout', 3],
      ['nightfreight', 4],
    ] as const) {
      const ids = LEVELS.filter((l) => l.world === world).map((l) => l.id);
      expect(ids).toEqual([1, 2, 3, 4, 5, 6].map((i) => `${n}-${i}`));
    }
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
      const best = Math.min(...wins.map((r) => r.time));
      expect(best, line).toBeGreaterThan(level.parTime);
      expect(best, line).toBeLessThan(level.parTime * 2);
    }, 180000);
  }

  it('writes the completion report (worlds-report.txt)', () => {
    writeFileSync('worlds-report.txt', report.join('\n') + '\n');
    expect(report.length).toBe(CASES.length);
  });
});

describe('unlock order', () => {
  it('opens levels one at a time, and the next world after the last level of a world', () => {
    const campaign = campaignLevels(LEVELS);
    expect(campaign.length).toBe(24);
    const times: Record<string, number> = {};
    expect(isUnlocked(findLevel('1-1')!, LEVELS, times)).toBe(true);
    expect(isUnlocked(findLevel('1-2')!, LEVELS, times)).toBe(false);
    expect(isUnlocked(findLevel('2-1')!, LEVELS, times)).toBe(false);
    times['1-1'] = 20;
    expect(isUnlocked(findLevel('1-2')!, LEVELS, times)).toBe(true);
    expect(isUnlocked(findLevel('1-3')!, LEVELS, times)).toBe(false);
    for (const id of ['1-2', '1-3', '1-4', '1-5']) times[id] = 20;
    expect(isUnlocked(findLevel('2-1')!, LEVELS, times)).toBe(false);
    times['1-6'] = 20;
    expect(isUnlocked(findLevel('2-1')!, LEVELS, times)).toBe(true);
    expect(isUnlocked(findLevel('3-1')!, LEVELS, times)).toBe(false);
  });

  it('test levels are always open and are not part of the campaign', () => {
    expect(isUnlocked(findLevel('test-convoy')!, LEVELS, {})).toBe(true);
    expect(nextCampaignLevel(findLevel('test-convoy')!, LEVELS)).toBeUndefined();
  });

  it('next level crosses from one world into the next and stops at the end', () => {
    expect(nextCampaignLevel(findLevel('1-6')!, LEVELS)?.id).toBe('2-1');
    expect(nextCampaignLevel(findLevel('2-6')!, LEVELS)?.id).toBe('3-1');
    expect(nextCampaignLevel(findLevel('3-6')!, LEVELS)?.id).toBe('4-1');
    expect(nextCampaignLevel(findLevel('4-6')!, LEVELS)).toBeUndefined();
  });
});
