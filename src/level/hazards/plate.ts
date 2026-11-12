import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { PALETTE } from '../../render/palette';
import type { Truck } from '../../trucks/truck';
import type { PlateDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const UP = new Vector3(0, 1, 0);
const tmp = new Vector3();

/**
 * A blast plate set into the road. When a driving truck's middle crosses it,
 * the plate throws that truck into the air (and whoever is standing on it).
 * Every truck is launched the same way, so a convoy hops over in order.
 */
export class Plate implements Hazard {
  readonly parts: HazardPart[];
  private readonly centre = new Vector3();
  private readonly inverse: Quaternion;
  private readonly forward = new Vector3();
  private readonly halfX: number;
  private readonly halfZ: number;
  /** Trucks that are over the plate right now and have already been thrown. */
  private readonly thrown = new Set<Truck>();
  private readonly idle: HazardPart;
  private readonly hot: HazardPart;
  private glow = 0;
  /** Number of trucks launched this attempt (tests). */
  launched = 0;

  constructor(
    private readonly def: PlateDef,
    private readonly ctx: HazardContext,
  ) {
    this.centre.set(def.pos[0], def.pos[1], def.pos[2]);
    this.halfX = def.size[0] / 2;
    this.halfZ = def.size[1] / 2;
    const rot = new Quaternion().setFromAxisAngle(UP, ((def.yaw ?? 0) * Math.PI) / 180);
    this.inverse = rot.clone().invert();
    this.forward.set(0, 0, 1).applyQuaternion(rot);
    const pos = this.centre.clone().setY(this.centre.y + H.plateThickness / 2);
    const part = (color: number, glow: boolean): HazardPart => ({
      size: new Vector3(def.size[0], H.plateThickness, def.size[1]),
      color,
      glow,
      visible: true,
      prevPos: pos,
      prevRot: rot,
      pos,
      rot,
    });
    this.idle = part(PALETTE.plateIdle, false);
    this.hot = part(PALETTE.plate, true);
    this.parts = [this.idle, this.hot];
    this.reset();
  }

  reset(): void {
    this.thrown.clear();
    this.glow = 0;
    this.launched = 0;
    this.show();
  }

  update(dt: number): void {
    if (this.glow > 0) this.glow -= dt;
    for (const t of this.ctx.trucks) {
      if (!t.isSolid || t.assignment.float) continue;
      tmp.subVectors(t.pos, this.centre).applyQuaternion(this.inverse);
      const over = Math.abs(tmp.x) <= this.halfX && Math.abs(tmp.z) <= this.halfZ && tmp.y < 1;
      if (!over) {
        this.thrown.delete(t);
        continue;
      }
      if (this.thrown.has(t) || !t.driving) continue;
      this.thrown.add(t);
      // Straight up, with a little extra forward speed so the hop carries.
      t.shove(
        new Vector3(0, this.def.power, 0).addScaledVector(this.forward, this.def.power * H.plateForward),
        0,
      );
      this.glow = H.plateRearm;
      this.launched++;
    }
    this.show();
  }

  afterStep(): void {}
  dispose(): void {}

  private show(): void {
    this.hot.visible = this.glow > 0;
    this.idle.visible = this.glow <= 0;
  }
}
