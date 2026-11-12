import type { Quaternion, Vector3 } from 'three';
import type { Rng } from '../../core/rng';
import type { PhysicsWorld } from '../../physics/world';
import type { PlayerController } from '../../player/controller';
import type { Truck } from '../../trucks/truck';

/** What a hazard may touch. */
export interface HazardContext {
  physics: PhysicsWorld;
  trucks: readonly Truck[];
  player: PlayerController;
  rng(): Rng;
  /** Seconds since the attempt started (keeps running after it ends). */
  time(): number;
  /**
   * Mark a collider as a pusher: trucks hit by it are shoved around instead of
   * exploding from the impact.
   */
  registerPusher(colliderHandle: number): void;
}

/** One drawable box of a hazard, with the last two physics states for interpolation. */
export interface HazardPart {
  size: Vector3;
  color: number;
  /** Drawn unlit and unfogged, so it reads as a light source. */
  glow?: boolean;
  visible: boolean;
  prevPos: Vector3;
  prevRot: Quaternion;
  pos: Vector3;
  rot: Quaternion;
}

/**
 * Common hazard interface. Hazards are built once per level load and reset in
 * place between attempts, like trucks.
 */
export interface Hazard {
  readonly parts: readonly HazardPart[];
  /** Before the physics step. */
  update(dt: number): void;
  /** After the physics step: read transforms back for rendering. */
  afterStep(dt: number): void;
  reset(): void;
  dispose(): void;
}
