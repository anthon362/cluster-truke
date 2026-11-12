// Builds the QUARRY (world 5) level files. Run: node scripts/build-quarry.mjs
import { GOAL_S, START, goalAt, makePath, writeLevels } from './level-kit.mjs';

const PALETTE = { sky: '#e6d2ae', ground: '#a8875c', fog: '#dcc8a2', fogFar: 420, road: '#6e5d49' };
const ROCK = '#7d6a55';
const CRANE = '#e0a526';

const straight = [
  [0, 0, -40],
  [0, 0, 640],
]; // path distance s = z + 40
const path = makePath(straight);

function level(n, name, parTime, body) {
  return {
    id: `5-${n}`,
    name,
    world: 'quarry',
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

/** A blast plate across the whole road at `z`. */
const plate = (z, power = 10) => ({ type: 'plate', pos: [0, 0, z], size: [14, 4], power });

/**
 * A blast plate followed by a low rock kerb across the road. A truck thrown
 * by the plate clears the kerb; the distance is where a thrown truck is at
 * the top of its hop.
 */
function kerbJump(z, height = 1.2) {
  return {
    hazards: [plate(z)],
    scenery: [
      {
        type: 'box',
        pos: [0, height / 2, z + 8.9],
        size: [18, height, 0.8],
        lethal: true,
        color: ROCK,
      },
    ],
  };
}

/** A wrecking weight hung from a crane arm over the road, swinging across the lanes at roof height. */
function swing(z, period, phase = 0) {
  const PIVOT = 18;
  return {
    hazards: [
      { type: 'pendulum', pos: [0, PIVOT, z], length: 12.5, swing: 28, period, phase, size: 2.4 },
    ],
    scenery: [
      // The crane: a mast beside the road and an arm out over it.
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

/** A boulder that starts behind the convoy and rolls after it. */
const boulder = (speed, behind = 55) => ({
  type: 'boulder',
  path: 'road',
  startAt: START - behind,
  speed,
  radius: 4.5,
});

/** Rock piles beside the road, for a sense of place and speed. */
function rocks(zs) {
  return zs.map((z, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const size = 3 + (i % 3);
    return {
      type: 'box',
      pos: [side * (12 + (i % 2) * 2), size / 2 - 0.3, z],
      size: [size, size, size],
      rot: [0, 25 + i * 17, 0],
      lethal: true,
      color: ROCK,
    };
  });
}

/** Merge several { hazards, scenery } pieces. */
function combine(...pieces) {
  return {
    hazards: pieces.flatMap((p) => p.hazards ?? []),
    scenery: pieces.flatMap((p) => p.scenery ?? []),
  };
}

const levels = [];

// 5-1 Blast Plate: plates in the road throw every truck into the air. Hold on.
levels.push([
  'blast-plate',
  level(1, 'Blast Plate', 16, {
    hazards: [plate(220, 9), plate(340, 10)],
    scenery: rocks([90, 170, 280, 400]),
  }),
]);

// 5-2 Kerb Jump: a plate, then a rock kerb the thrown trucks sail over.
levels.push([
  'kerb-jump',
  level(2, 'Kerb Jump', 16, {
    ...combine(kerbJump(200), kerbJump(330), { scenery: rocks([100, 260, 410]) }),
  }),
]);

// 5-3 Swing: wrecking weights swing across the lanes at roof height. Be in a lane it is not in.
levels.push([
  'swing',
  level(3, 'Swing', 16, {
    ...combine(swing(220, 5.2), swing(345, 4.4, 0.3), { scenery: rocks([120, 290, 420]) }),
  }),
]);

// 5-4 Rockfall: a boulder rolls after the convoy and crushes what it reaches. Keep moving forward.
levels.push([
  'rockfall',
  level(4, 'Rockfall', 16, {
    hazards: [boulder(22.5)],
    scenery: rocks([60, 150, 240, 330, 420]),
  }),
]);

// 5-5 Quarry Run: a kerb jump, a wrecking weight, another kerb jump.
levels.push([
  'quarry-run',
  level(5, 'Quarry Run', 17, {
    ...combine(kerbJump(180), swing(275, 5), kerbJump(360), { scenery: rocks([110, 230, 420]) }),
  }),
]);

// 5-6 Deep Cut: the boulder again, with kerb jumps on the way.
levels.push([
  'deep-cut',
  level(6, 'Deep Cut', 17, {
    ...combine(kerbJump(210), kerbJump(345), {
      hazards: [boulder(22)],
      scenery: rocks([80, 280, 430]),
    }),
  }),
]);

writeLevels('quarry', levels);
