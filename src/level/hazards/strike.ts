import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../../config/tuning';
import { GROUP, RAPIER, groups } from '../../physics/world';
import { PALETTE } from '../../render/palette';
import type { Truck } from '../../trucks/truck';
import type { StrikeDef } from '../schema';
import type { Chase, Hazard, HazardContext, HazardPart } from './hazard';

const H = TUNING.hazards;
const PARKED = { x: 0, y: -1000, z: 0 };
/** Where the warning columns stand around a truck: [sideways, along] from its centre (m). */
const CORNERS: readonly (readonly [number, number])[] = [
  [-H.strikeMarkSide, -H.strikeMarkAlong],
  [H.strikeMarkSide, -H.strikeMarkAlong],
  [-H.strikeMarkSide, H.strikeMarkAlong],
  [H.strikeMarkSide, H.strikeMarkAlong],
];
const corner = new Vector3();

/**
 * Lightning. Every `period` seconds it picks the truck the player is on, marks
 * it with a flickering column of light for `warning` seconds, then hits it:
 * the truck is destroyed and anyone still on it dies. The answer is always
 * the same: get off the marked truck.
 */
export class Strike implements Hazard {
  readonly parts: HazardPart[];
  private readonly body: RAPIER.RigidBody;
  private readonly marks: HazardPart[];
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
    // Four thin columns around the marked truck: they frame it without blocking the view of someone on it.
    this.marks = CORNERS.map(() => part(H.strikeMarkWidth, PALETTE.strikeMark));
    this.bolt = part((def.radius ?? H.strikeRadius) * 1.4, PALETTE.strikeBolt);
    this.parts = [...this.marks, this.bolt];
    this.reset();
  }

  reset(): void {
    this.target = null;
    this.strikes = 0;
    this.boltLeft = 0;
    this.cycle = (this.def.phase ?? 0) * this.def.period;
    this.strikeIn = 0;
    this.body.setTranslation(PARKED, true);
    for (const m of this.marks) m.visible = false;
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
    // No blast wave: someone who got off in time is not thrown from the truck they fled to.
    if (this.target.isSolid) this.ctx.wreck(this.target, true);
    this.body.setNextKinematicTranslation({ x: this.at.x, y: H.strikeHeight / 2, z: this.at.z });
    this.boltLeft = H.strikeBoltTime;
    this.strikes++;
    this.target = null;
    this.cycle = 0;
    this.strikeIn = 0;
  }

  afterStep(): void {
    const t = this.ctx.time();
    this.bolt.prevPos.copy(this.bolt.pos);
    this.bolt.pos.set(this.at.x, H.strikeHeight / 2, this.at.z);
    this.bolt.visible = this.boltLeft > 0;
    // The marks flicker faster as the strike gets closer.
    const hz = this.strikeIn < this.def.warning / 2 ? H.strikeFlickerHz * 2 : H.strikeFlickerHz;
    const show = !!this.target && Math.floor(t * hz * 2) % 2 === 0;
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      if (this.target) {
        corner.set(CORNERS[i][0], 0, CORNERS[i][1]).applyQuaternion(this.target.rot);
        m.pos.set(this.at.x + corner.x, H.strikeHeight / 2, this.at.z + corner.z);
        // Marks ride with the truck: no smoothing needed between steps.
        m.prevPos.copy(m.pos);
      }
      m.visible = show;
    }
  }

  chase(): Chase | null {
    if (!this.target) return null;
    const left = Math.max(0, this.strikeIn);
    return {
      label: 'LIGHTNING',
      gap: 0,
      text: `LIGHTNING ${left.toFixed(1)} s`,
      fill: 1 - left / this.def.warning,
    };
  }

  dispose(): void {
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  /** Lightning hunts the truck the player is on (or was last on, if they are in the air). */
  private choose(): Truck | null {
    const p = this.ctx.player;
    const truck = p.groundTruck ?? p.lastTruck;
    return truck && truck.driving && !truck.assignment.float ? truck : null;
  }
}
