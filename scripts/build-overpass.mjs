// Builds the OVERPASS (world 2) level files. Run: node scripts/build-overpass.mjs
import { GOAL_S, LANE, START, makePath, slab, writeLevels } from './level-kit.mjs';

const PALETTE = { sky: '#bfe3f2', ground: '#7d8f72', fog: '#d9eef5', fogFar: 480, road: '#4b4f56' };
const DECK = '#6a6f77';
const PILLAR = '#575b62';
const SIGN = '#2f8f5b';
const POST = '#c9ced6';
const DEPTH = -14; // how far down the land is (kill height)

function level(n, name, parTime, body) {
  return {
    id: `2-${n}`,
    name,
    world: 'overpass',
    parTime,
    killY: DEPTH,
    ground: 'none',
    palette: PALETTE,
    player: { convoy: 'main', row: 1, lane: 1 },
    hazards: [],
    ...body,
  };
}

/** A straight deck along +Z with pillars underneath. */
function deck(x, z0, z1, width, top = 0) {
  const out = [slab(x, z0, z1, width, top, DECK, 1.4)];
  for (let z = z0 + 20; z < z1 - 5; z += 60) {
    const h = top - 1.4 - DEPTH;
    out.push({
      type: 'box',
      pos: [x, DEPTH + h / 2, z],
      size: [3.2, h, 3.2],
      lethal: true,
      color: PILLAR,
    });
  }
  return out;
}

/**
 * An overhead sign at `z`. The lethal part is a beam whose underside is 0.8 m
 * above the trailer roofs, so a rider has to jump it; `x0..x1` is how much of
 * the road it covers. It hangs from a gantry that stands clear of the lanes
 * and passes well above a jumping player.
 */
function sign(z, top = 0, x0 = -12, x1 = 12, edge = 12.4, centre = 0) {
  const bottom = top + 3.8 + 0.8;
  const truss = top + 10.5;
  const box = (pos, size, color) => ({ type: 'box', pos, size, lethal: true, color });
  const out = [
    box([(x0 + x1) / 2, bottom + 0.35, z], [x1 - x0, 0.7, 0.6], SIGN),
    box([centre, truss, z], [edge * 2 + 0.5, 0.6, 0.6], POST),
  ];
  for (const side of [-1, 1]) {
    out.push(
      box([centre + side * edge, top + (truss - top) / 2, z], [0.5, truss - top, 0.5], POST),
    );
  }
  // Hangers from the truss down to each end of the beam.
  for (const x of [x0 + 0.3, x1 - 0.3]) {
    const from = bottom + 0.7;
    out.push(box([x, (from + truss) / 2, z], [0.25, truss - from, 0.25], POST));
  }
  return out;
}

const straight = [
  [0, 0, -40],
  [0, 0, 640],
]; // s = z + 40
const z = (s) => s - 40;
const levels = [];

// 2-1 On Ramp: overhead signs, alone and far apart. Jump each one.
{
  const path = makePath(straight);
  levels.push([
    'on-ramp',
    level(1, 'On Ramp', 16, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: straight }],
      convoys: [
        { id: 'main', path: 'road', rows: 20, lanesUsed: [0, 1, 2], startAt: START, wobble: 0.07 },
      ],
      scenery: [...deck(0, -60, 540, 26), ...sign(z(230)), ...sign(z(330)), ...sign(z(430))],
      goal: { pos: path.at(GOAL_S).pos, width: 16, height: 12 },
    }),
  ]);
}

// 2-2 Step Down: the deck drops twice. Trucks thump down the steps; hold on.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 198],
    [0, -1.5, 203],
    [0, -1.5, 328],
    [0, -3, 333],
    [0, -3, 640],
  ];
  const path = makePath(pts);
  levels.push([
    'step-down',
    level(2, 'Step Down', 16, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: pts, visible: false }],
      convoys: [{ id: 'main', path: 'road', rows: 20, lanesUsed: [0, 1, 2], startAt: START }],
      scenery: [
        ...deck(0, -60, 200, 26, 0),
        ...deck(0, 200, 330, 26, -1.5),
        ...deck(0, 330, 540, 26, -3),
        ...sign(400, -3),
      ],
      goal: { pos: path.at(GOAL_S + 2).pos, width: 16, height: 12 },
    }),
  ]);
}

// 2-3 Flyover: your deck ends. Drop to the convoy on the road below before it does.
{
  const LOW = -7;
  const lowPts = [
    [-16, LOW, -40],
    [-16, LOW, 250],
    [-40, LOW, 400],
    [-40, LOW, 700],
  ];
  const low = makePath(lowPts);
  levels.push([
    'flyover',
    level(3, 'Flyover', 16, {
      player: { convoy: 'main', row: 1, lane: 0 },
      paths: [
        {
          id: 'deck',
          width: 12,
          lanes: 3,
          points: [
            [0, 0, -40],
            [0, 0, 400],
          ],
        },
        { id: 'low', width: 14, lanes: 3, points: lowPts },
      ],
      convoys: [
        { id: 'main', path: 'deck', rows: 10, lanesUsed: [0, 1, 2], startAt: START },
        {
          id: 'lower',
          path: 'low',
          rows: 20,
          lanesUsed: [1, 2],
          startAt: START - 10,
          wobble: 0.06,
        },
      ],
      scenery: [
        slab(-30, -60, 640, 80, LOW, DECK, 1.4),
        ...deck(0, -60, 252, 13, 0),
        // End-of-road barrier.
        { type: 'box', pos: [0, 2.5, 258], size: [13, 5, 1.2], lethal: true, color: '#e5484d' },
      ],
      goal: { pos: low.at(GOAL_S).pos, width: 16, height: 13 },
    }),
  ]);
}

// 2-4 Sky Hook: the deck ends in thin air. Carried trucks glide alongside and lift away: change over.
{
  const hookPts = [
    [9.3, 0, -40],
    [9.3, 0, 300],
    [9.3, 3, 360],
    [9.3, 3, 700],
  ];
  const hook = makePath(hookPts);
  levels.push([
    'sky-hook',
    level(4, 'Sky Hook', 16, {
      player: { convoy: 'main', row: 1, lane: 2 },
      paths: [
        { id: 'road', width: 12, lanes: 3, points: straight },
        { id: 'hook', width: 8, lanes: 2, points: hookPts, visible: false },
      ],
      convoys: [
        { id: 'main', path: 'road', rows: 14, lanesUsed: [0, 1, 2], startAt: START },
        { id: 'carried', path: 'hook', rows: 16, lanesUsed: [0, 1], startAt: START, float: true },
      ],
      scenery: [...deck(0, -60, 300, 13.2, 0)],
      goal: { pos: hook.at(GOAL_S).pos, width: 14, height: 12 },
    }),
  ]);
}

// 2-5 Signs: signs that cover only part of the road, then a full one after a drop.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 318],
    [0, -1.5, 323],
    [0, -1.5, 640],
  ];
  const path = makePath(pts);
  const right = LANE - 1.7; // covers the left and middle lanes
  levels.push([
    'signs',
    level(5, 'Signs', 16, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: pts, visible: false }],
      convoys: [{ id: 'main', path: 'road', rows: 20, lanesUsed: [0, 1, 2], startAt: START }],
      scenery: [
        ...deck(0, -60, 320, 26, 0),
        ...deck(0, 320, 540, 26, -1.5),
        ...sign(150, 0, -12, right),
        ...sign(215, 0, -right, 12),
        ...sign(280, 0),
        ...sign(380, -1.5, -12, right),
        ...sign(420, -1.5),
      ],
      goal: { pos: path.at(GOAL_S + 1).pos, width: 16, height: 12 },
    }),
  ]);
}

// 2-6 Interchange: signs on the upper deck, then it ends: drop to the lower road, which steps down again.
{
  const LOW = -7;
  const lowPts = [
    [-16, LOW, -40],
    [-16, LOW, 300],
    [-16, LOW - 1.5, 305],
    [-30, LOW - 1.5, 420],
    [-30, LOW - 1.5, 700],
  ];
  const low = makePath(lowPts);
  levels.push([
    'interchange',
    level(6, 'Interchange', 17, {
      player: { convoy: 'main', row: 1, lane: 0 },
      paths: [
        {
          id: 'deck',
          width: 12,
          lanes: 3,
          points: [
            [0, 0, -40],
            [0, 0, 400],
          ],
        },
        { id: 'low', width: 14, lanes: 3, points: lowPts, visible: false },
      ],
      convoys: [
        { id: 'main', path: 'deck', rows: 10, lanesUsed: [0, 1, 2], startAt: START },
        {
          id: 'lower',
          path: 'low',
          rows: 20,
          lanesUsed: [1, 2],
          startAt: START - 10,
          wobble: 0.06,
        },
      ],
      scenery: [
        slab(-25, -60, 302, 70, LOW, DECK, 1.4),
        slab(-25, 302, 640, 70, LOW - 1.5, DECK, 1.4),
        ...deck(0, -60, 262, 13, 0),
        { type: 'box', pos: [0, 2.5, 268], size: [13, 5, 1.2], lethal: true, color: '#e5484d' },
        ...sign(110, 0, -6.2, 6.2, 6.2),
        ...sign(175, 0, -6.2, 6.2, 6.2),
        ...sign(390, LOW - 1.5, -42, -18, 13, -30),
      ],
      goal: { pos: low.at(GOAL_S + 4).pos, width: 16, height: 13 },
    }),
  ]);
}

writeLevels('overpass', levels);
