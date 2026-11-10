import RAPIER from '@dimforge/rapier3d-compat';
import { TUNING } from '../config/tuning';

/** Collision group bits. */
export const GROUP = {
  TRUCK: 1 << 0,
  /** Lethal static geometry (ground, scenery). */
  WORLD: 1 << 1,
  /** Lethal moving things. */
  HAZARD: 1 << 2,
  /** Goal, lasers, fans, boost pads. */
  SENSOR: 1 << 3,
  /** Non-lethal chunks. */
  DEBRIS: 1 << 4,
  /** The player's query shape (never a solver body). */
  PLAYER: 1 << 5,
} as const;

const ALL = 0xffff;

/** Rapier interaction groups: (memberships << 16) | filter. */
export function groups(memberships: number, filter: number = ALL): number {
  return ((memberships & ALL) << 16) | (filter & ALL);
}

let initialised: Promise<void> | null = null;

export function initPhysics(): Promise<void> {
  initialised ??= RAPIER.init();
  return initialised;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -TUNING.physics.gravity, z: 0 });
    this.world.timestep = TUNING.loop.fixedStep;
  }

  /** Flat ground used until levels exist. Top surface at y = 0. */
  addTestGround(): RAPIER.Collider {
    const half = TUNING.physics.testGroundHalfSize;
    const desc = RAPIER.ColliderDesc.cuboid(half, 1, half)
      .setTranslation(0, -1, 0)
      .setFriction(1)
      .setCollisionGroups(groups(GROUP.WORLD));
    return this.world.createCollider(desc);
  }

  step(): void {
    this.world.step();
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }

  get activeBodyCount(): number {
    let n = 0;
    this.world.bodies.forEach((b) => {
      if (b.isDynamic() && !b.isSleeping()) n++;
    });
    return n;
  }
}

export { RAPIER };
