import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { PressDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;

export interface PressState {
  /** Height of the underside of the block. */
  bottom: number;
  /** About to come down: its lamp flashes. */
  warning: boolean;
}

/**
 * Where the press is at time `t`. One cycle: wait at the top (flashing for
 * the last `pressWarning` seconds), slam down, stay down for `down` seconds,
 * rise. A pure function of the level data and the clock.
 */
export function pressStateAt(def: PressDef, t: number, out: PressState): PressState {
  const at = (((t + (def.phase ?? 0) * def.period) % def.period) + def.period) % def.period;
  const wait = def.period - def.down - H.pressSlam - H.pressRise;
  const top = H.pressTop;
  const low = H.pressBottom;
  out.warning = at < wait && wait - at <= H.pressWarning;
  if (at < wait) out.bottom = top;
  else if (at < wait + H.pressSlam) out.bottom = top + ((low - top) * (at - wait)) / H.pressSlam;
  else if (at < wait + H.pressSlam + def.down) out.bottom = low;
  else out.bottom = low + ((top - low) * (at - wait - H.pressSlam - def.down)) / H.pressRise;
  return out;
}

/** Is the point under the press's block (inside its footprint)? */
export function underPress(def: PressDef, x: number, z: number, margin = 0): boolean {
  return (
    Math.abs(x - def.pos[0]) <= def.size[0] / 2 + margin &&
    Math.abs(z - def.pos[2]) <= def.size[1] / 2 + margin
  );
}

/**
 * A stamping press over one lane. The block is lethal to touch, and when it
 * comes down it destroys the truck underneath.
 */
export class Press implements Hazard {
  readonly parts: HazardPart[];
  private readonly body: RAPIER.RigidBody;
  private readonly state: PressState = { bottom: 0, warning: false };
  private readonly block: HazardPart;
  private readonly lamp: HazardPart;
  private readonly centre = new Vector3();
  /** Trucks crushed this attempt (tests). */
  crushed = 0;

  constructor(
    private readonly def: PressDef,
    private readonly ctx: HazardContext,
  ) {
    const world = ctx.physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.size[0] / 2, H.pressBlock / 2, def.size[1] / 2)
        // Trucks are crushed by rule below, not by being pushed into the road.
        .setCollisionGroups(groups(GROUP.HAZARD, GROUP.PLAYER)),
      this.body,
    );
    const part = (size: Vector3, color: number, glow: boolean): HazardPart => ({
      size,
      color,
      glow,
      visible: true,
      prevPos: new Vector3(),
      prevRot: new Quaternion(),
      pos: new Vector3(),
      rot: new Quaternion(),
    });
    this.block = part(new Vector3(def.size[0], H.pressBlock, def.size[1]), PALETTE.press, false);
    // A lamp strip on the leading face, toward oncoming traffic.
    this.lamp = part(new Vector3(def.size[0] * 0.8, 0.5, 0.3), PALETTE.pressLamp, true);
    this.parts = [this.block, this.lamp];
    this.reset();
  }

  reset(): void {
    this.crushed = 0;
    this.place(0);
    this.body.setTranslation(this.centre, true);
    this.show(0);
    for (const p of this.parts) p.prevPos.copy(p.pos);
  }

  update(dt: number): void {
    const def = this.def;
    this.place(this.ctx.time() + dt);
    this.body.setNextKinematicTranslation(this.centre);
    if (this.state.bottom >= H.pressCrushBelow) return;
    for (const t of this.ctx.trucks) {
      if (t.state !== 'alive' || t.assignment.float) continue;
      if (!underPress(def, t.pos.x, t.pos.z, H.pressReach)) continue;
      // No blast wave: the trucks in the lanes beside it are not thrown about.
      this.ctx.wreck(t, true);
      this.crushed++;
    }
  }

  afterStep(): void {
    for (const p of this.parts) p.prevPos.copy(p.pos);
    this.show(this.ctx.time());
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  private place(t: number): void {
    const s = pressStateAt(this.def, t, this.state);
    this.centre.set(this.def.pos[0], s.bottom + H.pressBlock / 2, this.def.pos[2]);
  }

  private show(t: number): void {
    const s = pressStateAt(this.def, t, this.state);
    this.block.pos.set(this.def.pos[0], s.bottom + H.pressBlock / 2, this.def.pos[2]);
    this.lamp.pos.set(
      this.def.pos[0],
      s.bottom + 0.5,
      this.def.pos[2] - this.def.size[1] / 2 - 0.16,
    );
    this.lamp.visible = s.warning && Math.floor(t * H.beamWarningHz * 2) % 2 === 0;
  }
}
