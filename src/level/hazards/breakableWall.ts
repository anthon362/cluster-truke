import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { BreakableWallDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const UP = new Vector3(0, 1, 0);
const tmp = new Vector3();

interface Brick {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  home: Vector3;
  part: HazardPart;
  knocked: boolean;
}

/**
 * A wall of bricks across the road. Intact it is solid and lethal to the
 * player. A truck arriving shatters it just before contact, so trucks plough
 * through; the flying bricks are harmless but can knock the player about.
 */
export class BreakableWall implements Hazard {
  readonly parts: HazardPart[] = [];
  private readonly bricks: Brick[] = [];
  private readonly centre = new Vector3();
  private readonly normal = new Vector3();
  private readonly rot = new Quaternion();
  private readonly halfWidth: number;
  private broken = false;
  private debrisLeft = 0;

  constructor(
    def: BreakableWallDef,
    private readonly ctx: HazardContext,
  ) {
    const yaw = ((def.yaw ?? 0) * Math.PI) / 180;
    this.rot.setFromAxisAngle(UP, yaw);
    this.normal.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.centre.set(def.pos[0], def.pos[1], def.pos[2]);
    this.halfWidth = def.width / 2;

    const cols = Math.max(1, Math.round(def.width / H.brickWidth));
    const rows = Math.max(1, Math.round(def.height / H.brickHeight));
    const bw = def.width / cols;
    const bh = def.height / rows;
    const size = new Vector3(bw, bh, H.brickDepth);
    const world = ctx.physics.world;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const home = new Vector3((c + 0.5) * bw - def.width / 2, (r + 0.5) * bh, 0)
          .applyQuaternion(this.rot)
          .add(this.centre);
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
        const collider = world.createCollider(
          RAPIER.ColliderDesc.cuboid(bw / 2 - 0.01, bh / 2 - 0.01, H.brickDepth / 2)
            .setMass(H.brickMass)
            .setFriction(0.6),
          body,
        );
        const part: HazardPart = {
          size,
          color: (r + c) % 2 === 0 ? PALETTE.brickA : PALETTE.brickB,
          visible: true,
          prevPos: home.clone(),
          prevRot: this.rot.clone(),
          pos: home.clone(),
          rot: this.rot.clone(),
        };
        this.bricks.push({ body, collider, home, part, knocked: false });
        this.parts.push(part);
      }
    }
    this.reset();
  }

  reset(): void {
    this.broken = false;
    this.debrisLeft = 0;
    for (const b of this.bricks) {
      b.body.setEnabled(true);
      b.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      b.body.setTranslation(b.home, true);
      b.body.setRotation(this.rot, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      // Intact bricks are a lethal obstacle.
      b.collider.setCollisionGroups(groups(GROUP.HAZARD));
      b.knocked = false;
      b.part.visible = true;
      b.part.pos.copy(b.home);
      b.part.rot.copy(this.rot);
      b.part.prevPos.copy(b.home);
      b.part.prevRot.copy(this.rot);
    }
  }

  update(dt: number): void {
    if (!this.broken) {
      const reach = TUNING.truck.length / 2 + H.wallTrigger;
      for (const t of this.ctx.trucks) {
        if (!t.isSolid) continue;
        tmp.subVectors(t.pos, this.centre);
        const along = tmp.dot(this.normal);
        const side = tmp.x * this.normal.z - tmp.z * this.normal.x;
        const v = t.body.linvel();
        // Reach grows with speed so fast trucks never touch an intact wall.
        const closing = Math.abs(v.x * this.normal.x + v.z * this.normal.z);
        if (
          Math.abs(along) < reach + closing * dt * 2 &&
          Math.abs(side) < this.halfWidth + TUNING.truck.width
        ) {
          this.shatter(t.pos, new Vector3(v.x, v.y, v.z));
          break;
        }
      }
      return;
    }
    if (this.debrisLeft <= 0) return;
    this.debrisLeft -= dt;
    if (this.debrisLeft <= 0) {
      for (const b of this.bricks) {
        b.body.setEnabled(false);
        b.part.visible = false;
      }
      return;
    }
    // Flying bricks knock the player lightly (never lethal).
    const p = this.ctx.player;
    const reach = TUNING.player.radius + H.debrisReach;
    for (const b of this.bricks) {
      if (b.knocked || b.part.pos.distanceToSquared(p.pos) > reach * reach) continue;
      const v = b.body.linvel();
      tmp.set(v.x - p.vel.x, v.y - p.vel.y, v.z - p.vel.z);
      if (tmp.lengthSq() > H.debrisKnockSpeed * H.debrisKnockSpeed) {
        p.push(tmp.multiplyScalar(H.debrisKnock));
        b.knocked = true;
      }
    }
  }

  afterStep(): void {
    for (const b of this.bricks) {
      b.part.prevPos.copy(b.part.pos);
      b.part.prevRot.copy(b.part.rot);
      if (!this.broken || !b.part.visible) continue;
      const t = b.body.translation();
      const r = b.body.rotation();
      b.part.pos.set(t.x, t.y, t.z);
      b.part.rot.set(r.x, r.y, r.z, r.w);
    }
  }

  dispose(): void {
    for (const b of this.bricks) this.ctx.physics.world.removeRigidBody(b.body);
  }

  private shatter(at: Vector3, truckVel: Vector3): void {
    this.broken = true;
    this.debrisLeft = H.debrisLife;
    const rng = this.ctx.rng();
    for (const b of this.bricks) {
      b.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      b.collider.setCollisionGroups(groups(GROUP.DEBRIS));
      const d = Math.hypot(b.home.x - at.x, b.home.z - at.z);
      const k = Math.max(0, 1 - d / (TUNING.truck.length / 2 + H.wallFlingRadius));
      b.body.setLinvel(
        {
          x: truckVel.x * H.wallFling * k + rng.range(-1, 1) * H.wallScatter * k,
          y: rng.range(0.2, 1) * H.wallScatter * k,
          z: truckVel.z * H.wallFling * k + rng.range(-1, 1) * H.wallScatter * k,
        },
        true,
      );
      b.body.setAngvel(
        { x: rng.range(-4, 4) * k, y: rng.range(-4, 4) * k, z: rng.range(-4, 4) * k },
        true,
      );
    }
  }
}
