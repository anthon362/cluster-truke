import { beforeAll, describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import {
  CUSTOM_ID,
  OPTIONAL,
  TEMPLATES,
  add,
  addPoint,
  check,
  describe as label,
  draftFrom,
  footprint,
  hit,
  move,
  newDraft,
  optionalKey,
  parse,
  pick,
  placed,
  remove,
  roadLines,
  serialize,
  truckStarts,
} from '../src/editor/model';
import { LEVELS, findLevel } from '../src/level/levels';
import { HAZARD_TYPES } from '../src/level/schema';
import { initPhysics } from '../src/physics/world';
import { ride, play } from './levelBots';

beforeAll(async () => {
  await initPhysics();
});

describe('editor model', () => {
  it('starts from a level that is valid and can be finished by riding', () => {
    const { level, problems } = check(newDraft());
    expect(problems).toEqual([]);
    expect(level!.id).toBe(CUSTOM_ID);
    expect(play(level!, ride, 1).won).toBe(true);
  });

  it('offers every hazard type, and each one is valid as added', () => {
    const types = new Set<string>();
    for (const name of Object.keys(TEMPLATES)) {
      const d = newDraft();
      const ref = add(d, name, 200)!;
      expect(ref, name).toBeDefined();
      expect(check(d).problems, name).toEqual([]);
      if (ref.list === 'hazards') types.add(String(d.hazards[0].type));
    }
    expect([...types].sort()).toEqual([...HAZARD_TYPES].sort());
  });

  it('every optional setting it offers is accepted by the game', () => {
    for (const name of Object.keys(TEMPLATES)) {
      const d = newDraft();
      const ref = add(d, name, 200)!;
      const item = ref.list === 'hazards' ? d.hazards[0] : d.scenery[0];
      for (const [key, value] of Object.entries(OPTIONAL[optionalKey(d, ref)] ?? {})) {
        const copy = JSON.parse(JSON.stringify(d));
        const target = ref.list === 'hazards' ? copy.hazards[0] : copy.scenery[0];
        target[key] = JSON.parse(JSON.stringify(value));
        expect(check(copy).problems, `${String(item.type)}.${key}`).toEqual([]);
      }
    }
    for (const [list, pickItem] of [
      ['goal', (d: ReturnType<typeof newDraft>) => d.goal],
      ['convoys', (d: ReturnType<typeof newDraft>) => d.convoys[0]],
      ['paths', (d: ReturnType<typeof newDraft>) => d.paths[0]],
    ] as const) {
      for (const [key, value] of Object.entries(OPTIONAL[list])) {
        const d = newDraft();
        // A convoy that drives the other way has to start at the far end.
        if (key === 'reverse') d.convoys[0].startAt = 500;
        pickItem(d)[key] = JSON.parse(JSON.stringify(value));
        expect(check(d).problems, `${list}.${key}`).toEqual([]);
      }
    }
  });

  it('reports what is wrong in words, and does not hand out a broken level', () => {
    const d = newDraft();
    d.hazards.push({ type: 'plate', pos: [0, 0, 200], size: [14, 4] });
    const { level, problems } = check(d);
    expect(level).toBeUndefined();
    expect(problems.join('\n')).toMatch(/power/);
  });

  it('finds what is under the pointer, small things before large ones', () => {
    const d = newDraft();
    add(d, 'Wind', 200);
    add(d, 'Blast plate', 200);
    expect(pick(d, 0, 200)).toEqual({ list: 'hazards', index: 1 });
    expect(pick(d, 20, 200)).toEqual({ list: 'hazards', index: 0 });
    expect(pick(d, 0, 443)).toEqual({ list: 'goal' });
    expect(pick(d, 0, -40)).toEqual({ list: 'point', path: 0, index: 0 });
    expect(pick(d, 50, 600)).toBeUndefined();
  });

  it('knows the outline of turned things', () => {
    const d = newDraft();
    d.scenery.push({
      type: 'box',
      pos: [0, 1, 100],
      size: [20, 2, 2],
      rot: [0, 90, 0],
      lethal: true,
    });
    const f = footprint(d, { list: 'scenery', index: 0 })!;
    // Turned a quarter: long along the road now, not across it.
    expect(hit(f, 0, 108)).toBe(true);
    expect(hit(f, 8, 100)).toBe(false);
  });

  it('moves things, and slides a boulder along its road', () => {
    const d = newDraft();
    const box = add(d, 'Box', 100)!;
    move(d, box, -4, 12);
    expect(d.scenery[0].pos).toEqual([6, 2, 112]);
    const boulder = add(d, 'Boulder', 0)!;
    move(d, boulder, 3, 25);
    expect(d.hazards[0].startAt).toBe(15);
    move(d, { list: 'goal' }, 0, 50);
    expect(d.goal.pos).toEqual([0, 0, 493]);
    move(d, { list: 'point', path: 0, index: 1 }, 30, 0);
    expect((d.paths[0].points as number[][])[1]).toEqual([30, 0, 640]);
    expect(check(d).problems).toEqual([]);
  });

  it('removes things but keeps what a level cannot do without', () => {
    const d = newDraft();
    const ref = add(d, 'Ice', 100)!;
    expect(remove(d, ref)).toBe(true);
    expect(d.hazards).toEqual([]);
    expect(remove(d, { list: 'goal' })).toBe(false);
    expect(remove(d, { list: 'paths', index: 0 })).toBe(false);
    expect(remove(d, { list: 'convoys', index: 0 })).toBe(false);
    expect(remove(d, { list: 'point', path: 0, index: 0 })).toBe(false);
    const extra = addPoint(d, 0)!;
    expect((d.paths[0].points as number[][])[2]).toEqual([0, 0, 760]);
    expect(remove(d, extra)).toBe(true);
    expect((d.paths[0].points as number[][]).length).toBe(2);
  });

  it('lays out the roads and the trucks for drawing', () => {
    const d = newDraft();
    const roads = roadLines(d);
    expect(roads.length).toBe(1);
    expect(roads[0].points[0]).toEqual([0, -40]);
    const trucks = truckStarts(d);
    expect(trucks.length).toBe(36);
    // Rear row, three lanes, 50 m along a road that starts at z = -40.
    expect(trucks.slice(0, 3).map((t) => [Math.round(t[0] * 10) / 10, Math.round(t[1])])).toEqual([
      [-3.4, 10],
      [0, 10],
      [3.4, 10],
    ]);
    expect(placed(d).length).toBe(3);
    expect(label(d, { list: 'goal' })).toBe('Goal');
    expect(label(d, { list: 'convoys', index: 0 })).toBe('Convoy "main"');
  });

  it('exports a file the game loads, and imports it back unchanged', () => {
    const d = newDraft();
    add(d, 'Pendulum', 220);
    add(d, 'Blast plate', 300);
    const text = serialize(d);
    const back = parse(text);
    expect(back.problems).toEqual([]);
    expect(back.draft).toEqual(d);
    expect(serialize(back.draft!)).toBe(text);
  });

  it('refuses a file that is not a level, with the reason', () => {
    expect(parse('not json').problems[0]).toMatch(/not a JSON file/);
    const broken = parse('{"id":"x"}');
    expect(broken.draft).toBeUndefined();
    expect(broken.problems.length).toBeGreaterThan(0);
  });

  it('opens every level of the game as a starting point', () => {
    for (const level of LEVELS) {
      const d = draftFrom(level);
      expect(d.id).toBe(CUSTOM_ID);
      expect(check(d).problems, level.id).toEqual([]);
      // Nothing with a place is left without an outline.
      for (const [i, h] of d.hazards.entries()) {
        if (h.type === 'strike' || h.type === 'melt') continue;
        expect(
          footprint(d, { list: 'hazards', index: i }),
          `${level.id} ${String(h.type)}`,
        ).toBeDefined();
      }
    }
    // The original is untouched.
    expect(findLevel('1-1')!.id).toBe('1-1');
  });

  it('a level built in the editor plays', () => {
    const d = newDraft();
    add(d, 'Blast plate', 200);
    add(d, 'Boost belt', 300);
    const { level } = check(d);
    const sim = new Sim({ seed: 1, level: level! });
    expect(sim.hazards.length).toBe(2);
    expect(play(level!, ride, 1).won).toBe(true);
  });
});
