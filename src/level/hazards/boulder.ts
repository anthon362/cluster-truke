import { Quaternion, Vector3 } from 'three';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { Path } from '../../trucks/path';
import type { BoulderDef } from '../schema';
import type { Chase, Hazard, HazardContext, HazardPart } from './hazard';

const tmp = new Vector3();
const axis = new Vector3();
const spin = new Quaternion();

/** How far along its path the boulder is at time `t` (shared with the scripted test players). */
export function boulderDistanceAt(def: BoulderDef, t: number): number {
  return def.startAt + def.speed * t;
}

/**
 * A boulder rolling along the road behind the convoy. Nothing stops it: it
 * destroys every truck it reaches and is lethal to the player, so the only
 * way to live is to keep moving up the convoy ahead of it.
 */
export class Boulder implements Hazard {
  readonly parts: HazardPart[];
  private readonly body: RAPIER.RigidBody;
  private readonly path: Path;
  private readonly rock: HazardPart;
  private readonly centre = new Vector3();

  constructor(
    private readonly def: BoulderDef,
    private readonly ctx: HazardContext,
  ) {
    const path = ctx.path(def.path);
    if (!path) throw new Error(`Boulder uses unknown path "${def.path}"`);
    this.path = path;
    const world = ctx.physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(
      // Lethal to the player; trucks are handled by distance below, not by pushing.
      RAPIER.ColliderDesc.ball(def.radius).setCollisionGroups(groups(GROUP.HAZARD, GROUP.PLAYER)),
      this.body,
    );
    // Drawn as a tumbling block: the flat-shaded look has no smooth spheres.
    const side = def.radius * 1.62;
    this.rock = {
      size: new Vector3(side, side, side),
      color: PALETTE.boulder,
      visible: true,
      prevPos: new Vector3(),
      prevRot: new Quaternion(),
      pos: new Vector3(),
      rot: new Quaternion(),
    };
    this.parts = [this.rock];
    this.reset();
  }

  reset(): void {
    this.place(0);
    this.body.setTranslation(this.centre, true);
    this.rock.rot.identity();
    this.rock.prevPos.copy(this.rock.pos);
    this.rock.prevRot.copy(this.rock.rot);
  }

  update(dt: number): void {
    const t = this.ctx.time() + dt;
    this.place(t);
    this.body.setNextKinematicTranslation(this.centre);
    // Anything it reaches is crushed.
    const reach = this.def.radius + 2;
    for (const truck of this.ctx.trucks) {
      if (truck.state !== 'alive' || truck.assignment.float) continue;
      if (truck.pos.distanceToSquared(this.centre) < reach * reach) this.ctx.wreck(truck);
    }
  }

  afterStep(dt: number): void {
    this.rock.prevPos.copy(this.rock.pos);
    this.rock.prevRot.copy(this.rock.rot);
    this.rock.pos.copy(this.centre);
    // Roll: turn around the axis across the direction of travel.
    const dir = this.path.tangentAt(boulderDistanceAt(this.def, this.ctx.time()), tmp);
    axis.set(dir.z, 0, -dir.x);
    spin.setFromAxisAngle(axis, (this.def.speed * dt) / this.def.radius);
    this.rock.rot.premultiply(spin);
  }

  chase(): Chase {
    const gap = this.ctx.player.pos.distanceTo(this.centre) - this.def.radius;
    return { label: 'BOULDER', gap: Math.max(0, gap) };
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  private place(t: number): void {
    this.path.pointAt(boulderDistanceAt(this.def, t), 0, this.centre);
    this.centre.y += this.def.radius;
  }
}
