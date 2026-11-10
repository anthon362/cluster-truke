import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { SpinnerDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const UP = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/**
 * A horizontal arm turning around a post. It shoves trucks off line and is
 * lethal to the player. Kinematic, so nothing can stop or slow it.
 */
export class Spinner implements Hazard {
  readonly parts: HazardPart[] = [];
  private readonly arm: RAPIER.RigidBody;
  private readonly hub: RAPIER.Collider;
  private readonly armPart: HazardPart;
  private readonly startRot = new Quaternion();
  private readonly speed: number;

  constructor(
    def: SpinnerDef,
    private readonly ctx: HazardContext,
  ) {
    const world = ctx.physics.world;
    const pos = new Vector3(def.pos[0], def.pos[1], def.pos[2]);
    this.speed = def.speed * DEG;
    this.startRot.setFromAxisAngle(UP, (def.phase ?? 0) * DEG);

    this.arm = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(pos.x, pos.y, pos.z),
    );
    const armCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.length / 2, H.spinnerThickness / 2, H.spinnerThickness / 2)
        .setFriction(0.3)
        .setCollisionGroups(groups(GROUP.HAZARD)),
      this.arm,
    );
    ctx.registerPusher(armCollider.handle);
    this.armPart = {
      size: new Vector3(def.length, H.spinnerThickness, H.spinnerThickness),
      color: PALETTE.hazard,
      visible: true,
      prevPos: pos.clone(),
      prevRot: this.startRot.clone(),
      pos: pos.clone(),
      rot: this.startRot.clone(),
    };

    // The post it turns on: static and lethal like any scenery.
    const hubHeight = pos.y + H.spinnerThickness / 2;
    this.hub = world.createCollider(
      RAPIER.ColliderDesc.cuboid(H.spinnerHub / 2, hubHeight / 2, H.spinnerHub / 2)
        .setTranslation(pos.x, hubHeight / 2, pos.z)
        .setCollisionGroups(groups(GROUP.WORLD)),
    );
    const hubPos = new Vector3(pos.x, hubHeight / 2, pos.z);
    this.parts.push(this.armPart, {
      size: new Vector3(H.spinnerHub, hubHeight, H.spinnerHub),
      color: PALETTE.hazardDark,
      visible: true,
      prevPos: hubPos,
      prevRot: new Quaternion(),
      pos: hubPos,
      rot: new Quaternion(),
    });
    this.reset();
  }

  reset(): void {
    this.arm.setRotation(this.startRot, true);
    this.arm.setAngvel({ x: 0, y: this.speed, z: 0 }, true);
    this.armPart.rot.copy(this.startRot);
    this.armPart.prevRot.copy(this.startRot);
  }

  update(): void {
    // Constant spin; nothing to do per step.
  }

  afterStep(): void {
    this.armPart.prevRot.copy(this.armPart.rot);
    const r = this.arm.rotation();
    this.armPart.rot.set(r.x, r.y, r.z, r.w);
  }

  dispose(): void {
    const world = this.ctx.physics.world;
    world.removeRigidBody(this.arm);
    world.removeCollider(this.hub, false);
  }
}
