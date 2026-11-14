// Builds the FOUNDRY (world 7) level files. Run: node scripts/build-foundry.mjs
import { GOAL_S, START, goalAt, makePath, writeLevels } from './level-kit.mjs';

const PALETTE = { sky: '#2a1d1a', ground: '#3a2620', fog: '#3d2a22', fogFar: 340, road: '#2e2a2a' };
const STEEL = '#4a4f57';
const LANES = [-3.4, 0, 3.4];

const straight = [
  [0, 0, -40],
  [0, 0, 640],
]; // path distance s = z + 40
const path = makePath(straight);

/** `rows`: thirteen metres a row from z = 10. Presses must stand beyond where the convoy starts. */
function level(n, name, parTime, rows, body) {
  return {
    id: `7-${n}`,
    name,
    world: 'foundry',
    parTime,
    killY: -5,
    palette: PALETTE,
    player: { convoy: 'main', row: 1, lane: 1 },
    paths: [{ id: 'road', width: 14, lanes: 3, points: straight }],
    convoys: [
      { id: 'main', path: 'road', rows, lanesUsed: [0, 1, 2], startAt: START, wobble: 0.06 },
    ],
    scenery: [],
    hazards: [],
    goal: goalAt(path, GOAL_S),
    ...body,
  };
}

/** A boost belt across the whole road. */
const belt = (z, factor = 1.35, seconds = 3) => ({
  hazards: [{ type: 'belt', pos: [0, 0, z], size: [12, 14], factor, seconds }],
});

/**
 * A gantry of presses at `z`, one over each lane in `lanes`, coming down one
 * after another so that there is always a lane that is open.
 */
function presses(z, period, lanes = [0, 1, 2], shift = 0) {
  return {
    hazards: lanes.map((lane, i) => ({
      type: 'press',
      pos: [LANES[lane], 0, z],
      size: [3, 8],
      period,
      down: 1,
      phase: Math.round(((i / lanes.length + shift) % 1) * 1000) / 1000,
    })),
    scenery: [
      // The frame the presses hang from.
      ...[-8, 8].map((x) => ({
        type: 'box',
        pos: [x, 9, z],
        size: [1.2, 18, 1.2],
        lethal: true,
        color: STEEL,
      })),
      { type: 'box', pos: [0, 18.4, z], size: [17.2, 1.2, 9], lethal: true, color: STEEL },
    ],
  };
}

/** The floor floods: every truck is gone `seconds` after the start. */
const melt = (seconds) => ({
  hazards: [{ type: 'melt', rise: Math.round((1.2 / seconds) * 10000) / 10000 }],
});

function combine(...pieces) {
  return {
    hazards: pieces.flatMap((p) => p.hazards ?? []),
    scenery: pieces.flatMap((p) => p.scenery ?? []),
  };
}

const levels = [];

// 7-1 Fast Lane: boost belts. The front rows pull away, then the convoy closes up again.
levels.push(['fast-lane', level(1, 'Fast Lane', 14, 20, combine(belt(150), belt(290)))]);

// 7-2 Stamping Line: presses over the lanes, one at a time. Be in a lane that is open.
levels.push([
  'stamping-line',
  level(2, 'Stamping Line', 16, 8, combine(presses(210, 6), presses(340, 5.4, [0, 1, 2], 0.5))),
]);

// 7-3 Meltdown: the floor floods. Ride and you sink with the trucks; run up the convoy.
levels.push(['meltdown', level(3, 'Meltdown', 14, 20, combine(melt(17)))]);

// 7-4 Hot Press: a belt throws the convoy at a gantry.
levels.push([
  'hot-press',
  level(
    4,
    'Hot Press',
    15,
    8,
    combine(belt(140), presses(260, 5.6), presses(370, 5, [0, 1, 2], 0.4)),
  ),
]);

// 7-5 Overflow: the melt again, with belts to gain time on.
levels.push(['overflow', level(5, 'Overflow', 13, 20, combine(melt(15), belt(120), belt(260)))]);

// 7-6 Furnace Line: the melt and the presses together.
levels.push([
  'furnace-line',
  level(
    6,
    'Furnace Line',
    14,
    12,
    combine(melt(18), presses(250, 6), presses(380, 5.4, [0, 1, 2], 0.5)),
  ),
]);

writeLevels('foundry', levels);
