import { Quaternion, Vector3 } from 'three';
import { PALETTE } from '../../render/palette';
import type { IceDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const UP = new Vector3(0, 1, 0);
const tmp = new Vector3();

/** A slippery patch of road: trucks on it lose most of their sideways grip. */
export class Ice implements Hazard {
  readonly parts: HazardPart[];
  private readonly centre = new Vector3();
  private readonly inverse: Quaternion;
  private readonly halfX: number;
  private readonly halfZ: number;

  constructor(
    def: IceDef,
    private readonly ctx: HazardContext,
  ) {
    this.centre.set(def.pos[0], def.pos[1], def.pos[2]);
    this.halfX = def.size[0] / 2;
    this.halfZ = def.size[1] / 2;
    const rot = new Quaternion().setFromAxisAngle(UP, ((def.yaw ?? 0) * Math.PI) / 180);
    this.inverse = rot.clone().invert();
    // Drawn as a thin sheet just above the road.
    const pos = this.centre.clone().setY(this.centre.y + 0.03);
    this.parts = [
      {
        size: new Vector3(def.size[0], 0.04, def.size[1]),
        color: PALETTE.ice,
        visible: true,
        prevPos: pos,
        prevRot: rot,
        pos,
        rot,
      },
    ];
  }

  update(): void {
    for (const t of this.ctx.trucks) {
      if (!t.driving) continue;
      tmp.subVectors(t.pos, this.centre).applyQuaternion(this.inverse);
      if (Math.abs(tmp.x) <= this.halfX && Math.abs(tmp.z) <= this.halfZ) t.onIce();
    }
  }

  afterStep(): void {}
  reset(): void {}
  dispose(): void {}
}
