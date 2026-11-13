import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { MeltDef } from '../schema';
import type { Chase, Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;

/** Height of the melt's surface at time `t` (shared with tests). */
export function meltLevelAt(def: MeltDef, t: number): number {
  return Math.max(0, t - (def.delay ?? 0)) * def.rise;
}

/** Seconds from the start until the melt reaches the trucks. */
export function meltDeadline(def: MeltDef): number {
  return (def.delay ?? 0) + H.meltTruckHeight / def.rise;
}

/**
 * Molten metal flooding the whole floor. It rises steadily; when it is deep
 * enough it destroys every truck it touches, so the level has to be finished
 * before then. The HUD counts down.
 */
export class Melt implements Hazard {
  readonly parts: HazardPart[];
  private readonly body: RAPIER.RigidBody;
  private readonly surface: HazardPart;

  constructor(
    private readonly def: MeltDef,
    private readonly ctx: HazardContext,
  ) {
    const world = ctx.physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        H.meltSize / 2,
        H.meltDepth / 2,
        H.meltSize / 2,
      ).setCollisionGroups(groups(GROUP.HAZARD, GROUP.PLAYER)),
      this.body,
    );
    this.surface = {
      size: new Vector3(H.meltSize, H.meltDepth, H.meltSize),
      color: PALETTE.melt,
      glow: true,
      visible: true,
      prevPos: new Vector3(),
      prevRot: new Quaternion(),
      pos: new Vector3(),
      rot: new Quaternion(),
    };
    this.parts = [this.surface];
    this.reset();
  }

  reset(): void {
    this.place(0);
    this.body.setTranslation(this.surface.pos, true);
    this.surface.prevPos.copy(this.surface.pos);
  }

  update(dt: number): void {
    const level = meltLevelAt(this.def, this.ctx.time() + dt);
    this.body.setNextKinematicTranslation({
      x: this.ctx.player.pos.x,
      y: level - H.meltDepth / 2,
      z: this.ctx.player.pos.z,
    });
    if (level < H.meltTruckHeight) return;
    for (const t of this.ctx.trucks) {
      if (t.state !== 'alive' || t.assignment.float) continue;
      if (t.pos.y - level < H.meltTruckClear) this.ctx.wreck(t, true);
    }
  }

  afterStep(): void {
    this.surface.prevPos.copy(this.surface.pos);
    this.place(this.ctx.time());
  }

  chase(): Chase {
    const left = Math.max(0, meltDeadline(this.def) - this.ctx.time());
    return {
      label: 'MELT',
      gap: 0,
      text: `MELT ${left.toFixed(1)} s`,
      fill: 1 - Math.min(1, left / H.meltCountdown),
    };
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  /** The slab follows the player sideways so it always fills the view; only its height matters. */
  private place(t: number): void {
    const p = this.ctx.player.pos;
    this.surface.pos.set(p.x, meltLevelAt(this.def, t) - H.meltDepth / 2, p.z);
  }
}
