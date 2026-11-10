import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { RotorDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const DEG = Math.PI / 180;

/**
 * A spoked wheel standing across the road and turning like a windmill. The
 * spokes sweep over the truck roofs: lethal to the player, and trucks pass
 * straight through (it only matters to whoever is standing on them).
 */
export class Rotor implements Hazard {
  readonly parts: HazardPart[] = [];
  private readonly body: RAPIER.RigidBody;
  private readonly startRot = new Quaternion();
  private readonly axis = new Vector3();
  private readonly centre = new Vector3();
  private readonly speed: number;
  /** Each spoke's centre and orientation relative to the hub. */
  private readonly locals: { offset: Vector3; rot: Quaternion }[] = [];
  private readonly facing = new Quaternion();

  constructor(
    def: RotorDef,
    private readonly ctx: HazardContext,
  ) {
    const world = ctx.physics.world;
    this.centre.set(def.pos[0], def.pos[1], def.pos[2]);
    this.speed = def.speed * DEG;
    this.facing.setFromAxisAngle(UP, (def.yaw ?? 0) * DEG);
    this.axis.copy(FORWARD).applyQuaternion(this.facing);
    // Start orientation: facing, then turned by the phase around its own axis.
    this.startRot
      .setFromAxisAngle(this.axis, (def.phase ?? 0) * DEG)
      .multiply(this.facing);

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(def.pos[0], def.pos[1], def.pos[2]),
    );
    const size = new Vector3(H.rotorThickness, def.radius, H.rotorThickness);
    for (let i = 0; i < def.spokes; i++) {
      const rot = new Quaternion().setFromAxisAngle(FORWARD, (i / def.spokes) * Math.PI * 2);
      // A spoke is a box from the hub outward; local "down" is its length axis.
      const offset = new Vector3(0, -def.radius / 2, 0).applyQuaternion(rot);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
          .setTranslation(offset.x, offset.y, offset.z)
          .setRotation(rot)
          // Only the player's death test sees the spokes; trucks drive through.
          .setCollisionGroups(groups(GROUP.HAZARD, GROUP.PLAYER)),
        this.body,
      );
      this.locals.push({ offset, rot });
      this.parts.push({
        size,
        color: PALETTE.rotor,
        visible: true,
        prevPos: new Vector3(),
        prevRot: new Quaternion(),
        pos: new Vector3(),
        rot: new Quaternion(),
      });
    }
    // Hub, drawn only.
    this.parts.push({
      size: new Vector3(H.rotorHub, H.rotorHub, H.rotorHub),
      color: PALETTE.hazardDark,
      visible: true,
      prevPos: this.centre,
      prevRot: this.facing,
      pos: this.centre,
      rot: this.facing,
    });
    this.reset();
  }

  reset(): void {
    this.body.setRotation(this.startRot, true);
    this.body.setAngvel(
      { x: this.axis.x * this.speed, y: this.axis.y * this.speed, z: this.axis.z * this.speed },
      true,
    );
    this.place(this.startRot);
    for (let i = 0; i < this.locals.length; i++) {
      this.parts[i].prevPos.copy(this.parts[i].pos);
      this.parts[i].prevRot.copy(this.parts[i].rot);
    }
  }

  update(): void {}

  afterStep(): void {
    for (let i = 0; i < this.locals.length; i++) {
      this.parts[i].prevPos.copy(this.parts[i].pos);
      this.parts[i].prevRot.copy(this.parts[i].rot);
    }
    const r = this.body.rotation();
    this.place(new Quaternion(r.x, r.y, r.z, r.w));
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  private place(bodyRot: Quaternion): void {
    for (let i = 0; i < this.locals.length; i++) {
      const l = this.locals[i];
      this.parts[i].pos.copy(l.offset).applyQuaternion(bodyRot).add(this.centre);
      this.parts[i].rot.copy(bodyRot).multiply(l.rot);
    }
  }
}
