import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { Path } from '../../trucks/path';
import type { SlideDef } from '../schema';
import type { Chase, Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const UP = new Vector3(0, 1, 0);
const tangent = new Vector3();
const across = new Vector3();

/**
 * How far along its path the front of the slide is at time `t`. It moves at
 * `speed`, and from each [distance, speed] in `stages` onward at that stage's
 * speed. A pure function of the level data and the clock.
 */
export function slideDistanceAt(def: SlideDef, t: number): number {
  let s = def.startAt;
  let speed = def.speed;
  let left = t;
  for (const [from, next] of def.stages ?? []) {
    if (from <= s) {
      speed = next;
      continue;
    }
    const time = (from - s) / speed;
    if (time >= left) break;
    left -= time;
    s = from;
    speed = next;
  }
  return s + speed * left;
}

/**
 * An avalanche: a wall of snow coming down the road behind the convoy. It
 * buries every truck it reaches and is lethal to touch. It can change speed
 * at set points along the road. The HUD shows how far behind it is.
 */
export class Slide implements Hazard {
  readonly parts: HazardPart[] = [];
  private readonly body: RAPIER.RigidBody;
  private readonly path: Path;
  private readonly centre = new Vector3();
  private readonly rot = new Quaternion();
  private readonly wall: HazardPart;
  private readonly chunks: HazardPart[] = [];
  private front = 0;
  /** Trucks buried this attempt (tests). */
  buried = 0;

  constructor(
    private readonly def: SlideDef,
    private readonly ctx: HazardContext,
  ) {
    const path = ctx.path(def.path);
    if (!path) throw new Error(`Slide uses unknown path "${def.path}"`);
    this.path = path;
    const world = ctx.physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.width / 2, H.slideHeight / 2, H.slideDepth / 2)
        // Trucks are buried by rule below; nothing pushes them.
        .setCollisionGroups(groups(GROUP.HAZARD, GROUP.PLAYER)),
      this.body,
    );
    const part = (size: Vector3, color: number): HazardPart => ({
      size,
      color,
      visible: true,
      prevPos: new Vector3(),
      prevRot: new Quaternion(),
      pos: new Vector3(),
      rot: new Quaternion(),
    });
    this.wall = part(new Vector3(def.width, H.slideHeight, H.slideDepth), PALETTE.slide);
    this.parts.push(this.wall);
    // Blocks of snow tumbling at the front, so the wall reads as moving.
    for (let i = 0; i < H.slideChunks; i++) {
      const size = 2 + ((i * 0.618034) % 1) * 3.5;
      const chunk = part(new Vector3(size, size, size), i % 2 ? PALETTE.slide : PALETTE.slideShade);
      this.chunks.push(chunk);
      this.parts.push(chunk);
    }
    this.reset();
  }

  reset(): void {
    this.buried = 0;
    this.place(0);
    this.body.setTranslation(this.centre, true);
    this.body.setRotation(this.rot, true);
    this.draw(0);
    for (const p of this.parts) {
      p.prevPos.copy(p.pos);
      p.prevRot.copy(p.rot);
    }
  }

  update(dt: number): void {
    this.place(this.ctx.time() + dt);
    this.body.setNextKinematicTranslation(this.centre);
    this.body.setNextKinematicRotation(this.rot);
    for (const t of this.ctx.trucks) {
      if (t.state !== 'alive' || t.assignment.float) continue;
      // Behind the front, measured along the road the slide follows.
      tangent.subVectors(t.pos, this.centre);
      const ahead = tangent.dot(across.set(0, 0, 1).applyQuaternion(this.rot));
      const side = Math.abs(tangent.dot(across.set(1, 0, 0).applyQuaternion(this.rot)));
      if (
        ahead > H.slideDepth / 2 + H.slideReach ||
        ahead < -H.slideDepth ||
        side > this.def.width / 2
      ) {
        continue;
      }
      this.ctx.wreck(t, true);
      t.despawn();
      this.buried++;
    }
  }

  afterStep(): void {
    for (const p of this.parts) {
      p.prevPos.copy(p.pos);
      p.prevRot.copy(p.rot);
    }
    this.draw(this.ctx.time());
  }

  chase(): Chase {
    tangent.subVectors(this.ctx.player.pos, this.centre);
    const ahead = tangent.dot(across.set(0, 0, 1).applyQuaternion(this.rot));
    return { label: 'AVALANCHE', gap: Math.max(0, ahead - H.slideDepth / 2) };
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  /** The wall's centre sits half its depth behind the front. */
  private place(t: number): void {
    this.front = slideDistanceAt(this.def, t);
    const s = this.front - H.slideDepth / 2;
    this.path.pointAt(s, 0, this.centre);
    this.centre.y += H.slideHeight / 2 - 1;
    this.path.tangentAt(s, tangent);
    this.rot.setFromAxisAngle(UP, Math.atan2(tangent.x, tangent.z));
  }

  private draw(t: number): void {
    this.wall.pos.copy(this.centre);
    this.wall.rot.copy(this.rot);
    const w = this.def.width;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      const a = (i * 0.618034) % 1;
      const b = (i * 0.381966 + 0.3) % 1;
      // Each block rolls out ahead of the wall, sinks back into it, and starts again.
      const cycle = (t * (0.5 + b * 0.6) + a) % 1;
      across.set((a - 0.5) * w * 0.94, 0, H.slideDepth / 2 - 2 + cycle * H.slideChunkReach);
      across.applyQuaternion(this.rot);
      c.pos.copy(this.centre).add(across);
      c.pos.y = c.size.y * 0.35 + Math.abs(Math.sin(cycle * Math.PI * 2)) * (2 + b * 5);
      c.rot.setFromAxisAngle(tangent.set(1, 0, 0).applyQuaternion(this.rot), t * (3 + a * 4));
      // A block that started over jumps back: do not draw the jump.
      if (c.pos.distanceToSquared(c.prevPos) > 25) {
        c.prevPos.copy(c.pos);
        c.prevRot.copy(c.rot);
      }
    }
  }
}
