// Builds the WHITEOUT (world 3) level files. Run: node scripts/build-whiteout.mjs
import { GOAL_S, START, goalAt, makePath, wall, writeLevels } from './level-kit.mjs';

const PALETTE = { sky: '#e3edf3', ground: '#d4e2ea', fog: '#eaf2f6', fogFar: 320, road: '#8ea3b1' };
const SNOW = '#f4f8fb';
const ROCK = '#7f8b96';

function level(n, name, parTime, body) {
  return {
    id: `3-${n}`,
    name,
    world: 'whiteout',
    parTime,
    killY: -5,
    palette: PALETTE,
    player: { convoy: 'main', row: 1, lane: 1 },
    scenery: [],
    hazards: [],
    ...body,
  };
}

/** An ice patch across the road, centred on the path at `s`, `length` long. */
function ice(path, s, length, width = 16) {
  const p = path.at(s);
  return { type: 'ice', pos: p.pos, size: [width, length], yaw: p.yaw };
}

/** A rotor over the road at `s`: spokes sweep just above the trailer roofs. */
function rotor(path, s, speed, phase = 0, spokes = 3) {
  const p = path.at(s, 0, 10.2);
  return { type: 'rotor', pos: p.pos, radius: 6, spokes, speed, phase, yaw: p.yaw };
}

/** A snow-covered boulder beside the road. */
function boulder(path, s, offset, size = 4) {
  const p = path.at(s, offset, size / 2 - 0.4);
  return {
    type: 'box',
    pos: p.pos,
    size: [size, size, size],
    rot: [0, p.yaw + 20, 0],
    lethal: true,
    color: ROCK,
  };
}

/** Tall marker poles beside a rotor so it reads from far away in the fog. */
function pylons(path, s, sides = [-1, 1]) {
  return sides.map((side) => {
    const p = path.at(s, side * 9.5, 8);
    return { type: 'box', pos: p.pos, size: [1, 16, 1], lethal: true, color: '#e5484d' };
  });
}

const straight = [
  [0, 0, -40],
  [0, 0, 640],
];
const levels = [];

// 3-1 Black Ice: one long icy bend. The trucks drift wide; the middle lane keeps its road.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 150],
    [22, 0, 290],
    [22, 0, 380],
    [4, 0, 480],
    [4, 0, 700],
  ];
  const path = makePath(pts);
  levels.push([
    'black-ice',
    level(1, 'Black Ice', 16, {
      paths: [{ id: 'road', width: 16, lanes: 3, points: pts }],
      convoys: [
        { id: 'main', path: 'road', rows: 14, lanesUsed: [0, 1, 2], startAt: START, wobble: 0.06 },
      ],
      scenery: [boulder(path, 200, -14), boulder(path, 330, 14), boulder(path, 460, -14)],
      hazards: [ice(path, 250, 90), ice(path, 440, 70)],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 3-2 Rotor: one slow wheel across the road. Be in a lane it is not sweeping when you get there.
{
  const path = makePath(straight);
  levels.push([
    'rotor',
    level(2, 'Rotor', 16, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: straight }],
      convoys: [
        { id: 'main', path: 'road', rows: 20, lanesUsed: [0, 1, 2], startAt: START, wobble: 0.06 },
      ],
      scenery: [...pylons(path, 330)],
      hazards: [rotor(path, 330, 22, 15)],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 3-3 Slide: an icy S-bend lined with boulders. Trucks in the outside lane slide into them.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 140],
    [-24, 0, 260],
    [-24, 0, 330],
    [10, 0, 450],
    [10, 0, 700],
  ];
  const path = makePath(pts);
  levels.push([
    'slide',
    level(3, 'Slide', 17, {
      paths: [{ id: 'road', width: 16, lanes: 3, points: pts }],
      convoys: [{ id: 'main', path: 'road', rows: 14, lanesUsed: [0, 1, 2], startAt: START }],
      scenery: [
        boulder(path, 215, 9.5, 5),
        boulder(path, 245, 9.5, 4),
        boulder(path, 395, -9.5, 5),
        boulder(path, 425, -9.5, 4),
      ],
      hazards: [ice(path, 215, 110), ice(path, 400, 110)],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 3-4 Ice Shelf: up a ramp onto an icy shelf, then off the end of it.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 200],
    [0, 2, 232],
    [0, 2, 330],
    [0, 0, 335],
    [0, 0, 700],
  ];
  const path = makePath(pts);
  const W = 18;
  const rampLen = Math.hypot(32, 2);
  levels.push([
    'ice-shelf',
    level(4, 'Ice Shelf', 16, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: pts }],
      convoys: [{ id: 'main', path: 'road', rows: 14, lanesUsed: [0, 1, 2], startAt: START }],
      scenery: [
        // Ramp: a tilted slab whose top surface runs from the ground up to the shelf.
        {
          type: 'box',
          pos: [0, 1 - 0.5, 216],
          size: [W, 1, rampLen + 0.4],
          rot: [(-Math.atan2(2, 32) * 180) / Math.PI, 0, 0],
          lethal: true,
          color: SNOW,
        },
        { type: 'box', pos: [0, 1, 282.5], size: [W, 2, 101], lethal: true, color: SNOW },
      ],
      hazards: [{ type: 'ice', pos: [0, 2, 285], size: [W, 90] }],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 3-5 Twin Rotors: two wheels turning opposite ways with ice between them.
{
  const path = makePath(straight);
  levels.push([
    'twin-rotors',
    level(5, 'Twin Rotors', 16, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: straight }],
      convoys: [
        { id: 'main', path: 'road', rows: 20, lanesUsed: [0, 1, 2], startAt: START, wobble: 0.06 },
      ],
      scenery: [...pylons(path, 270), ...pylons(path, 410)],
      hazards: [rotor(path, 270, 24, 40), ice(path, 340, 80, 14), rotor(path, 410, -24, 100)],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 3-6 Whiteout: ice, a wheel and a snow wall, and then the road is closed. A second
// convoy runs on the next road over, behind a snow bank. Where the bank ends, change over.
{
  const SIDE_X = 12.5;
  const BANK_END = 335;
  const sidePts = [
    [SIDE_X, 0, -40],
    [SIDE_X, 0, 700],
  ];
  const path = makePath(straight);
  const side = makePath(sidePts);
  levels.push([
    'whiteout',
    level(6, 'Whiteout', 17, {
      player: { convoy: 'main', row: 1, lane: 2 },
      paths: [
        { id: 'road', width: 14, lanes: 3, points: straight },
        { id: 'side', width: 8, lanes: 2, points: sidePts },
      ],
      convoys: [
        // A short convoy: it reaches the closed road only after the bank has ended beside its last rows.
        { id: 'main', path: 'road', rows: 6, lanesUsed: [0, 1, 2], startAt: START },
        { id: 'side', path: 'side', rows: 16, lanesUsed: [0, 1], startAt: START, wobble: 0.05 },
      ],
      scenery: [
        // Only on the left: the right-hand one would stand in the side road.
        ...pylons(path, 250, [-1]),
        // The snow bank between the two roads: too tall to cross.
        {
          type: 'box',
          pos: [7.4, 3.75, (BANK_END - 60) / 2],
          size: [1.4, 7.5, BANK_END + 60],
          lethal: true,
          color: SNOW,
        },
        // Road closed.
        { type: 'box', pos: [0, 3, 425], size: [13, 6, 3], lethal: true, color: ROCK },
      ],
      hazards: [ice(path, 190, 70, 13), rotor(path, 250, 22, 70), wall(path, 320, 5, 12)],
      goal: { pos: side.at(GOAL_S).pos, width: 14, height: 12 },
    }),
  ]);
}

writeLevels('whiteout', levels);
