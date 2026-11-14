// Builds the DOCKYARD (world 1) level files. Run: node scripts/build-dockyard.mjs
import {
  CRANE,
  GOAL_S,
  LANE,
  ROW,
  START,
  container,
  gantry,
  goalAt,
  makePath,
  sideDecor,
  slab,
  wall,
  writeLevels,
} from './level-kit.mjs';

const PALETTE = { sky: '#f3d9b8', ground: '#17545c', fog: '#ecd3b4', fogFar: 460, road: '#565b63' };

function level(n, name, parTime, body) {
  return {
    id: `1-${n}`,
    name,
    world: 'dockyard',
    parTime,
    killY: -5,
    ground: 'none',
    palette: PALETTE,
    player: { convoy: 'main', row: 1, lane: 1 },
    hazards: [],
    ...body,
  };
}

const levels = [];

// 1-1 First Shift: a straight quay. Ride or run; nothing else to learn yet.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 600],
  ];
  const path = makePath(pts);
  levels.push([
    'first-shift',
    level(1, 'First Shift', 16, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: pts }],
      convoys: [
        { id: 'main', path: 'road', rows: 20, lanesUsed: [0, 1, 2], startAt: START, wobble: 0.07 },
      ],
      scenery: [
        slab(0, -60, 520, 26),
        ...sideDecor(path, [
          [80, -1, 1],
          [150, 1, 2],
          [163, 1, 1],
          [230, -1, 3],
          [300, 1, 1],
          [310, -1, 2],
          [380, 1, 3],
          [440, -1, 1],
        ]),
        ...gantry(path, 190),
        ...gantry(path, 370),
      ],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 1-2 Stacks: the quay narrows. First the right lane runs out of ground, then the left one,
// and the trucks in them drive straight into the water. The middle lane is the safe ride.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 640],
  ];
  const path = makePath(pts);
  const ROAD = '#565b63';
  const EDGE = LANE - 0.8; // the slab ends inside the outer lane: its trucks tip off, the middle lane has room
  const HALF = 13;
  const part = (x0, x1, z0, z1) => slab((x0 + x1) / 2, z0, z1, x1 - x0, 0, ROAD);
  levels.push([
    'stacks',
    level(2, 'Stacks', 16, {
      // The slabs are the road here, so the usual road ribbon is not drawn over the gaps.
      paths: [{ id: 'road', width: 14, lanes: 3, points: pts, visible: false }],
      convoys: [
        { id: 'main', path: 'road', rows: 14, lanesUsed: [1], startAt: START, wobble: 0.08 },
        { id: 'right', path: 'road', rows: 6, lanesUsed: [2], startAt: START + ROW * 3 },
        { id: 'left', path: 'road', rows: 6, lanesUsed: [0], startAt: START + ROW * 8 },
      ],
      scenery: [
        part(-HALF, HALF, -60, 250),
        part(-HALF, EDGE, 250, 370), // right lane gone
        part(-EDGE, HALF, 370, 460), // left lane gone
        part(-HALF, HALF, 460, 560),
        // Container stacks mark where each lane ends.
        container(path, 284, -9.5, 0, 3),
        container(path, 297, -9.5, 1, 2),
        container(path, 404, 9.5, 3, 3),
        container(path, 417, 9.5, 2, 2),
        ...sideDecor(
          path,
          [
            [100, -1, 2],
            [150, 1, 1],
            [200, -1, 1],
            [520, 1, 2],
            [540, -1, 3],
          ],
          10.5,
        ),
        ...gantry(path, 180, 30),
      ],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 1-3 Paper Wall: crate walls across the quay. Trucks plough through; do not arrive before them.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 200],
    [10, 0, 330],
    [10, 0, 640],
  ];
  const path = makePath(pts);
  levels.push([
    'paper-wall',
    level(3, 'Paper Wall', 16, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: pts }],
      convoys: [{ id: 'main', path: 'road', rows: 14, lanesUsed: [0, 1, 2], startAt: START }],
      scenery: [
        slab(5, -60, 540, 50),
        ...sideDecor(
          path,
          [
            [120, -1, 1],
            [200, 1, 2],
            [290, -1, 2],
            [340, 1, 1],
            [420, -1, 3],
            [470, 1, 1],
          ],
          12,
        ),
        ...gantry(path, 160, 36),
      ],
      hazards: [wall(path, 255), wall(path, 370), wall(path, 445, 6.25)],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 1-4 Rush Hour: you start in the lane with oncoming traffic. Change lanes in time.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 640],
  ];
  const path = makePath(pts);
  levels.push([
    'rush-hour',
    level(4, 'Rush Hour', 16, {
      player: { convoy: 'left', row: 1, lane: 0 },
      paths: [{ id: 'road', width: 14, lanes: 3, points: pts }],
      convoys: [
        { id: 'main', path: 'road', rows: 20, lanesUsed: [1, 2], startAt: START },
        { id: 'left', path: 'road', rows: 6, lanesUsed: [0], startAt: START },
        {
          id: 'oncoming',
          path: 'road',
          rows: 8,
          lanesUsed: [0],
          startAt: 380,
          reverse: true,
          speed: 16,
          rowSpacing: 17,
        },
      ],
      scenery: [
        slab(0, -60, 540, 28),
        ...sideDecor(
          path,
          [
            [70, 1, 1],
            [160, -1, 2],
            [240, 1, 3],
            [250, -1, 1],
            [340, 1, 1],
            [420, -1, 2],
            [490, 1, 2],
          ],
          11.5,
        ),
        ...gantry(path, 280),
      ],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

// 1-5 Drawbridge: the upper deck ends at an open bridge. Drop to the convoy on the lower quay.
{
  const LOW = -6;
  const deckPts = [
    [0, 0, -40],
    [0, 0, 400],
  ];
  const quayPts = [
    [15, LOW, -40],
    [15, LOW, 700],
  ];
  const quay = makePath(quayPts);
  const DECK_END = 262;
  const pillars = [];
  for (let z = -40; z < DECK_END; z += 50) {
    pillars.push({
      type: 'box',
      pos: [0, LOW + 2.4, z],
      size: [3, 4.8, 3],
      lethal: true,
      color: '#5c6168',
    });
  }
  levels.push([
    'drawbridge',
    level(5, 'Drawbridge', 16, {
      killY: -11,
      player: { convoy: 'main', row: 1, lane: 2 },
      paths: [
        { id: 'deck', width: 12, lanes: 3, points: deckPts, visible: false },
        { id: 'quay', width: 14, lanes: 3, points: quayPts },
      ],
      convoys: [
        { id: 'main', path: 'deck', rows: 10, lanesUsed: [0, 1, 2], startAt: START },
        {
          id: 'lower',
          path: 'quay',
          rows: 20,
          lanesUsed: [1, 2],
          startAt: START - 10,
          wobble: 0.06,
        },
      ],
      scenery: [
        slab(10, -60, 640, 60, LOW),
        slab(0, -60, DECK_END, 13, 0, '#7b8087', 1.2),
        ...pillars,
        // The raised bridge leaf at the end of the deck.
        {
          type: 'box',
          pos: [0, 3.2, DECK_END + 12],
          size: [13, 1.2, 26],
          rot: [-16, 0, 0],
          lethal: true,
          color: CRANE,
        },
        ...[
          [140, 13, 2],
          [153, 13, 1],
          [240, -25, 2],
          [370, 13, 3],
          [440, -25, 1],
        ].map(([s, off, st], i) => {
          const c = container(quay, s, off, i, st);
          return c;
        }),
      ],
      goal: { pos: quay.at(GOAL_S).pos, width: 16, height: 13 },
    }),
  ]);
}

// 1-6 Crane Day: sweeping crane arms clip the outer lanes, with a crate wall and a stack between them.
{
  const pts = [
    [0, 0, -40],
    [0, 0, 150],
    [-10, 0, 250],
    [-10, 0, 330],
    [6, 0, 420],
    [6, 0, 640],
  ];
  const path = makePath(pts);
  const ARM = 12.4;
  const arm = (s, side, speed, phase = 0) => ({
    type: 'spinner',
    pos: path.at(s, side * (LANE + 0.6 + ARM / 2), 2.2).pos,
    length: ARM,
    speed,
    phase,
  });
  levels.push([
    'crane-day',
    level(6, 'Crane Day', 17, {
      paths: [{ id: 'road', width: 14, lanes: 3, points: pts }],
      convoys: [
        { id: 'main', path: 'road', rows: 14, lanesUsed: [1], startAt: START, wobble: 0.08 },
        { id: 'right', path: 'road', rows: 6, lanesUsed: [2], startAt: START + ROW * 2 },
        { id: 'left', path: 'road', rows: 6, lanesUsed: [0], startAt: START + ROW * 8 },
      ],
      scenery: [
        slab(-2, -60, 560, 60),
        ...sideDecor(
          path,
          [
            [100, -1, 2],
            [150, 1, 1],
            [330, 1, 2],
            [390, -1, 1],
            [500, 1, 3],
          ],
          15,
        ),
        ...gantry(path, 130, 40),
      ],
      hazards: [arm(230, 1, 36), wall(path, 320), arm(410, -1, -36, 90)],
      goal: goalAt(path, GOAL_S),
    }),
  ]);
}

writeLevels('dockyard', levels);
