// Builds THE SUMMIT (world 9) level files, ending with the finale. Run: node scripts/build-summit.mjs
import { PLAYER_S, START, goalAt, makePath, writeLevels } from './level-kit.mjs';

const PALETTE = { sky: '#b9cfe6', ground: '#e6eef5', fog: '#c9dbec', fogFar: 380, road: '#77879a' };
const ROCK = '#5d6875';
const PINE = '#2f5d4a';
const POLE = '#6b5a48';
const FLAG = '#e5484d';
const CRANE = '#e0a526';

const straight = [
  [0, 0, -40],
  [0, 0, 1300],
]; // path distance s = z + 40
const path = makePath(straight);
const s = (z) => z + 40;

/** `length`: metres from the player's start to the goal. */
function level(n, name, parTime, rows, body, length = 420) {
  return {
    id: `9-${n}`,
    name,
    world: 'summit',
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
    goal: goalAt(path, PLAYER_S + length),
    ...body,
  };
}

const ice = (z, length) => ({ hazards: [{ type: 'ice', pos: [0, 0, z], size: [16, length] }] });

/** A blast plate, then a rock kerb the thrown trucks clear. */
function kerbJump(z) {
  return {
    hazards: [{ type: 'plate', pos: [0, 0, z], size: [14, 4], power: 10 }],
    scenery: [
      { type: 'box', pos: [0, 0.6, z + 8.9], size: [18, 1.2, 0.8], lethal: true, color: ROCK },
    ],
  };
}

/** A cable across the road, low enough that it must be jumped. */
function line(z) {
  return {
    hazards: [{ type: 'beam', pos: [0, 4.3, z], length: 16 }],
    scenery: [-8.5, 8.5].map((x) => ({
      type: 'box',
      pos: [x, 3.5, z],
      size: [0.6, 7, 0.6],
      lethal: true,
      color: POLE,
    })),
  };
}

function wind(z0, z1, force, gust) {
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
  };
}

/** A weight swinging from a cableway mast, timed to sweep the starting lane when a still rider arrives. */
function swing(z, period) {
  const PIVOT = 18;
  const arrival = (s(z) - PLAYER_S) / 18;
  const phase = (1 - ((arrival / period) % 1)) % 1;
  return {
    hazards: [
      {
        type: 'pendulum',
        pos: [0, PIVOT, z],
        length: 12.5,
        swing: 28,
        period,
        phase: Math.round(phase * 1000) / 1000,
        size: 2.4,
      },
    ],
    scenery: [
      {
        type: 'box',
        pos: [-13, (PIVOT + 1) / 2, z],
        size: [1.6, PIVOT + 1, 1.6],
        lethal: true,
        color: CRANE,
      },
      {
        type: 'box',
        pos: [-6, PIVOT + 0.6, z],
        size: [15.6, 1.2, 1.2],
        lethal: true,
        color: CRANE,
      },
    ],
  };
}

/** The avalanche: its front starts `behind` metres behind the rear row. `stages`: [z, speed] changes of pace. */
const slide = (speed, behind, stages = []) => ({
  hazards: [
    {
      type: 'slide',
      path: 'road',
      startAt: START - behind,
      speed,
      width: 44,
      ...(stages.length ? { stages: stages.map(([z, v]) => [s(z), v]) } : {}),
    },
  ],
});

/** Lightning that only strikes while the player is between z0 and z1. */
const strikes = (period, warning, z0, z1, phase = 0) => ({
  hazards: [{ type: 'strike', period, warning, phase, between: [z0, z1] }],
});

/** Pines and rocks beside the road from z0 to z1. */
function slopes(z0, z1, step = 34) {
  const scenery = [];
  let i = 0;
  for (let z = z0; z < z1; z += step, i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (12 + (i % 3) * 3);
    if (i % 3 === 2) {
      const size = 3 + (i % 4);
      scenery.push({
        type: 'box',
        pos: [x, size / 2 - 0.4, z],
        size: [size, size, size],
        rot: [0, 20 + i * 23, 0],
        lethal: true,
        color: ROCK,
      });
    } else {
      const h = 7 + (i % 4) * 2;
      scenery.push({
        type: 'box',
        pos: [x, h / 2, z],
        size: [1.6, h, 1.6],
        lethal: true,
        color: PINE,
      });
    }
  }
  return { scenery };
}

/** A flagged arch high over the road that marks the start of a stage. It is out of reach. */
function arch(z) {
  return {
    scenery: [
      ...[-10, 10].map((x) => ({
        type: 'box',
        pos: [x, 8, z],
        size: [0.8, 16, 0.8],
        lethal: true,
        color: POLE,
      })),
      { type: 'box', pos: [0, 15.4, z], size: [20.8, 1.2, 0.6], lethal: true, color: FLAG },
    ],
  };
}

function combine(...pieces) {
  return {
    hazards: pieces.flatMap((p) => p.hazards ?? []),
    scenery: pieces.flatMap((p) => p.scenery ?? []),
  };
}

const levels = [];

// 9-1 Foothills: black ice, then a kerb to be thrown over.
levels.push([
  'foothills',
  level(1, 'Foothills', 16, 8, combine(ice(170, 70), kerbJump(290), ice(385, 50), slopes(20, 460))),
]);

// 9-2 Ridge Wind: the wind over the ridge, with cables to jump.
levels.push([
  'ridge-wind',
  level(
    2,
    'Ridge Wind',
    16,
    20,
    combine(
      wind(110, 250, 8),
      wind(270, 430, -8, { on: 2.2, off: 2.2 }),
      line(190),
      line(330),
      line(400),
      slopes(20, 460),
    ),
  ),
]);

// 9-3 First Slide: an avalanche comes down the road behind the convoy. Keep moving up.
levels.push([
  'first-slide',
  level(3, 'First Slide', 15, 20, combine(slide(23, 60), slopes(20, 460))),
]);

// 9-4 Cornice: the avalanche again, with kerbs on the way.
levels.push([
  'cornice',
  level(
    4,
    'Cornice',
    16,
    10,
    combine(slide(22, 55), kerbJump(215), kerbJump(350), slopes(20, 460)),
  ),
]);

// 9-5 Thin Air: the avalanche, and weights swinging from the cableway.
levels.push([
  'thin-air',
  level(
    5,
    'Thin Air',
    16,
    20,
    combine(slide(22, 60), swing(205, 5), swing(335, 4.6), slopes(20, 460)),
  ),
]);

// 9-6 The Avalanche: the finale. Three stages, one slide, no stopping.
//   Stage 1, tree line: cableway weights.          (z < 330)
//   Stage 2, the ridge: gusts and kerbs.           (330 to 660)
//   Stage 3, the summit: lightning, and it speeds up.
levels.push([
  'the-avalanche',
  level(
    6,
    'The Avalanche',
    42,
    24,
    combine(
      slide(19.5, 70, [
        [330, 20.5],
        [660, 22],
      ]),
      swing(150, 5),
      swing(262, 4.6),
      arch(330),
      wind(345, 640, 7, { on: 2.4, off: 2.4 }),
      kerbJump(400),
      kerbJump(540),
      arch(660),
      strikes(5.4, 2.3, 660, 1100, 0.3),
      slopes(20, 330),
      slopes(700, 1040, 46),
    ),
    980,
  ),
]);

writeLevels('summit', levels);
