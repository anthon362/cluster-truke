/**
 * Release checks over the whole campaign: the numbers the design document
 * sets for every level, how fast a level can be finished without abilities,
 * and how much time the simulation takes on the largest level.
 */
import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { Sim } from '../src/core/sim';
import { LEVELS, findLevel } from '../src/level/levels';
import { campaignLevels } from '../src/level/progress';
import { initPhysics } from '../src/physics/world';
import { NO_INPUT } from '../src/player/movement';
import { dodgeBeams, either, holdLine, hopBars, hopBeams, play, runCareful } from './levelBots';

const campaign = campaignLevels(LEVELS);
const FINALE = '9-6';

beforeAll(async () => {
  await initPhysics();
});

describe('campaign shape', () => {
  it('is nine worlds of six levels', () => {
    expect(campaign.length).toBe(54);
    const worlds = [...new Set(campaign.map((l) => l.world))];
    expect(worlds.length).toBe(9);
    for (const w of worlds) expect(campaign.filter((l) => l.world === w).length, w).toBe(6);
  });

  it('every par time is inside the range the design asks for (15 to 25 s, finale up to 90 s)', () => {
    for (const l of campaign) {
      if (l.id === FINALE) expect(l.parTime, l.id).toBeLessThanOrEqual(90);
      else {
        expect(l.parTime, l.id).toBeGreaterThanOrEqual(15);
        expect(l.parTime, l.id).toBeLessThanOrEqual(25);
      }
    }
  });

  it('every level has a name of its own', () => {
    expect(new Set(campaign.map((l) => l.name)).size).toBe(campaign.length);
  });
});

describe('par times can be beaten without abilities', () => {
  /**
   * One all-round scripted player: it moves up the convoy, jumps what can be
   * jumped, changes lane for what cannot, and steers back in the wind. It
   * does not know how to change convoys, so levels that need that (and a few
   * its lane changes are too crude for) are listed as not checked here; they
   * are finished by their own demonstrations in the other test files.
   */
  const allRound = holdLine(either(dodgeBeams, hopBeams, hopBars, runCareful));
  const NOT_CHECKED = new Set([
    '1-2',
    '1-3',
    '1-4',
    '1-5',
    '2-3',
    '2-4',
    '2-6',
    '3-6',
    '4-4',
    '4-6',
    '5-5',
    '7-2',
    '7-4',
    '8-2',
    '8-4',
    '8-6',
  ]);
  const lines: string[] = [];

  for (const l of campaign) {
    if (NOT_CHECKED.has(l.id)) {
      lines.push(`${l.id} ${l.name}: par ${l.parTime}s, not checked by the all-round player`);
      continue;
    }
    it(`${l.id} under par`, () => {
      const wins = [1, 2].map((seed) => play(l, allRound, seed)).filter((r) => r.won);
      const best = wins.length ? Math.min(...wins.map((r) => r.time)) : NaN;
      lines.push(`${l.id} ${l.name}: par ${l.parTime}s, fastest ${best.toFixed(1)}s`);
      expect(wins.length, l.id).toBeGreaterThanOrEqual(1);
      expect(best, l.id).toBeLessThan(l.parTime);
    }, 120000);
  }

  it('writes the report (campaign-report.txt)', () => {
    lines.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    writeFileSync('campaign-report.txt', lines.join('\n') + '\n');
    expect(lines.length).toBe(campaign.length);
    expect(campaign.length - NOT_CHECKED.size).toBe(38);
  });
});

describe('the largest level', () => {
  it('simulates well inside one frame, and restarts well inside 0.3 s', () => {
    const level = findLevel(FINALE)!;
    const sim = new Sim({ seed: 1, level, god: true });
    expect(sim.trucks.length).toBe(72);
    // Warm up, then time ten seconds of play.
    for (let i = 0; i < 120; i++) sim.step(NO_INPUT);
    const steps = 600;
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) sim.step(NO_INPUT);
    const perStep = (performance.now() - t0) / steps;
    const frame = TUNING.loop.fixedStep * 1000;
    // A third of a 60 Hz frame leaves the rest for drawing. Generous, so a slow test machine passes.
    expect(perStep).toBeLessThan(frame / 3);

    const r0 = performance.now();
    sim.reset();
    const restart = performance.now() - r0;
    expect(restart).toBeLessThan(300);
    writeFileSync(
      'performance-report.txt',
      `finale (72 trucks): ${perStep.toFixed(2)} ms per simulation step of ${frame.toFixed(1)} ms, restart ${restart.toFixed(1)} ms\n`,
    );
  });
});
