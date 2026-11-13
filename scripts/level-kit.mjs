// Shared helpers for the level authoring scripts. Level JSON files are the
// source of truth for the game; these only save typing by placing things along
// a path ("40 m further on, in the right-hand lane") instead of by raw coordinates.
import { mkdirSync, writeFileSync } from 'node:fs';
import { CatmullRomCurve3, Vector3 } from 'three';

export const LANE = 3.4; // keep in sync with TUNING.truck.laneSpacing
export const ROW = 13; // TUNING.truck.rowSpacing

/** Same curve maths as src/trucks/path.ts. */
export function makePath(points) {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    false,
    'centripetal',
  );
  const length = curve.getLength();
  const n = Math.max(1, Math.round(length));
  const spacing = length / n;
  const samples = curve.getSpacedPoints(n);
  return {
    length,
    /** [x, y, z] at distance s, shifted sideways by offset, plus the road's yaw there in degrees. */
    at(s, offset = 0, dy = 0) {
      const f = s / spacing;
      const i = Math.min(Math.max(Math.floor(f), 0), n - 1);
      const a = samples[i];
      const b = samples[i + 1];
      const t = f - i;
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      const r = (v) => Math.round(v * 100) / 100;
      return {
        pos: [
          r(a.x + tx * t + (tz / len) * offset),
          r(a.y + (b.y - a.y) * t + dy),
          r(a.z + tz * t - (tx / len) * offset),
        ],
        yaw: r((Math.atan2(tx, tz) * 180) / Math.PI),
      };
    },
  };
}

export const CONCRETE = '#8d9299';
export const CRANE = '#e0a526';
export const BOX = ['#d9772b', '#2f6f9f', '#c8b23a', '#a33b32', '#3f8f6b'];

export const slab = (x, z0, z1, width, top = 0, color = CONCRETE, thick = 2) => ({
  type: 'box',
  pos: [x, top - thick / 2, (z0 + z1) / 2],
  size: [width, thick, z1 - z0],
  lethal: true,
  color,
});

/** A shipping container (2.6 x 2.9 x 12) lying along the road, `stack` high. */
export function container(path, s, offset, color, stack = 1) {
  const p = path.at(s, offset, (2.9 * stack) / 2);
  return {
    type: 'box',
    pos: p.pos,
    size: [2.6, 2.9 * stack, 12],
    rot: [0, p.yaw, 0],
    lethal: true,
    color: BOX[color % BOX.length],
  };
}

/** Containers along both edges of the road, clear of the lanes. */
export function sideDecor(path, list, edge = 11) {
  return list.map(([s, side, stack], i) => container(path, s, side * edge, i, stack));
}

/** A gantry crane straddling the road. */
export function gantry(path, s, span = 30, height = 17) {
  const out = [];
  for (const side of [-1, 1]) {
    const p = path.at(s, (side * span) / 2, height / 2);
    out.push({
      type: 'box',
      pos: p.pos,
      size: [1.6, height, 1.6],
      rot: [0, p.yaw, 0],
      lethal: true,
      color: CRANE,
    });
  }
  const top = path.at(s, 0, height);
  out.push({
    type: 'box',
    pos: top.pos,
    size: [span + 4, 2, 2.4],
    rot: [0, top.yaw, 0],
    lethal: true,
    color: CRANE,
  });
  return out;
}

export const wall = (path, s, height = 5, width = 14) => {
  const p = path.at(s);
  return { type: 'breakableWall', pos: p.pos, width, height, yaw: p.yaw };
};

export const goalAt = (path, s) => ({ pos: path.at(s).pos, width: 16, height: 12 });

/** Path distance of the rear row, of the player (row 1), and of the goal 420 m on. */
export const START = 50;
export const PLAYER_S = START + ROW;
export const GOAL_S = PLAYER_S + 420;

/** Write each [slug, level] pair to src/level/data/<folder>/<id>-<slug>.json. */
export function writeLevels(folder, levels) {
  mkdirSync(`src/level/data/${folder}`, { recursive: true });
  for (const [slug, data] of levels) {
    const file = `src/level/data/${folder}/${data.id}-${slug}.json`;
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
    console.log('wrote', file);
  }
}
