// Builds the NIGHT FREIGHT (world 4) level files. Run: node scripts/build-nightfreight.mjs
import { GOAL_S, START, goalAt, makePath, writeLevels } from './level-kit.mjs';

const PALETTE = { sky: '#0b1020', ground: '#111a2c', fog: '#0b1020', fogFar: 380, road: '#262c3a' };
const STEEL = '#3a4358';
const LAMP = '#ffd166';

const straight = [
  [0, 0, -40],
  [0, 0, 640],
]; // path distance s = z + 40
const path = makePath(straight);

function level(n, name, parTime, body) {
  return {
    id: `4-${n}`,
    name,
    world: 'nightfreight',
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

/** Heights of a beam's centre. LOW must be jumped; HIGH passes over anyone standing on a cab. */
const LOW = 4.3;
const HIGH = 5.25;

/** Emitter posts at both ends of a beam across the road, so its position reads at night. */
function posts(z, half = 8.5, height = 7) {
  return [-1, 1].flatMap((side) => [
    {
      type: 'box',
      pos: [side * half, height / 2, z],
      size: [0.6, height, 0.6],
      lethal: true,
      color: STEEL,
    },
    {
      type: 'box',
      pos: [side * half, height + 0.3, z],
      size: [0.9, 0.6, 0.9],
      lethal: true,
      color: LAMP,
    },
  ]);
}

/** A beam lying across the whole road at `z`. */
const across = (z, y, extra = {}) => ({ type: 'beam', pos: [0, y, z], length: 16, ...extra });

/** A standing column of light that slides across the lanes at `z`. */
const pole = (z, period, phase = 0, reach = 5.2) => ({
  type: 'beam',
  pos: [-reach, 6, z],
  length: 12,
  vertical: true,
  thickness: 0.6,
  sweep: { to: [reach, 6, z], period, phase },
});

/**
 * A wall of light that switches on and off. It is too tall to jump and too
 * low to duck: the only way through is while it is off. `arrive` is when a
 * rider who does nothing gets there; the wall is timed to be off then.
 */
function shutter(z, arrive, on = 1.6, off = 2.4) {
  const cycle = on + off;
  // Put the rider's arrival in the middle of the off part of the cycle.
  const phase = (((on + off / 2 - arrive) % cycle) + cycle) % cycle;
  return across(z, 5, { thickness: 3, blink: { on, off, phase: Math.round(phase * 100) / 100 } });
}

/** When a rider on row 1 who never moves reaches `z` (convoy speed 18 m/s). */
const riderAt = (z) => (z - (START + 13 - 40)) / 18;

const levels = [];

// 4-1 Tripwire: three low beams, far apart. Jump each one.
levels.push([
  'tripwire',
  level(1, 'Tripwire', 16, {
    scenery: [200, 300, 400].flatMap((z) => posts(z)),
    hazards: [200, 300, 400].map((z) => across(z, LOW)),
  }),
]);

// 4-2 High Beams: beams at head height for anyone on a trailer. Ride on the cab, which is lower.
{
  const zs = [150, 215, 280, 345, 410];
  levels.push([
    'high-beams',
    level(2, 'High Beams', 16, {
      scenery: zs.flatMap((z) => posts(z)),
      hazards: zs.map((z) => across(z, HIGH)),
    }),
  ]);
}

// 4-3 Sweep: columns of light slide across the lanes. Be in a lane the column is not in.
levels.push([
  'sweep',
  level(3, 'Sweep', 16, {
    scenery: [220, 340].flatMap((z) => posts(z, 9.5, 13)),
    hazards: [pole(220, 7), pole(340, 6, 0.4)],
  }),
]);

// 4-4 Shutter: walls of light that switch off for a moment. Watch the warning flashes.
{
  const zs = [200, 290, 380];
  levels.push([
    'shutter',
    level(4, 'Shutter', 16, {
      scenery: zs.flatMap((z) => posts(z)),
      hazards: zs.map((z) => shutter(z, riderAt(z))),
    }),
  ]);
}

// 4-5 Turnstile: low beams turning over the road. Jump when one comes round to you.
levels.push([
  'turnstile',
  level(5, 'Turnstile', 17, {
    scenery: [
      { type: 'box', pos: [0, 9, 250], size: [0.8, 0.8, 0.8], lethal: true, color: LAMP },
      { type: 'box', pos: [0, 9, 380], size: [0.8, 0.8, 0.8], lethal: true, color: LAMP },
    ],
    hazards: [
      { type: 'beam', pos: [0, LOW, 250], length: 22, spin: 38 },
      { type: 'beam', pos: [0, LOW, 380], length: 22, spin: -52, yaw: 40 },
    ],
  }),
]);

// 4-6 Night Shift: a tripwire, a sweeping column and a shutter, and then the track is closed.
// A second convoy runs on the next track behind a fence; where the fence ends, change over.
{
  const SIDE_X = 12.5;
  const FENCE_END = 335;
  const sidePts = [
    [SIDE_X, 0, -40],
    [SIDE_X, 0, 700],
  ];
  const side = makePath(sidePts);
  levels.push([
    'night-shift',
    level(6, 'Night Shift', 17, {
      player: { convoy: 'main', row: 1, lane: 2 },
      paths: [
        { id: 'road', width: 14, lanes: 3, points: straight },
        { id: 'side', width: 8, lanes: 2, points: sidePts },
      ],
      convoys: [
        // Short, so it reaches the closed track only after the fence has ended beside its last rows.
        { id: 'main', path: 'road', rows: 6, lanesUsed: [0, 1, 2], startAt: START },
        { id: 'side', path: 'side', rows: 16, lanesUsed: [0, 1], startAt: START, wobble: 0.05 },
      ],
      scenery: [
        ...posts(150, 6.3, 7),
        // The fence between the two tracks: too tall to cross.
        {
          type: 'box',
          pos: [7.4, 3.75, (FENCE_END - 60) / 2],
          size: [0.8, 7.5, FENCE_END + 60],
          lethal: true,
          color: STEEL,
        },
        // Track closed.
        { type: 'box', pos: [0, 3, 425], size: [13, 6, 3], lethal: true, color: '#e5484d' },
      ],
      hazards: [
        { type: 'beam', pos: [0, LOW, 150], length: 12 },
        {
          type: 'beam',
          pos: [-5, 6, 225],
          length: 12,
          vertical: true,
          thickness: 0.6,
          sweep: { to: [5, 6, 225], period: 7 },
        },
        { ...shutter(300, riderAt(300)), length: 12 },
      ],
      goal: { pos: side.at(GOAL_S).pos, width: 14, height: 12 },
    }),
  ]);
}

writeLevels('nightfreight', levels);
