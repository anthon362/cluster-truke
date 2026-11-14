import { Quaternion, Vector3 } from 'three';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { PendulumDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const UP = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/**
 * Where the weight's centre is at time `t`. A pure function of the level
 * data and the clock, shared with the scripted test players.
 */
export function pendulumAt(def: PendulumDef, t: number, out: Vector3): Vector3 {
  const angle = def.swing * DEG * Math.sin(2 * Math.PI * (t / def.period + (def.phase ?? 0)));
  const yaw = (def.yaw ?? 0) * DEG;
  const side = Math.sin(angle) * def.length;
  // The swing direction is +X turned by yaw around Y.
  return out.set(
    def.pos[0] + side * Math.cos(yaw),
    def.pos[1] - Math.cos(angle) * def.length,
    def.pos[2] - side * Math.sin(yaw),
  );
}

/**
 * A wrecking weight swinging across the road on a cable. It shoves trucks
 * aside (it cannot be stopped) and is lethal to the player.
 */
export class Pendulum implements Hazard {
  readonly parts: HazardPart[];
  private readonly body: RAPIER.RigidBody;
  private readonly centre = new Vector3();
  private readonly pivot = new Vector3();
  private readonly weight: HazardPart;
  private readonly cable: HazardPart;

  constructor(
    private readonly def: PendulumDef,
    private readonly ctx: HazardContext,
  ) {
    const world = ctx.physics.world;
    this.pivot.set(def.pos[0], def.pos[1], def.pos[2]);
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.size / 2, def.size / 2, def.size / 2)
        .setFriction(0.3)
        .setCollisionGroups(groups(GROUP.HAZARD)),
      this.body,
    );
    ctx.registerPusher(collider.handle);
    const part = (size: Vector3, color: number): HazardPart => ({
      size,
      color,
      visible: true,
      prevPos: new Vector3(),
      prevRot: new Quaternion(),
      pos: new Vector3(),
      rot: new Quaternion(),
    });
    this.weight = part(new Vector3(def.size, def.size, def.size), PALETTE.weight);
    // The cable is drawn only; it is thin enough not to matter.
    this.cable = part(new Vector3(0.18, def.length, 0.18), PALETTE.cable);
    this.parts = [this.weight, this.cable];
    this.reset();
  }

  reset(): void {
    this.place(0);
    this.body.setTranslation(this.centre, true);
    for (const p of this.parts) {
      p.prevPos.copy(p.pos);
      p.prevRot.copy(p.rot);
    }
  }

  update(dt: number): void {
    pendulumAt(this.def, this.ctx.time() + dt, this.centre);
    this.body.setNextKinematicTranslation(this.centre);
  }

  afterStep(): void {
    for (const p of this.parts) {
      p.prevPos.copy(p.pos);
      p.prevRot.copy(p.rot);
    }
    this.place(this.ctx.time());
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  private place(t: number): void {
    pendulumAt(this.def, t, this.centre);
    this.weight.pos.copy(this.centre);
    // Cable: from the pivot to the weight.
    const dir = new Vector3().subVectors(this.pivot, this.centre).normalize();
    this.cable.pos.copy(this.centre).add(this.pivot).multiplyScalar(0.5);
    this.cable.rot.setFromUnitVectors(UP, dir);
    this.weight.rot.copy(this.cable.rot);
  }
}
