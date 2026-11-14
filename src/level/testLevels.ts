import type { LevelDef, SceneryDef } from './types';

const CURVY_ROAD = {
  id: 'road',
  width: 14,
  lanes: 3,
  points: [
    [0, 0, 0],
    [0, 0, 160],
    [45, 0, 320],
    [45, 0, 470],
    [-25, 0, 640],
    [-25, 0, 820],
    [10, 0, 1000],
    [10, 0, 1300],
  ],
} as const;

/** M2 test: 60 trucks, 3 wide, on a curved road. */
export function convoyTestLevel(withBlock: boolean): LevelDef {
  const scenery: SceneryDef[] = withBlock
    ? [{ type: 'box', pos: [45, 1.75, 400], size: [3.5, 3.5, 3.5], lethal: true }]
    : [];
  return {
    id: withBlock ? 'test-block' : 'test-convoy',
    name: withBlock ? 'Convoy vs block' : 'Convoy',
    killY: -5,
    player: { convoy: 'main', row: 1, lane: 1 },
    paths: [CURVY_ROAD],
    convoys: [{ id: 'main', path: 'road', rows: 20, lanesUsed: [0, 1, 2], startAt: 10 }],
    scenery,
  };
}

/** The M1 scene: one truck on a straight road. */
export function singleTruckLevel(): LevelDef {
  return {
    id: 'test-single',
    name: 'One truck',
    killY: -5,
    player: { convoy: 'main', row: 0, lane: 0 },
    paths: [
      {
        id: 'road',
        width: 14,
        lanes: 1,
        points: [
          [0, 0, 0],
          [0, 0, 1000],
        ],
      },
    ],
    convoys: [
      {
        id: 'main',
        path: 'road',
        rows: 1,
        lanesUsed: [0],
        startAt: 0,
        wobble: 0,
        speedVariance: 0,
      },
    ],
    scenery: [],
  };
}
