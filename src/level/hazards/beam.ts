import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { BeamDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const UP = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;

export interface BeamState {
  x: number;
  y: number;
  z: number;
  /** Radians around Y. */
  yaw: number;
  on: boolean;
  /** About to switch on. */
  warning: boolean;
}

/**
 * Where a beam is and whether it is lit at time `t`. A pure function of the
 * level data and the clock, so the game and the scripted test players agree
 * exactly on what a beam will do.
 */
export function beamStateAt(def: BeamDef, t: number, out: BeamState): BeamState {
  out.x = def.pos[0];
  out.y = def.pos[1];
  out.z = def.pos[2];
  if (def.sweep) {
    // 0 at the start, 1 at the far end, back to 0: a smooth there-and-back.
    const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / def.sweep.period + (def.sweep.phase ?? 0)));
    out.x += (def.sweep.to[0] - def.pos[0]) * k;
    out.y += (def.sweep.to[1] - def.pos[1]) * k;
    out.z += (def.sweep.to[2] - def.pos[2]) * k;
  }
  out.yaw = ((def.yaw ?? 0) + (def.spin ?? 0) * t) * DEG;
  out.on = true;
  out.warning = false;
  if (def.blink) {
    const cycle = def.blink.on + def.blink.off;
    const u = (((t + (def.blink.phase ?? 0)) % cycle) + cycle) % cycle;
    out.on = u < def.blink.on;
    out.warning = !out.on && cycle - u < H.beamWarning;
  }
  return out;
}

/** Half extents of a beam's box in its own frame (x along the beam when it lies down). */
export function beamHalfExtents(def: BeamDef): { x: number; y: number; z: number } {
  const t = (def.thickness ?? H.beamThickness) / 2;
  return def.vertical ? { x: t, y: def.length / 2, z: t } : { x: def.length / 2, y: t, z: t };
}

/**
 * A beam of light. Touching it while it is lit ends the run; trucks pass
 * straight through. It can lie across the road or stand upright, slide back
 * and forth, turn, and switch on and off (flashing a warning before it
 * comes back on).
 */
export class Beam implements Hazard {
  readonly parts: HazardPart[];
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly state: BeamState = { x: 0, y: 0, z: 0, yaw: 0, on: true, warning: false };
  private readonly rot = new Quaternion();
  private readonly lit: HazardPart;
  private readonly pilot: HazardPart;

  constructor(
    private readonly def: BeamDef,
    private readonly ctx: HazardContext,
  ) {
    const world = ctx.physics.world;
    const half = beamHalfExtents(def);
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
        // Only the player's death test sees a beam; trucks drive through light.
        .setCollisionGroups(groups(GROUP.HAZARD, GROUP.PLAYER)),
      this.body,
    );
    const size = new Vector3(half.x * 2, half.y * 2, half.z * 2);
    const part = (scale: number, color: number): HazardPart => ({
      size: def.vertical
        ? new Vector3(size.x * scale, size.y, size.z * scale)
        : new Vector3(size.x, size.y * scale, size.z * scale),
      color,
      glow: true,
      visible: true,
      prevPos: new Vector3(),
      prevRot: new Quaternion(),
      pos: new Vector3(),
      rot: new Quaternion(),
    });
    this.lit = part(1, PALETTE.beam);
    // A thin dim line that is always there, so a switched-off beam can still be seen coming.
    this.pilot = part(0.3, def.blink ? PALETTE.beamWarn : PALETTE.beamPilot);
    this.parts = [this.lit, this.pilot];
    this.reset();
  }

  reset(): void {
    this.place(0, true);
    for (const p of this.parts) {
      p.prevPos.copy(p.pos);
      p.prevRot.copy(p.rot);
    }
  }

  update(dt: number): void {
    // Kinematic bodies are told where to be at the end of the coming step.
    this.place(this.ctx.time() + dt, false);
  }

  afterStep(): void {
    const t = this.ctx.time();
    const s = this.state;
    for (const p of this.parts) {
      p.prevPos.copy(p.pos);
      p.prevRot.copy(p.rot);
      p.pos.set(s.x, s.y, s.z);
      p.rot.copy(this.rot);
    }
    this.lit.visible = s.on;
    // Off: the pilot line shows steadily, then flashes just before the beam returns.
    this.pilot.visible = !s.on && (!s.warning || Math.floor(t * H.beamWarningHz * 2) % 2 === 0);
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  private place(t: number, teleport: boolean): void {
    const s = beamStateAt(this.def, t, this.state);
    this.rot.setFromAxisAngle(UP, s.yaw);
    if (teleport) {
      this.body.setTranslation(s, true);
      this.body.setRotation(this.rot, true);
      for (const p of this.parts) {
        p.pos.set(s.x, s.y, s.z);
        p.rot.copy(this.rot);
      }
      this.lit.visible = s.on;
      this.pilot.visible = !s.on;
    } else {
      this.body.setNextKinematicTranslation(s);
      this.body.setNextKinematicRotation(this.rot);
    }
    if (this.collider.isEnabled() !== s.on) this.collider.setEnabled(s.on);
  }
}
