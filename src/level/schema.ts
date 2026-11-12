/**
 * Level data format and validation. A level is one JSON file; `validateLevel`
 * turns unknown JSON into a typed LevelDef or a readable list of problems.
 */
import { TUNING } from '../config/tuning';

export type Vec3 = readonly [number, number, number];

export interface PaletteDef {
  sky: string;
  ground: string;
  fog: string;
  fogFar: number;
  /** Road surface colour (optional). */
  road?: string;
}

export interface PathDef {
  id: string;
  width: number;
  lanes: number;
  points: readonly Vec3[];
  /** Draw the road ribbon for this path (default true). Turn off when slabs form the road. */
  visible?: boolean;
}

export interface ConvoyDef {
  id: string;
  path: string;
  rows: number;
  lanesUsed: readonly number[];
  /** Path distance of the rear row's centre. */
  startAt: number;
  speed?: number;
  rowSpacing?: number;
  /** Per-truck cruise speed spread as a fraction (default from tuning). */
  speedVariance?: number;
  /** Steering wobble amplitude in radians. */
  wobble?: number;
  /** Drive against the path direction. */
  reverse?: boolean;
  /** Seconds before this convoy appears. */
  spawnDelay?: number;
  /**
   * Carried trucks: they glide along the path at its height, ignore gravity and
   * cannot be knocked off course. Used as moving stepping stones over gaps.
   */
  float?: boolean;
}

export interface SceneryDef {
  type: 'box';
  pos: Vec3;
  size: Vec3;
  /** Rotation in degrees around X, Y, Z (applied in that order). */
  rot?: Vec3;
  /** Lethal to the player. Trucks collide with scenery either way. */
  lethal: boolean;
  color?: string;
}

export interface BreakableWallDef {
  type: 'breakableWall';
  /** Centre of the wall's base. */
  pos: Vec3;
  width: number;
  height: number;
  /** Direction the wall faces, degrees around Y (0 = +Z). */
  yaw?: number;
}

export interface SpinnerDef {
  type: 'spinner';
  /** Pivot position; `pos[1]` is the height of the arm's centre. */
  pos: Vec3;
  /** Full length of the arm, tip to tip. */
  length: number;
  /** Degrees per second (negative = other way). */
  speed: number;
  /** Starting angle in degrees. */
  phase?: number;
}

export interface IceDef {
  type: 'ice';
  /** Centre of the patch on the road surface. */
  pos: Vec3;
  /** Width (x) and length (z) of the patch. */
  size: readonly [number, number];
  /** Degrees around Y. */
  yaw?: number;
}

export interface RotorDef {
  type: 'rotor';
  /** Hub position. The wheel stands across the road and turns like a windmill. */
  pos: Vec3;
  radius: number;
  spokes: number;
  /** Degrees per second. */
  speed: number;
  /** Starting angle in degrees. */
  phase?: number;
  /** Direction the wheel faces, degrees around Y (0 = +Z). */
  yaw?: number;
}

export interface BeamDef {
  type: 'beam';
  /** Centre of the beam. */
  pos: Vec3;
  length: number;
  /** A vertical beam is a standing column; otherwise it lies across the road. */
  vertical?: boolean;
  /** Degrees around Y (0 = lying along X, across a road that runs along Z). */
  yaw?: number;
  thickness?: number;
  /** Slides back and forth between `pos` and `to`, one full trip there and back per `period` seconds. */
  sweep?: { to: Vec3; period: number; phase?: number };
  /** Turns around its centre, degrees per second. */
  spin?: number;
  /** Switches on for `on` seconds, then off for `off` seconds, repeating. */
  blink?: { on: number; off: number; phase?: number };
}

export interface PendulumDef {
  type: 'pendulum';
  /** The point the weight hangs from. */
  pos: Vec3;
  /** Length of the cable. */
  length: number;
  /** How far it swings to each side, in degrees. */
  swing: number;
  /** Seconds for one full swing there and back. */
  period: number;
  phase?: number;
  /** Size of the weight (a cube). */
  size: number;
  /** Direction of the swing, degrees around Y (0 = across a road that runs along Z). */
  yaw?: number;
}

export interface PlateDef {
  type: 'plate';
  /** Centre of the plate on the road surface. */
  pos: Vec3;
  /** Width (x) and length (z). */
  size: readonly [number, number];
  /** Upward speed it gives a truck, m/s. */
  power: number;
  yaw?: number;
}

export interface BoulderDef {
  type: 'boulder';
  /** Path it rolls along, and where on it it starts. */
  path: string;
  startAt: number;
  speed: number;
  radius: number;
}

export type HazardDef =
  | BreakableWallDef
  | SpinnerDef
  | IceDef
  | RotorDef
  | BeamDef
  | PendulumDef
  | PlateDef
  | BoulderDef;
export const HAZARD_TYPES = [
  'breakableWall',
  'spinner',
  'ice',
  'rotor',
  'beam',
  'pendulum',
  'plate',
  'boulder',
] as const;

export interface GoalDef {
  /** Centre of the gate's base. */
  pos: Vec3;
  width: number;
  height: number;
  /** Direction the gate faces, degrees around Y (0 = +Z). Default: along the nearest path. */
  yaw?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  world: string;
  parTime: number;
  killY: number;
  /** 'flat' = endless lethal ground at y = 0 (default). 'none' = only scenery to drive on. */
  ground?: 'flat' | 'none';
  palette: PaletteDef;
  player: { convoy: string; row: number; lane: number };
  paths: readonly PathDef[];
  convoys: readonly ConvoyDef[];
  scenery: readonly SceneryDef[];
  hazards: readonly HazardDef[];
  goal: GoalDef;
}

export class LevelError extends Error {
  constructor(
    public readonly source: string,
    public readonly problems: string[],
  ) {
    super(`${source}: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`);
  }
}

type Obj = Record<string, unknown>;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Collects problems with a path like `convoys[1].speed` in front of each. */
class Checker {
  readonly problems: string[] = [];

  fail(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  obj(v: unknown, path: string): Obj | null {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Obj;
    this.fail(path, `expected an object, got ${describe(v)}`);
    return null;
  }

  arr(v: unknown, path: string): unknown[] {
    if (Array.isArray(v)) return v;
    this.fail(path, `expected a list, got ${describe(v)}`);
    return [];
  }

  str(o: Obj, key: string, path: string): string {
    const v = o[key];
    if (typeof v === 'string' && v.length > 0) return v;
    this.fail(`${path}.${key}`, `expected text, got ${describe(v)}`);
    return '';
  }

  num(
    o: Obj,
    key: string,
    path: string,
    opt: { min?: number; max?: number; int?: boolean; optional?: boolean } = {},
  ): number {
    const v = o[key];
    if (v === undefined && opt.optional) return NaN;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.fail(`${path}.${key}`, `expected a number, got ${describe(v)}`);
      return NaN;
    }
    if (opt.int && !Number.isInteger(v))
      this.fail(`${path}.${key}`, `must be a whole number, got ${v}`);
    if (opt.min !== undefined && v < opt.min)
      this.fail(`${path}.${key}`, `must be at least ${opt.min}, got ${v}`);
    if (opt.max !== undefined && v > opt.max)
      this.fail(`${path}.${key}`, `must be at most ${opt.max}, got ${v}`);
    return v;
  }

  bool(o: Obj, key: string, path: string, optional = false): void {
    const v = o[key];
    if (v === undefined && optional) return;
    if (typeof v !== 'boolean')
      this.fail(`${path}.${key}`, `expected true or false, got ${describe(v)}`);
  }

  vec3(o: Obj, key: string, path: string, optional = false): void {
    const v = o[key];
    if (v === undefined && optional) return;
    this.vec3Value(v, `${path}.${key}`);
  }

  vec3Value(v: unknown, path: string): void {
    if (
      !Array.isArray(v) ||
      v.length !== 3 ||
      v.some((n) => typeof n !== 'number' || !Number.isFinite(n))
    ) {
      this.fail(path, `expected [x, y, z] numbers, got ${describe(v)}`);
    }
  }

  color(o: Obj, key: string, path: string, optional = false): void {
    const v = o[key];
    if (v === undefined && optional) return;
    if (typeof v !== 'string' || !HEX.test(v)) {
      this.fail(`${path}.${key}`, `expected a colour like "#f6c98a", got ${describe(v)}`);
    }
  }

  unknownKeys(o: Obj, allowed: readonly string[], path: string): void {
    for (const k of Object.keys(o)) {
      if (!allowed.includes(k))
        this.fail(`${path}.${k}`, `unknown field (allowed: ${allowed.join(', ')})`);
    }
  }
}

function describe(v: unknown): string {
  if (v === undefined) return 'nothing (missing)';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `a list of ${v.length}`;
  if (typeof v === 'object') return 'an object';
  return JSON.stringify(v);
}

/** Check unknown JSON. Returns the typed level, or throws LevelError listing every problem. */
export function validateLevel(raw: unknown, source = 'level'): LevelDef {
  const c = new Checker();
  const o = c.obj(raw, 'level');
  if (!o) throw new LevelError(source, c.problems);

  c.unknownKeys(
    o,
    [
      'id',
      'name',
      'world',
      'parTime',
      'killY',
      'ground',
      'palette',
      'player',
      'paths',
      'convoys',
      'scenery',
      'hazards',
      'goal',
    ],
    'level',
  );
  c.str(o, 'id', 'level');
  c.str(o, 'name', 'level');
  c.str(o, 'world', 'level');
  c.num(o, 'parTime', 'level', { min: 1 });
  c.num(o, 'killY', 'level', { max: -0.5 });
  if (o.ground !== undefined && o.ground !== 'flat' && o.ground !== 'none') {
    c.fail('level.ground', `must be "flat" or "none", got ${describe(o.ground)}`);
  }

  const pal = c.obj(o.palette, 'palette');
  if (pal) {
    c.unknownKeys(pal, ['sky', 'ground', 'fog', 'fogFar', 'road'], 'palette');
    c.color(pal, 'sky', 'palette');
    c.color(pal, 'ground', 'palette');
    c.color(pal, 'fog', 'palette');
    c.color(pal, 'road', 'palette', true);
    c.num(pal, 'fogFar', 'palette', { min: 50 });
  }

  // Paths.
  const lanesByPath = new Map<string, number>();
  const paths = c.arr(o.paths, 'paths');
  if (Array.isArray(o.paths) && paths.length === 0) c.fail('paths', 'needs at least one path');
  paths.forEach((p, i) => {
    const at = `paths[${i}]`;
    const po = c.obj(p, at);
    if (!po) return;
    c.unknownKeys(po, ['id', 'width', 'lanes', 'points', 'visible'], at);
    const id = c.str(po, 'id', at);
    c.num(po, 'width', at, { min: 2 });
    const lanes = c.num(po, 'lanes', at, { min: 1, max: 7, int: true });
    c.bool(po, 'visible', at, true);
    const pts = c.arr(po.points, `${at}.points`);
    if (Array.isArray(po.points) && pts.length < 2)
      c.fail(`${at}.points`, 'needs at least 2 points');
    pts.forEach((pt, j) => c.vec3Value(pt, `${at}.points[${j}]`));
    if (id) {
      if (lanesByPath.has(id)) c.fail(`${at}.id`, `duplicate path id "${id}"`);
      lanesByPath.set(id, lanes);
    }
  });

  // Convoys.
  const convoyShape = new Map<string, { rows: number; lanes: number[] }>();
  let trucks = 0;
  const convoys = c.arr(o.convoys, 'convoys');
  if (Array.isArray(o.convoys) && convoys.length === 0)
    c.fail('convoys', 'needs at least one convoy');
  convoys.forEach((cv, i) => {
    const at = `convoys[${i}]`;
    const co = c.obj(cv, at);
    if (!co) return;
    c.unknownKeys(
      co,
      [
        'id',
        'path',
        'rows',
        'lanesUsed',
        'startAt',
        'speed',
        'rowSpacing',
        'speedVariance',
        'wobble',
        'reverse',
        'spawnDelay',
        'float',
      ],
      at,
    );
    const id = c.str(co, 'id', at);
    const path = c.str(co, 'path', at);
    const rows = c.num(co, 'rows', at, { min: 1, max: 40, int: true });
    c.num(co, 'startAt', at);
    c.num(co, 'speed', at, {
      min: TUNING.truck.cruiseSpeedMin,
      max: TUNING.truck.cruiseSpeedMax,
      optional: true,
    });
    c.num(co, 'rowSpacing', at, { min: TUNING.truck.length + 0.5, optional: true });
    c.num(co, 'speedVariance', at, { min: 0, max: 0.5, optional: true });
    c.num(co, 'wobble', at, { min: 0, max: 0.5, optional: true });
    c.num(co, 'spawnDelay', at, { min: 0, optional: true });
    c.bool(co, 'reverse', at, true);
    c.bool(co, 'float', at, true);
    const laneCount = lanesByPath.get(path);
    if (path && laneCount === undefined) {
      c.fail(
        `${at}.path`,
        `no path called "${path}" (paths: ${[...lanesByPath.keys()].join(', ') || 'none'})`,
      );
    }
    const lanes: number[] = [];
    const used = c.arr(co.lanesUsed, `${at}.lanesUsed`);
    if (Array.isArray(co.lanesUsed) && used.length === 0)
      c.fail(`${at}.lanesUsed`, 'needs at least one lane');
    used.forEach((l, j) => {
      if (typeof l !== 'number' || !Number.isInteger(l) || l < 0) {
        c.fail(`${at}.lanesUsed[${j}]`, `expected a lane number from 0, got ${describe(l)}`);
      } else if (laneCount !== undefined && l >= laneCount) {
        c.fail(
          `${at}.lanesUsed[${j}]`,
          `lane ${l} does not exist; path "${path}" has lanes 0-${laneCount - 1}`,
        );
      } else if (lanes.includes(l)) {
        c.fail(`${at}.lanesUsed[${j}]`, `lane ${l} is listed twice`);
      } else {
        lanes.push(l);
      }
    });
    if (id) {
      if (convoyShape.has(id)) c.fail(`${at}.id`, `duplicate convoy id "${id}"`);
      convoyShape.set(id, { rows: Number.isFinite(rows) ? rows : 0, lanes });
    }
    if (Number.isFinite(rows)) trucks += rows * lanes.length;
  });
  if (trucks > TUNING.truck.maxActive) {
    c.fail('convoys', `${trucks} trucks in total; the limit is ${TUNING.truck.maxActive}`);
  }

  // Player start.
  const pl = c.obj(o.player, 'player');
  if (pl) {
    c.unknownKeys(pl, ['convoy', 'row', 'lane'], 'player');
    const convoy = c.str(pl, 'convoy', 'player');
    const row = c.num(pl, 'row', 'player', { min: 0, int: true });
    const lane = c.num(pl, 'lane', 'player', { min: 0, int: true });
    const shape = convoyShape.get(convoy);
    if (convoy && !shape) {
      c.fail(
        'player.convoy',
        `no convoy called "${convoy}" (convoys: ${[...convoyShape.keys()].join(', ') || 'none'})`,
      );
    } else if (shape) {
      if (Number.isFinite(row) && row >= shape.rows) {
        c.fail(
          'player.row',
          `row ${row} does not exist; convoy "${convoy}" has rows 0-${shape.rows - 1}`,
        );
      }
      if (Number.isFinite(lane) && !shape.lanes.includes(lane)) {
        c.fail(
          'player.lane',
          `convoy "${convoy}" does not use lane ${lane} (it uses ${shape.lanes.join(', ')})`,
        );
      }
    }
  }

  // Scenery.
  c.arr(o.scenery, 'scenery').forEach((s, i) => {
    const at = `scenery[${i}]`;
    const so = c.obj(s, at);
    if (!so) return;
    if (so.type !== 'box') c.fail(`${at}.type`, `must be "box", got ${describe(so.type)}`);
    c.unknownKeys(so, ['type', 'pos', 'size', 'rot', 'lethal', 'color'], at);
    c.vec3(so, 'pos', at);
    c.vec3(so, 'size', at);
    if (Array.isArray(so.size) && so.size.some((n) => typeof n === 'number' && n <= 0)) {
      c.fail(`${at}.size`, 'every side must be larger than 0');
    }
    c.vec3(so, 'rot', at, true);
    c.bool(so, 'lethal', at);
    c.color(so, 'color', at, true);
  });

  // Hazards.
  c.arr(o.hazards, 'hazards').forEach((h, i) => {
    const at = `hazards[${i}]`;
    const ho = c.obj(h, at);
    if (!ho) return;
    if (ho.type === 'breakableWall') {
      c.unknownKeys(ho, ['type', 'pos', 'width', 'height', 'yaw'], at);
      c.vec3(ho, 'pos', at);
      c.num(ho, 'width', at, { min: 1.5, max: 40 });
      c.num(ho, 'height', at, { min: 1.25, max: 12 });
      c.num(ho, 'yaw', at, { optional: true });
    } else if (ho.type === 'spinner') {
      c.unknownKeys(ho, ['type', 'pos', 'length', 'speed', 'phase'], at);
      c.vec3(ho, 'pos', at);
      c.num(ho, 'length', at, { min: 2, max: 60 });
      c.num(ho, 'speed', at, { min: -360, max: 360 });
      c.num(ho, 'phase', at, { optional: true });
    } else if (ho.type === 'ice') {
      c.unknownKeys(ho, ['type', 'pos', 'size', 'yaw'], at);
      c.vec3(ho, 'pos', at);
      const size = ho.size;
      if (
        !Array.isArray(size) ||
        size.length !== 2 ||
        size.some((n) => typeof n !== 'number' || !(n > 0))
      ) {
        c.fail(`${at}.size`, `expected [width, length] larger than 0, got ${describe(size)}`);
      }
      c.num(ho, 'yaw', at, { optional: true });
    } else if (ho.type === 'beam') {
      c.unknownKeys(
        ho,
        ['type', 'pos', 'length', 'vertical', 'yaw', 'thickness', 'sweep', 'spin', 'blink'],
        at,
      );
      c.vec3(ho, 'pos', at);
      c.num(ho, 'length', at, { min: 0.5, max: 80 });
      c.bool(ho, 'vertical', at, true);
      c.num(ho, 'yaw', at, { optional: true });
      c.num(ho, 'thickness', at, { min: 0.1, max: 3, optional: true });
      c.num(ho, 'spin', at, { min: -360, max: 360, optional: true });
      if (ho.sweep !== undefined) {
        const sw = c.obj(ho.sweep, `${at}.sweep`);
        if (sw) {
          c.unknownKeys(sw, ['to', 'period', 'phase'], `${at}.sweep`);
          c.vec3(sw, 'to', `${at}.sweep`);
          c.num(sw, 'period', `${at}.sweep`, { min: 0.5 });
          c.num(sw, 'phase', `${at}.sweep`, { optional: true });
        }
      }
      if (ho.blink !== undefined) {
        const bl = c.obj(ho.blink, `${at}.blink`);
        if (bl) {
          c.unknownKeys(bl, ['on', 'off', 'phase'], `${at}.blink`);
          c.num(bl, 'on', `${at}.blink`, { min: 0.1 });
          c.num(bl, 'off', `${at}.blink`, { min: 0.1 });
          c.num(bl, 'phase', `${at}.blink`, { optional: true });
        }
      }
    } else if (ho.type === 'pendulum') {
      c.unknownKeys(ho, ['type', 'pos', 'length', 'swing', 'period', 'phase', 'size', 'yaw'], at);
      c.vec3(ho, 'pos', at);
      c.num(ho, 'length', at, { min: 1, max: 60 });
      c.num(ho, 'swing', at, { min: 1, max: 85 });
      c.num(ho, 'period', at, { min: 0.5 });
      c.num(ho, 'phase', at, { optional: true });
      c.num(ho, 'size', at, { min: 0.5, max: 10 });
      c.num(ho, 'yaw', at, { optional: true });
    } else if (ho.type === 'plate') {
      c.unknownKeys(ho, ['type', 'pos', 'size', 'power', 'yaw'], at);
      c.vec3(ho, 'pos', at);
      const size = ho.size;
      if (
        !Array.isArray(size) ||
        size.length !== 2 ||
        size.some((n) => typeof n !== 'number' || !(n > 0))
      ) {
        c.fail(`${at}.size`, `expected [width, length] larger than 0, got ${describe(size)}`);
      }
      c.num(ho, 'power', at, { min: 1, max: 25 });
      c.num(ho, 'yaw', at, { optional: true });
    } else if (ho.type === 'boulder') {
      c.unknownKeys(ho, ['type', 'path', 'startAt', 'speed', 'radius'], at);
      const path = c.str(ho, 'path', at);
      if (path && !lanesByPath.has(path)) {
        c.fail(`${at}.path`, `no path called "${path}" (paths: ${[...lanesByPath.keys()].join(', ') || 'none'})`);
      }
      c.num(ho, 'startAt', at);
      c.num(ho, 'speed', at, { min: 1, max: 60 });
      c.num(ho, 'radius', at, { min: 1, max: 20 });
    } else if (ho.type === 'rotor') {
      c.unknownKeys(ho, ['type', 'pos', 'radius', 'spokes', 'speed', 'phase', 'yaw'], at);
      c.vec3(ho, 'pos', at);
      c.num(ho, 'radius', at, { min: 2, max: 30 });
      c.num(ho, 'spokes', at, { min: 1, max: 8, int: true });
      c.num(ho, 'speed', at, { min: -360, max: 360 });
      c.num(ho, 'phase', at, { optional: true });
      c.num(ho, 'yaw', at, { optional: true });
    } else {
      c.fail(
        `${at}.type`,
        `unknown hazard ${describe(ho.type)} (known: ${HAZARD_TYPES.join(', ')})`,
      );
    }
  });

  // Goal.
  const g = c.obj(o.goal, 'goal');
  if (g) {
    c.unknownKeys(g, ['pos', 'width', 'height', 'yaw'], 'goal');
    c.vec3(g, 'pos', 'goal');
    c.num(g, 'width', 'goal', { min: 2 });
    c.num(g, 'height', 'goal', { min: 2 });
    c.num(g, 'yaw', 'goal', { optional: true });
  }

  if (c.problems.length > 0) throw new LevelError(source, c.problems);
  return raw as LevelDef;
}
