/** Level description. The JSON schema and validation for this arrive in M4. */
export type Vec3 = readonly [number, number, number];

export interface PathDef {
  id: string;
  width: number;
  lanes: number;
  points: readonly Vec3[];
}

export interface ConvoyDef {
  id: string;
  path: string;
  rows: number;
  lanesUsed: readonly number[];
  /** Path distance of the rear row's centre. */
  startAt: number;
  speed?: number;
  rowSpacing?: number;
  /** Per-truck cruise speed spread as a fraction (default from tuning). */
  speedVariance?: number;
  /** Steering wobble amplitude in radians. */
  wobble?: number;
  /** Drive against the path direction. */
  reverse?: boolean;
  /** Seconds before this convoy appears. */
  spawnDelay?: number;
}

export interface SceneryDef {
  type: 'box';
  pos: Vec3;
  size: Vec3;
  lethal: boolean;
}

export interface LevelDef {
  id: string;
  name: string;
  killY: number;
  player: { convoy: string; row: number; lane: number };
  paths: readonly PathDef[];
  convoys: readonly ConvoyDef[];
  scenery: readonly SceneryDef[];
}
