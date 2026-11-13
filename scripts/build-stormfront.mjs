// Builds the STORMFRONT (world 6) level files. Run: node scripts/build-stormfront.mjs
import { GOAL_S, START, goalAt, makePath, writeLevels } from './level-kit.mjs';

const PALETTE = { sky: '#4d5d69', ground: '#2c363c', fog: '#56666f', fogFar: 360, road: '#39434a' };
const POLE = '#6b5a48';
const SOCK = '#ff7a1a';

const straight = [
  [0, 0, -40],
  [0, 0, 640],
]; // path distance s = z + 40
const path = makePath(straight);

function level(n, name, parTime, body) {
  return {
    id: `6-${n}`,
    name,
    world: 'stormfront',
    parTime,
    killY: -5,
    palette: PALETTE,
    player: { convoy: 'main', row: 1, lane: 1 },
    paths: [{ id: 'road', width: 14, lanes: 3, points: straight }],
    convoys: [
      { id: 'main', path: 'road', rows: 20, lanesUsed: [0, 1, 2], startAt: START, wobble: 0.06 },
    ],
    scenery: [],
    hazards: [],
    goal: goalAt(path, GOAL_S),
    ...body,
  };
}

/** A sagging power line across the road, low enough that it must be jumped. */
const LOW = 4.3;
function line(z) {
  return {
    hazards: [{ type: 'beam', pos: [0, LOW, z], length: 16 }],
    scenery: [-8.5, 8.5].map((x) => ({
      type: 'box',
      pos: [x, 3.5, z],
      size: [0.6, 7, 0.6],
      lethal: true,
      color: POLE,
    })),
  };
}

/**
 * Wind across the road from z0 to z1. Positive force blows toward +X. A wind
 * sock on a pole stands at the start of the stretch on the side the wind
 * comes from.
 */
function wind(z0, z1, force, gust) {
  const from = force > 0 ? -1 : 1;
  return {
    hazards: [
      {
        type: 'wind',
        pos: [0, 0, (z0 + z1) / 2],
        size: [60, z1 - z0],
        force,
        ...(gust ? { gust } : {}),
      },
    ],
    scenery: [
      { type: 'box', pos: [from * 10, 4, z0], size: [0.4, 8, 0.4], lethal: true, color: POLE },
      {
        type: 'box',
        pos: [from * 10 - from * 1.4, 7.6, z0],
        size: [2.4, 0.7, 0.7],
        lethal: true,
        color: SOCK,
      },
    ],
  };
}

/** Lightning that marks the truck the player is on, then destroys it. */
const strikes = (period, warning, phase = 0) => ({
  hazards: [{ type: 'strike', period, warning, phase }],
});

function combine(...pieces) {
  return {
    hazards: pieces.flatMap((p) => p.hazards ?? []),
    scenery: pieces.flatMap((p) => p.scenery ?? []),
  };
}

const levels = [];

// 6-1 Crosswind: a steady side wind. Riding is safe; every jump is carried sideways.
levels.push([
  'crosswind',
  level(1, 'Crosswind', 16, combine(wind(130, 420, 6), line(220), line(330))),
]);

// 6-2 Gusts: the wind comes and goes. Jump the lines in a lull, or steer into it.
levels.push([
  'gusts',
  level(
    2,
    'Gusts',
    16,
    combine(wind(120, 420, -9, { on: 2.2, off: 2.6 }), line(200), line(290), line(380)),
  ),
]);

// 6-3 Lightning: a column of light marks the truck that is about to be hit. Get off it.
levels.push(['lightning', level(3, 'Lightning', 16, combine(strikes(5, 2.2, 0.35)))]);

// 6-4 Squall: the wind changes side halfway.
levels.push([
  'squall',
  level(
    4,
    'Squall',
    17,
    combine(wind(110, 255, 7), wind(275, 420, -7), line(180), line(240), line(320), line(390)),
  ),
]);

// 6-5 Thunderhead: faster lightning, with lines to jump between strikes.
levels.push([
  'thunderhead',
  level(5, 'Thunderhead', 17, combine(strikes(4.2, 2, 0.3), line(210), line(350))),
]);

// 6-6 Eye of the Storm: gusts, lightning and lines together.
levels.push([
  'eye-of-the-storm',
  level(
    6,
    'Eye of the Storm',
    18,
    combine(wind(120, 420, 6, { on: 2.4, off: 2.4 }), strikes(5.2, 2.2, 0.1), line(215), line(400)),
  ),
]);

writeLevels('stormfront', levels);
