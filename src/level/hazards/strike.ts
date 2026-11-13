import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { Truck } from '../../trucks/truck';
import type { StrikeDef } from '../schema';
import type { Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const PARKED = { x: 0, y: -1000, z: 0 };
const d = new Vector3();

/**
 * Lightning. Every `period` seconds it picks a truck near the player, marks
 * it with a flickering column of light for `warning` seconds, then hits it:
 * the truck is destroyed and anyone still on it dies. The answer is always
 * the same: get off the marked truck.
 */
export class Strike implements Hazard {
  readonly parts: HazardPart[];
  private readonly body: RAPIER.RigidBody;
  private readonly mark: HazardPart;
  private readonly bolt: HazardPart;
  /** The truck that will be hit next, while the warning shows (tests and scripted players read this). */
  target: Truck | null = null;
  /** Seconds until the marked truck is hit. */
  strikeIn = 0;
  /** Strikes so far this attempt. */
  strikes = 0;
  private cycle = 0;
  private boltLeft = 0;
  private readonly at = new Vector3();

  constructor(
    private readonly def: StrikeDef,
    private readonly ctx: HazardContext,
  ) {
    const world = ctx.physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(
        H.strikeHeight / 2,
        def.radius ?? H.strikeRadius,
      ).setCollisionGroups(groups(GROUP.HAZARD, GROUP.PLAYER)),
      this.body,
    );
    const part = (width: number, color: number): HazardPart => ({
      size: new Vector3(width, H.strikeHeight, width),
      color,
      glow: true,
      visible: false,
      prevPos: new Vector3(),
      prevRot: new Quaternion(),
      pos: new Vector3(),
      rot: new Quaternion(),
    });
    this.mark = part(H.strikeMarkWidth, PALETTE.strikeMark);
    this.bolt = part((def.radius ?? H.strikeRadius) * 1.4, PALETTE.strikeBolt);
    this.parts = [this.mark, this.bolt];
    this.reset();
  }

  reset(): void {
    this.target = null;
    this.strikes = 0;
    this.boltLeft = 0;
    this.cycle = (this.def.phase ?? 0) * this.def.period;
    this.strikeIn = 0;
    this.body.setTranslation(PARKED, true);
    this.mark.visible = false;
    this.bolt.visible = false;
  }

  update(dt: number): void {
    const def = this.def;
    this.cycle += dt;
    if (this.boltLeft > 0) {
      this.boltLeft -= dt;
      if (this.boltLeft <= 0) this.body.setNextKinematicTranslation(PARKED);
    }
    if (!this.target && this.cycle >= def.period - def.warning) {
      this.target = this.choose();
      if (!this.target) this.cycle = 0;
    }
    if (!this.target) return;
    this.strikeIn = def.period - this.cycle;
    this.at.copy(this.target.pos);
    if (this.strikeIn > 0) return;
    // Hit: the truck goes, and the bolt is lethal where it stood for a moment.
    if (this.target.isSolid) this.ctx.wreck(this.target);
    this.body.setNextKinematicTranslation({ x: this.at.x, y: H.strikeHeight / 2, z: this.at.z });
    this.boltLeft = H.strikeBoltTime;
    this.strikes++;
    this.target = null;
    this.cycle = 0;
    this.strikeIn = 0;
  }

  afterStep(): void {
    const t = this.ctx.time();
    for (const p of this.parts) {
      p.prevPos.copy(p.pos);
      p.pos.set(this.at.x, H.strikeHeight / 2, this.at.z);
    }
    if (this.target) this.mark.prevPos.copy(this.mark.pos);
    // The mark flickers faster as the strike gets closer.
    const hz = this.strikeIn < this.def.warning / 2 ? H.strikeFlickerHz * 2 : H.strikeFlickerHz;
    this.mark.visible = !!this.target && Math.floor(t * hz * 2) % 2 === 0;
    this.bolt.visible = this.boltLeft > 0;
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  /** The player's own truck with probability `aim`, otherwise a random truck near the player. */
  private choose(): Truck | null {
    const p = this.ctx.player;
    const rng = this.ctx.rng();
    const own = p.groundTruck;
    if (own && own.driving && !own.assignment.float && rng.next() < this.def.aim) return own;
    const near: Truck[] = [];
    for (const t of this.ctx.trucks) {
      if (!t.driving || t.assignment.float) continue;
      d.subVectors(t.pos, p.pos);
      const v = t.body.linvel();
      const speed = Math.hypot(v.x, v.z) || 1;
      const along = (d.x * v.x + d.z * v.z) / speed;
      const across = Math.abs((d.x * v.z - d.z * v.x) / speed);
      if (along >= -this.def.behind && along <= this.def.ahead && across < H.strikeAcross)
        near.push(t);
    }
    if (near.length === 0) return null;
    return near[Math.min(near.length - 1, Math.floor(rng.next() * near.length))];
  }
}
