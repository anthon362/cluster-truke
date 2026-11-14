/**
 * The level editor's data model: plain functions on a level's JSON, with no
 * drawing and no DOM, so they can be tested. The editor edits exactly the
 * format the game loads (src/level/schema.ts); nothing is converted.
 */
import { type LevelDef, LevelError, validateLevel } from '../level/schema';
import { Path } from '../trucks/path';
import { Vector3 } from 'three';

export type Item = Record<string, unknown>;

/** A level being edited: the same shape as a level file, but changeable and not yet checked. */
export interface Draft {
  id: string;
  name: string;
  world: string;
  parTime: number;
  killY: number;
  ground?: string;
  palette: Item;
  player: Item;
  paths: Item[];
  convoys: Item[];
  scenery: Item[];
  hazards: Item[];
  goal: Item;
}

/** What is selected: an entry of one of the lists, the goal, or one point of a road. */
export type Ref =
  | { list: 'scenery' | 'hazards' | 'convoys' | 'paths'; index: number }
  | { list: 'goal' }
  | { list: 'point'; path: number; index: number };

/** Every custom level has this id, so it never collides with a campaign level. */
export const CUSTOM_ID = 'custom';
export const isCustom = (id: string): boolean => id === CUSTOM_ID;

/** Worlds a custom level can borrow its music from. */
export const WORLDS = [
  'dockyard',
  'overpass',
  'whiteout',
  'nightfreight',
  'quarry',
  'stormfront',
  'foundry',
  'skyline',
  'summit',
] as const;

/** A short straight road with one convoy: a level that already works. */
export function newDraft(): Draft {
  return {
    id: CUSTOM_ID,
    name: 'My level',
    world: 'dockyard',
    parTime: 16,
    killY: -5,
    palette: { sky: '#9fd3e6', ground: '#d9b382', fog: '#cfe6ea', fogFar: 420 },
    player: { convoy: 'main', row: 1, lane: 1 },
    paths: [
      {
        id: 'road',
        width: 14,
        lanes: 3,
        points: [
          [0, 0, -40],
          [0, 0, 640],
        ],
      },
    ],
    convoys: [{ id: 'main', path: 'road', rows: 12, lanesUsed: [0, 1, 2], startAt: 50 }],
    scenery: [],
    hazards: [],
    goal: { pos: [0, 0, 443], width: 16, height: 12 },
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Start a draft from an existing level (a campaign level, or an imported file). */
export function draftFrom(level: LevelDef): Draft {
  const d = clone(level) as unknown as Draft;
  d.id = CUSTOM_ID;
  return d;
}

/** Things that can be added, by the name shown on the button. `z` is where the view is looking. */
export const TEMPLATES: Record<
  string,
  (z: number, d: Draft) => { list: 'scenery' | 'hazards'; item: Item }
> = {
  Box: (z) => ({
    list: 'scenery',
    item: { type: 'box', pos: [10, 2, z], size: [4, 4, 4], lethal: true, color: '#8d9299' },
  }),
  'Breakable wall': (z) => ({
    list: 'hazards',
    item: { type: 'breakableWall', pos: [0, 0, z], width: 14, height: 5 },
  }),
  Spinner: (z) => ({
    list: 'hazards',
    item: { type: 'spinner', pos: [0, 4.6, z], length: 12, speed: 60 },
  }),
  Ice: (z) => ({ list: 'hazards', item: { type: 'ice', pos: [0, 0, z], size: [16, 60] } }),
  Rotor: (z) => ({
    list: 'hazards',
    item: { type: 'rotor', pos: [0, 10.2, z], radius: 6, spokes: 3, speed: 24 },
  }),
  Beam: (z) => ({ list: 'hazards', item: { type: 'beam', pos: [0, 4.3, z], length: 16 } }),
  Pendulum: (z) => ({
    list: 'hazards',
    item: { type: 'pendulum', pos: [0, 18, z], length: 12.5, swing: 28, period: 5, size: 2.4 },
  }),
  'Blast plate': (z) => ({
    list: 'hazards',
    item: { type: 'plate', pos: [0, 0, z], size: [14, 4], power: 10 },
  }),
  Wind: (z) => ({
    list: 'hazards',
    item: { type: 'wind', pos: [0, 0, z], size: [60, 150], force: 6 },
  }),
  'Boost belt': (z) => ({
    list: 'hazards',
    item: { type: 'belt', pos: [0, 0, z], size: [12, 14], factor: 1.35, seconds: 3 },
  }),
  Press: (z) => ({
    list: 'hazards',
    item: { type: 'press', pos: [0, 0, z], size: [3, 8], period: 6, down: 1 },
  }),
  Lightning: () => ({ list: 'hazards', item: { type: 'strike', period: 5, warning: 2.2 } }),
  Melt: () => ({ list: 'hazards', item: { type: 'melt', rise: 0.07 } }),
  Boulder: (_z, d) => ({
    list: 'hazards',
    item: { type: 'boulder', path: firstPathId(d), startAt: -10, speed: 22, radius: 4.5 },
  }),
  Avalanche: (_z, d) => ({
    list: 'hazards',
    item: { type: 'slide', path: firstPathId(d), startAt: -20, speed: 21, width: 44 },
  }),
};

const firstPathId = (d: Draft): string => String(d.paths[0]?.id ?? 'road');

/**
 * Settings an item can have but does not need, with a starting value. The
 * editor offers these as "+ name" buttons. Keyed by `type`, or by list name
 * for things without one.
 */
export const OPTIONAL: Record<string, Record<string, unknown>> = {
  box: { rot: [0, 0, 0], color: '#8d9299' },
  breakableWall: { yaw: 0 },
  spinner: { phase: 0 },
  ice: { yaw: 0 },
  rotor: { phase: 0, yaw: 0 },
  beam: {
    vertical: true,
    yaw: 0,
    thickness: 0.35,
    spin: 40,
    sweep: { to: [6, 4.3, 0], period: 4 },
    blink: { on: 1.5, off: 1.5 },
  },
  pendulum: { phase: 0, yaw: 0 },
  plate: { yaw: 0 },
  wind: { gust: { on: 2, off: 2 } },
  press: { phase: 0 },
  strike: { phase: 0, radius: 1.5, between: [0, 400] },
  melt: { delay: 0 },
  slide: { stages: [[200, 23]] },
  goal: { yaw: 0, speed: 8, travel: 300 },
  level: { ground: 'none' },
  palette: { road: '#5b6070' },
  convoys: {
    speed: 18,
    wobble: 0.06,
    speedVariance: 0.05,
    spawnDelay: 0,
    float: true,
    reverse: true,
  },
  paths: { visible: false },
};

/** Which OPTIONAL entry applies to the thing a reference points at. */
export function optionalKey(d: Draft, ref: Ref): string {
  if (ref.list === 'scenery' || ref.list === 'hazards') return String(d[ref.list][ref.index]?.type);
  return ref.list;
}

/** The JSON object a reference points at (a road point has none of its own). */
export function itemAt(d: Draft, ref: Ref): Item | undefined {
  if (ref.list === 'goal') return d.goal;
  if (ref.list === 'point') return undefined;
  return d[ref.list][ref.index];
}

const vec = (o: Item, key: string): number[] | undefined => {
  const v = o[key];
  return Array.isArray(v) && v.every((n) => typeof n === 'number') ? (v as number[]) : undefined;
};
const num = (o: Item, key: string, fallback = 0): number =>
  typeof o[key] === 'number' ? (o[key] as number) : fallback;

/** How an item looks from above: a rectangle (or a circle) on the map. */
export interface Footprint {
  x: number;
  z: number;
  /** Size across (X) and along (Z) before turning. */
  w: number;
  l: number;
  /** Degrees around Y. */
  yaw: number;
  round?: boolean;
}

const DEG = Math.PI / 180;
const p3 = new Vector3();

function pathFor(d: Draft, id: unknown): Path | undefined {
  const def = d.paths.find((p) => p.id === id);
  const points = def && Array.isArray(def.points) ? (def.points as number[][]) : undefined;
  if (!def || !points || points.length < 2) return undefined;
  try {
    return new Path(
      String(def.id),
      points as unknown as [number, number, number][],
      num(def, 'width', 14),
      num(def, 'lanes', 3),
    );
  } catch {
    return undefined;
  }
}

/** Where on the map an item is, or undefined for things with no place (lightning, melt, convoys, roads). */
export function footprint(d: Draft, ref: Ref): Footprint | undefined {
  if (ref.list === 'point') {
    const pts = d.paths[ref.path]?.points as number[][] | undefined;
    const p = pts?.[ref.index];
    return p ? { x: p[0], z: p[2], w: 3, l: 3, yaw: 0, round: true } : undefined;
  }
  const o = itemAt(d, ref);
  if (!o || ref.list === 'convoys' || ref.list === 'paths') return undefined;
  const pos = vec(o, 'pos');
  const yaw = num(o, 'yaw');
  if (ref.list === 'goal') {
    return pos ? { x: pos[0], z: pos[2], w: num(o, 'width', 16), l: 1.2, yaw } : undefined;
  }
  const size = vec(o, 'size');
  switch (o.type) {
    case 'box': {
      const rot = vec(o, 'rot');
      return pos && size
        ? { x: pos[0], z: pos[2], w: size[0], l: size[2], yaw: rot ? rot[1] : 0 }
        : undefined;
    }
    case 'breakableWall':
      return pos ? { x: pos[0], z: pos[2], w: num(o, 'width', 10), l: 1.2, yaw } : undefined;
    case 'spinner': {
      const r = num(o, 'length', 10);
      return pos ? { x: pos[0], z: pos[2], w: r, l: r, yaw: 0, round: true } : undefined;
    }
    case 'ice':
    case 'plate':
    case 'wind':
    case 'belt':
    case 'press':
      return pos && size ? { x: pos[0], z: pos[2], w: size[0], l: size[1], yaw } : undefined;
    case 'rotor':
      return pos ? { x: pos[0], z: pos[2], w: num(o, 'radius', 6) * 2, l: 1.4, yaw } : undefined;
    case 'beam':
      return pos
        ? o.vertical
          ? { x: pos[0], z: pos[2], w: 1.2, l: 1.2, yaw: 0, round: true }
          : { x: pos[0], z: pos[2], w: num(o, 'length', 10), l: 0.8, yaw }
        : undefined;
    case 'pendulum': {
      const reach = num(o, 'length', 10) * Math.sin(num(o, 'swing', 20) * DEG);
      return pos
        ? { x: pos[0], z: pos[2], w: reach * 2 + num(o, 'size', 2), l: num(o, 'size', 2), yaw }
        : undefined;
    }
    case 'boulder':
    case 'slide': {
      const path = pathFor(d, o.path);
      if (!path) return undefined;
      path.pointAt(num(o, 'startAt'), 0, p3);
      const w = o.type === 'boulder' ? num(o, 'radius', 4) * 2 : num(o, 'width', 40);
      return {
        x: p3.x,
        z: p3.z,
        w,
        l: o.type === 'boulder' ? w : 6,
        yaw: 0,
        round: o.type === 'boulder',
      };
    }
    default:
      return undefined;
  }
}

/** Is the map position (x, z) inside the footprint? */
export function hit(f: Footprint, x: number, z: number, margin = 0): boolean {
  const dx = x - f.x;
  const dz = z - f.z;
  if (f.round) return Math.hypot(dx, dz) <= Math.max(f.w, f.l) / 2 + margin;
  const a = f.yaw * DEG;
  // Into the rectangle's own axes (turning by +yaw around Y takes local X to cos, -sin).
  const lx = dx * Math.cos(a) - dz * Math.sin(a);
  const lz = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(lx) <= f.w / 2 + margin && Math.abs(lz) <= f.l / 2 + margin;
}

/** Everything that has a place on the map, smallest first, so small things can be picked on top of large ones. */
export function placed(d: Draft): { ref: Ref; f: Footprint }[] {
  const refs: Ref[] = [{ list: 'goal' }];
  d.scenery.forEach((_, index) => refs.push({ list: 'scenery', index }));
  d.hazards.forEach((_, index) => refs.push({ list: 'hazards', index }));
  d.paths.forEach((p, path) => {
    const pts = Array.isArray(p.points) ? p.points : [];
    pts.forEach((_, index) => refs.push({ list: 'point', path, index }));
  });
  const out: { ref: Ref; f: Footprint }[] = [];
  for (const ref of refs) {
    const f = footprint(d, ref);
    if (f) out.push({ ref, f });
  }
  return out.sort((a, b) => a.f.w * a.f.l - b.f.w * b.f.l);
}

/** The thing under the map position (x, z), if any. */
export function pick(d: Draft, x: number, z: number, margin = 0.5): Ref | undefined {
  // Road points first: they are handles and must stay grabbable under anything.
  const all = placed(d);
  const point = all.find((e) => e.ref.list === 'point' && hit(e.f, x, z, margin));
  return (point ?? all.find((e) => hit(e.f, x, z, margin)))?.ref;
}

/** Move the thing by (dx, dz) on the map. Things on a road (boulder, avalanche) slide along it. */
export function move(d: Draft, ref: Ref, dx: number, dz: number): void {
  if (ref.list === 'point') {
    const p = (d.paths[ref.path]?.points as number[][] | undefined)?.[ref.index];
    if (p) {
      p[0] += dx;
      p[2] += dz;
    }
    return;
  }
  const o = itemAt(d, ref);
  if (!o) return;
  const pos = vec(o, 'pos');
  if (pos) {
    pos[0] += dx;
    pos[2] += dz;
  } else if (typeof o.startAt === 'number' && ref.list === 'hazards') {
    o.startAt = o.startAt + dz;
  }
}

/** Remove the thing. Returns false when it cannot go (the goal, the last road, a road's last two points). */
export function remove(d: Draft, ref: Ref): boolean {
  if (ref.list === 'goal') return false;
  if (ref.list === 'point') {
    const pts = d.paths[ref.path]?.points as number[][] | undefined;
    if (!pts || pts.length <= 2) return false;
    pts.splice(ref.index, 1);
    return true;
  }
  if ((ref.list === 'paths' || ref.list === 'convoys') && d[ref.list].length <= 1) return false;
  d[ref.list].splice(ref.index, 1);
  return true;
}

/** Add a thing from TEMPLATES at map position z. Returns a reference to it. */
export function add(d: Draft, name: string, z: number): Ref | undefined {
  const make = TEMPLATES[name];
  if (!make) return undefined;
  const { list, item } = make(Math.round(z), d);
  d[list].push(item);
  return { list, index: d[list].length - 1 };
}

/** Extend a road by one more point, continuing the way its last stretch goes. */
export function addPoint(d: Draft, path: number, step = 120): Ref | undefined {
  const pts = d.paths[path]?.points as number[][] | undefined;
  if (!pts || pts.length < 2) return undefined;
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  pts.push([
    Math.round(b[0] + ((b[0] - a[0]) / len) * step),
    b[1],
    Math.round(b[2] + ((b[2] - a[2]) / len) * step),
  ]);
  return { list: 'point', path, index: pts.length - 1 };
}

const freeId = (list: Item[], base: string): string => {
  for (let n = 2; ; n++) {
    const id = `${base}${n}`;
    if (!list.some((o) => o.id === id)) return id;
  }
};

/** Add a second road beside the first one: a copy of it moved 14 m to the side. */
export function addRoad(d: Draft): Ref {
  const first = d.paths[0];
  const points = (first.points as number[][]).map((p) => [p[0] + 14, p[1], p[2]]);
  d.paths.push({ id: freeId(d.paths, 'road'), width: 8, lanes: 2, points });
  return { list: 'paths', index: d.paths.length - 1 };
}

/** Add a convoy on the given road (by default the last one added). */
export function addConvoy(d: Draft, path = d.paths.length - 1): Ref {
  const road = d.paths[path];
  const lanes = Array.from({ length: num(road, 'lanes', 1) }, (_, i) => i);
  d.convoys.push({
    id: freeId(d.convoys, 'convoy'),
    path: road.id,
    rows: 8,
    lanesUsed: lanes,
    startAt: 50,
  });
  return { list: 'convoys', index: d.convoys.length - 1 };
}

/** Where the player starts, for drawing: [x, z], or undefined if their convoy or truck does not exist. */
export function playerStart(d: Draft): [number, number] | undefined {
  const c = d.convoys.find((o) => o.id === d.player.convoy);
  const path = c && pathFor(d, c.path);
  if (!c || !path) return undefined;
  const s =
    num(c, 'startAt') + num(d.player, 'row') * num(c, 'rowSpacing', 13) * (c.reverse ? -1 : 1);
  path.pointAt(s, path.laneOffset(num(d.player, 'lane')), p3);
  return [p3.x, p3.z];
}

/** Where each truck of each convoy starts, for drawing: [x, z, yaw in degrees]. */
export function truckStarts(d: Draft): [number, number, number][] {
  const out: [number, number, number][] = [];
  const t = new Vector3();
  for (const c of d.convoys) {
    const path = pathFor(d, c.path);
    const lanes = vec(c, 'lanesUsed');
    if (!path || !lanes) continue;
    const dir = c.reverse ? -1 : 1;
    const spacing = num(c, 'rowSpacing', 13);
    for (let row = 0; row < Math.min(60, num(c, 'rows')); row++) {
      for (const lane of lanes) {
        const s = num(c, 'startAt') + row * spacing * dir;
        path.pointAt(s, path.laneOffset(lane), p3);
        path.tangentAt(s, t);
        out.push([p3.x, p3.z, Math.atan2(t.x, t.z) / DEG]);
      }
    }
  }
  return out;
}

/** Sampled centre lines of the roads, for drawing: per road its width and [x, z] points. */
export function roadLines(d: Draft): { width: number; points: [number, number][] }[] {
  const out: { width: number; points: [number, number][] }[] = [];
  for (const def of d.paths) {
    const path = pathFor(d, def.id);
    if (!path) continue;
    const step = Math.max(1, Math.floor(path.samples.length / 200));
    const points: [number, number][] = [];
    for (let i = 0; i < path.samples.length; i += step) {
      points.push([path.samples[i].x, path.samples[i].z]);
    }
    const last = path.samples[path.samples.length - 1];
    points.push([last.x, last.z]);
    out.push({ width: num(def, 'width', 14), points });
  }
  return out;
}

/** Check a draft the way the game does. Returns the playable level, or what is wrong with it. */
export function check(d: Draft): { level?: LevelDef; problems: string[] } {
  try {
    return { level: validateLevel(clone(d), 'editor'), problems: [] };
  } catch (err) {
    return { problems: err instanceof LevelError ? err.problems : [String(err)] };
  }
}

/** The level as the text of a level file. */
export function serialize(d: Draft): string {
  return JSON.stringify(d, null, 2) + '\n';
}

/** Read a level file's text. A file that is not a valid level is refused, with the reasons. */
export function parse(text: string): { draft?: Draft; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { problems: [`not a JSON file: ${err instanceof Error ? err.message : String(err)}`] };
  }
  try {
    return { draft: draftFrom(validateLevel(raw, 'import')), problems: [] };
  } catch (err) {
    return { problems: err instanceof LevelError ? err.problems : [String(err)] };
  }
}

/** A short name for the list: what it is and, where it helps, where. */
export function describe(d: Draft, ref: Ref): string {
  if (ref.list === 'goal') return 'Goal';
  if (ref.list === 'point') return `Road point ${ref.index + 1}`;
  const o = itemAt(d, ref);
  if (!o) return '?';
  if (ref.list === 'convoys') return `Convoy "${String(o.id)}"`;
  if (ref.list === 'paths') return `Road "${String(o.id)}"`;
  const f = footprint(d, ref);
  return `${String(o.type)}${f ? ` @ ${Math.round(f.z)}` : ''}`;
}
