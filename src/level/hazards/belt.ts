import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { PALETTE } from '../../render/palette';
import type { Truck } from '../../trucks/truck';
import type { BeltDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const tmp = new Vector3();

/**
 * A boost belt set into the road. Every truck that drives onto it speeds up
 * for a while and keeps the ground it gains. The rows cross it one after
 * another, so the gaps between them open up for a moment and close again.
 */
export class Belt implements Hazard {
  readonly parts: HazardPart[] = [];
  private readonly stripes: HazardPart[] = [];
  private readonly centre = new Vector3();
  private readonly over = new Set<Truck>();
  /** Trucks boosted this attempt (tests). */
  boosted = 0;

  constructor(
    private readonly def: BeltDef,
    private readonly ctx: HazardContext,
  ) {
    this.centre.set(def.pos[0], def.pos[1], def.pos[2]);
    const rot = new Quaternion();
    // Chevron stripes that run along the belt, so its direction and pull read at a glance.
    for (let i = 0; i < H.beltStripes; i++) {
      const pos = new Vector3();
      this.stripes.push({
        size: new Vector3(def.size[0], H.plateThickness, H.beltStripeLength),
        color: PALETTE.belt,
        glow: true,
        visible: true,
        prevPos: pos.clone(),
        prevRot: rot,
        pos,
        rot,
      });
    }
    this.parts.push(...this.stripes);
    // Lit posts at the four corners, so the belt can be seen from a roof and over a flooded floor.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pos = new Vector3(
          def.pos[0] + sx * (def.size[0] / 2 + H.beltPostOut),
          def.pos[1] + H.beltPostHeight / 2,
          def.pos[2] + (sz * def.size[1]) / 2,
        );
        this.parts.push({
          size: new Vector3(0.3, H.beltPostHeight, 0.3),
          color: PALETTE.belt,
          glow: true,
          visible: true,
          prevPos: pos,
          prevRot: rot,
          pos,
          rot,
        });
      }
    }
    this.reset();
  }

  reset(): void {
    this.over.clear();
    this.boosted = 0;
    this.draw(0);
    for (const p of this.stripes) p.prevPos.copy(p.pos);
  }

  update(): void {
    const def = this.def;
    for (const t of this.ctx.trucks) {
      if (!t.driving || t.assignment.float) continue;
      tmp.subVectors(t.pos, this.centre);
      const on =
        Math.abs(tmp.x) <= def.size[0] / 2 && Math.abs(tmp.z) <= def.size[1] / 2 && tmp.y < 3;
      if (!on) {
        this.over.delete(t);
        continue;
      }
      if (this.over.has(t)) continue;
      this.over.add(t);
      t.surge(def.factor, def.seconds);
      this.boosted++;
    }
  }

  afterStep(): void {
    this.draw(this.ctx.time());
  }

  dispose(): void {}

  /** The stripes slide forward along the belt and wrap around. */
  private draw(t: number): void {
    const def = this.def;
    const length = def.size[1];
    const gap = length / this.stripes.length;
    for (let i = 0; i < this.stripes.length; i++) {
      const p = this.stripes[i];
      p.prevPos.copy(p.pos);
      const along = ((i * gap + t * H.beltStripeSpeed) % length) - length / 2;
      p.pos.set(this.centre.x, this.centre.y + H.plateThickness / 2, this.centre.z + along);
      if (Math.abs(p.pos.z - p.prevPos.z) > gap) p.prevPos.copy(p.pos);
    }
  }
}
