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
  holdLine,
  hopBars,
  hopBeams,
  hopTo,
  play,
  ride,
  runCareful,
  runForward,
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
  /** The demonstration runs up the convoy, so it is not held to the riding-time window. */
  fast?: boolean;
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
  { id: '5-1', demo: ride, demoName: 'riding one truck over the plates', minWins: 5 },
  { id: '5-2', demo: ride, demoName: 'riding one truck over the kerbs', minWins: 5 },
  { id: '5-3', demo: dodgeBeams, demoName: 'riding, changing lane for the weights', minWins: 4 },
  {
    id: '5-4',
    demo: runForward,
    demoName: 'running up the convoy ahead of the boulder',
    minWins: 3,
    fast: true,
  },
  {
    id: '5-5',
    demo: dodgeBeams,
    demoName: 'riding over the kerbs, changing lane for the weight',
    minWins: 4,
  },
  {
    id: '5-6',
    demo: runForward,
    demoName: 'running up the convoy ahead of the boulder',
    minWins: 3,
    fast: true,
  },
  {
    id: '6-1',
    demo: holdLine(hopBeams),
    demoName: 'jumping the lines, steering into the wind',
    minWins: 5,
  },
  {
    id: '6-2',
    demo: holdLine(hopBeams),
    demoName: 'jumping the lines, steering into the gusts',
    minWins: 5,
  },
  {
    id: '6-3',
    demo: holdLine(dodgeBeams),
    demoName: 'leaving each marked truck',
    minWins: 4,
    fast: true,
  },
  {
    id: '6-4',
    demo: holdLine(hopBeams),
    demoName: 'jumping the lines as the wind changes side',
    minWins: 5,
  },
  {
    id: '6-5',
    demo: holdLine(either(dodgeBeams, hopBeams)),
    demoName: 'leaving marked trucks and jumping the lines',
    minWins: 3,
    fast: true,
  },
  {
    id: '6-6',
    demo: holdLine(either(dodgeBeams, hopBeams)),
    demoName: 'leaving marked trucks and jumping the lines in gusts',
    minWins: 4,
    fast: true,
  },
  { id: '7-1', demo: ride, demoName: 'riding one truck over the belts', minWins: 5 },
  { id: '7-2', demo: dodgeBeams, demoName: 'riding, changing lane for the presses', minWins: 4 },
  {
    id: '7-3',
    demo: runForward,
    demoName: 'running up the convoy ahead of the melt',
    minWins: 4,
    fast: true,
  },
  { id: '7-4', demo: dodgeBeams, demoName: 'riding, changing lane for the presses', minWins: 4 },
  {
    id: '7-5',
    demo: runCareful,
    demoName: 'running up the convoy, waiting out the belts',
    minWins: 3,
    fast: true,
  },
  {
    id: '7-6',
    demo: either(dodgeBeams, runCareful),
    demoName: 'running up the convoy, changing lane for the presses',
    minWins: 3,
    fast: true,
  },
];

describe('worlds 2 to 7 are completable without abilities', () => {
  it('each has six levels, in order', () => {
    for (const [world, n] of [
      ['overpass', 2],
      ['whiteout', 3],
      ['nightfreight', 4],
      ['quarry', 5],
      ['stormfront', 6],
      ['foundry', 7],
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
      // Riding should take longer than par; a run up the convoy only has to finish.
      if (!c.fast) expect(best, line).toBeGreaterThan(level.parTime);
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
    expect(campaign.length).toBe(42);
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
    expect(nextCampaignLevel(findLevel('4-6')!, LEVELS)?.id).toBe('5-1');
    expect(nextCampaignLevel(findLevel('5-6')!, LEVELS)?.id).toBe('6-1');
    expect(nextCampaignLevel(findLevel('6-6')!, LEVELS)?.id).toBe('7-1');
    expect(nextCampaignLevel(findLevel('7-6')!, LEVELS)).toBeUndefined();
  });
});
