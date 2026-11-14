// Builds the SKYLINE (world 8) level files. Run: node scripts/build-skyline.mjs
import { GOAL_S, PLAYER_S, START, goalAt, makePath, writeLevels } from './level-kit.mjs';

const PALETTE = { sky: '#f3b27a', ground: '#3b3f52', fog: '#eeb98c', fogFar: 520, road: '#5b6070' };
const ROOF = ['#7c8496', '#8a7f8f', '#6f8791', '#90887c'];
const TOWER = ['#565c70', '#6a6278', '#4f6470'];
const CRANE = '#e0a526';
/** How far down the street is. Falling off a roof is a long way. */
const STREET = -45;

const straight = [
  [0, 0, -40],
  [0, 0, 640],
]; // path distance s = z + 40
const path = makePath(straight);

function level(n, name, parTime, rows, body) {
  return {
    id: `8-${n}`,
    name,
    world: 'skyline',
    parTime,
    killY: STREET,
    ground: 'none',
    palette: PALETTE,
    player: { convoy: 'main', row: 1, lane: 1 },
    // Not drawn: the road ribbon would continue out over the gaps.
    paths: [{ id: 'road', width: 14, lanes: 3, points: straight, visible: false }],
    convoys: [
      { id: 'main', path: 'road', rows, lanesUsed: [0, 1, 2], startAt: START, wobble: 0.05 },
    ],
    scenery: [],
    hazards: [],
    goal: goalAt(path, GOAL_S),
    ...body,
  };
}

let roofCount = 0;
/** A building whose flat roof (at y = 0) the convoy drives on, from z0 to z1. */
function roof(z0, z1, width = 20, x = 0) {
  const color = ROOF[roofCount++ % ROOF.length];
  return {
    type: 'box',
    pos: [x, STREET / 2 - 0.5, (z0 + z1) / 2],
    size: [width, -STREET + 1, z1 - z0],
    lethal: true,
    color,
  };
}

/**
 * Roofs from z = -60 to 700 with a gap at each [z, width] in `gaps`, and a
 * blast plate just before each gap that throws the convoy across.
 */
function roofs(gaps, end = 700) {
  const scenery = [];
  const hazards = [];
  let from = -60;
  for (const [z, width] of gaps) {
    scenery.push(roof(from, z));
    hazards.push({ type: 'plate', pos: [0, 0, z - 3], size: [14, 4], power: 10 });
    from = z + width;
  }
  scenery.push(roof(from, end));
  return { scenery, hazards };
}

/** Other towers beside the road, for a sense of height and speed. They are out of reach. */
function towers(zs) {
  return {
    scenery: zs.map((z, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const top = -12 + ((i * 7) % 5) * 9;
      return {
        type: 'box',
        pos: [side * (34 + (i % 3) * 6), (STREET + top) / 2, z],
        size: [22, top - STREET, 30 + (i % 2) * 14],
        lethal: true,
        color: TOWER[i % TOWER.length],
      };
    }),
  };
}

/** A wrecking weight on a rooftop crane, timed to sweep the starting lane when a still rider arrives. */
function swing(z, period) {
  const PIVOT = 18;
  const arrival = (z + 40 - PLAYER_S) / 18;
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
        pos: [-9, (PIVOT + 1) / 2, z],
        size: [1.4, PIVOT + 1, 1.4],
        lethal: true,
        color: CRANE,
      },
      {
        type: 'box',
        pos: [-4, PIVOT + 0.6, z],
        size: [11.4, 1.2, 1.2],
        lethal: true,
        color: CRANE,
      },
    ],
  };
}

function combine(...pieces) {
  return {
    hazards: pieces.flatMap((p) => p.hazards ?? []),
    scenery: pieces.flatMap((p) => p.scenery ?? []),
  };
}

/** The line of crane-carried trucks beside the road: level until `lift`, then up 3 m. */
const hookPts = (lift) => [
  [9.3, 0, -40],
  [9.3, 0, lift],
  [9.3, 3, lift + 60],
  [9.3, 3, 760],
];
const HOOK_PATH = (lift) => ({
  id: 'hook',
  width: 8,
  lanes: 2,
  points: hookPts(lift),
  visible: false,
});
const CARRIED = {
  id: 'carried',
  path: 'hook',
  rows: 18,
  lanesUsed: [0, 1],
  startAt: START,
  float: true,
};

const levels = [];

// 8-1 Rooftops: the roof ends. A blast plate throws every truck across to the next building.
levels.push([
  'rooftops',
  level(1, 'Rooftops', 16, 8, combine(roofs([[200, 6]]), towers([60, 150, 260, 350, 430]))),
]);

// 8-2 Long Jump: two gaps, the second wider.
levels.push([
  'long-jump',
  level(
    2,
    'Long Jump',
    16,
    8,
    combine(
      roofs([
        [180, 6],
        [310, 9],
      ]),
      towers([40, 130, 240, 330, 420]),
    ),
  ),
]);

// 8-3 Runaway Gate: the gate is being carried off. Riding catches it eventually; running catches it sooner.
levels.push([
  'runaway-gate',
  level(3, 'Runaway Gate', 12, 20, {
    ...combine(roofs([], 900), towers([80, 200, 320, 440, 560])),
    goal: { pos: [0, 0, 250], width: 16, height: 12, speed: 8, travel: 400 },
  }),
]);

// 8-4 Crane Line: the roof ends for good. Crane-carried trucks glide alongside and lift away: change over.
{
  const hook = makePath(hookPts(300));
  levels.push([
    'crane-line',
    level(4, 'Crane Line', 17, 14, {
      player: { convoy: 'main', row: 1, lane: 2 },
      paths: [
        { id: 'road', width: 12, lanes: 3, points: straight, visible: false },
        HOOK_PATH(300),
      ],
      convoys: [
        { id: 'main', path: 'road', rows: 14, lanesUsed: [0, 1, 2], startAt: START },
        CARRIED,
      ],
      ...combine({ scenery: [roof(-60, 300, 13.2)] }, towers([70, 190, 300, 410, 520])),
      goal: { pos: hook.at(GOAL_S - 90).pos, width: 14, height: 12, speed: 5, travel: 200 },
    }),
  ]);
}

// 8-5 Leapfrog: a gap, a wrecking weight, a gap.
levels.push([
  'leapfrog',
  level(
    5,
    'Leapfrog',
    17,
    8,
    combine(
      roofs([
        [170, 7],
        [345, 8],
      ]),
      swing(262, 5),
      towers([50, 140, 250, 360, 440]),
    ),
  ),
]);

// 8-6 Last Roof: a gap, then the roofs run out. The crane line has been beside you all along.
{
  const hook = makePath(hookPts(330));
  const base = roofs([[170, 7]], 330);
  levels.push([
    'last-roof',
    level(6, 'Last Roof', 18, 8, {
      player: { convoy: 'main', row: 1, lane: 2 },
      paths: [
        { id: 'road', width: 12, lanes: 3, points: straight, visible: false },
        HOOK_PATH(330),
      ],
      convoys: [
        { id: 'main', path: 'road', rows: 8, lanesUsed: [0, 1, 2], startAt: START },
        CARRIED,
      ],
      ...combine(
        {
          scenery: base.scenery.map((r) => ({ ...r, size: [13.2, r.size[1], r.size[2]] })),
          hazards: base.hazards,
        },
        towers([60, 180, 300, 420, 540]),
      ),
      goal: { pos: hook.at(GOAL_S - 70).pos, width: 14, height: 12, speed: 5, travel: 200 },
    }),
  ]);
}

writeLevels('skyline', levels);
