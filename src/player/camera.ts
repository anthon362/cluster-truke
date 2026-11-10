import { PerspectiveCamera, Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { PlayerController } from './controller';
import type { MoveInput } from './movement';

const C = TUNING.camera;
const eye = new Vector3();

/** First-person camera: FOV kick, landing dip, strafe roll. No head bob. */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  baseFov: number = C.fovDefault;
  private fovKick = 0;
  private dip = 0;
  private dipVel = 0;
  private roll = 0;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(C.fovDefault, aspect, C.near, C.far);
    this.camera.rotation.order = 'YXZ';
  }

  /** A landing just happened with this downward speed (m/s). */
  onLanding(impact: number): void {
    const k = Math.min(1, impact / C.landingDipFullSpeed);
    // Start a dip that reaches `landingDip * k` and recovers.
    this.dipVel = (-C.landingDip * k * 2) / C.landingDipTime;
  }

  update(player: PlayerController, input: MoveInput, alpha: number, dt: number): void {
    // Sprint FOV kick.
    const sprinting = input.sprint && input.moveF > 0;
    const kickTarget = sprinting ? C.sprintFovKick : 0;
    this.fovKick = approach(this.fovKick, kickTarget, (C.sprintFovKick / C.sprintFovTime) * dt);
    const fov = Math.min(
      C.fovMax + C.sprintFovKick,
      Math.max(C.fovMin, this.baseFov + this.fovKick),
    );
    if (fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Landing dip: a short damped bounce back to zero.
    this.dip += this.dipVel * dt;
    this.dipVel += ((C.landingDip * 2) / (C.landingDipTime * C.landingDipTime)) * dt;
    if (this.dip >= 0) {
      this.dip = 0;
      if (this.dipVel > 0) this.dipVel = 0;
    }

    // Slight roll into strafes.
    this.roll = approach(
      this.roll,
      -input.moveS * C.strafeRoll,
      (C.strafeRoll / C.strafeRollTime) * dt,
    );

    // Interpolate between the last two physics states; look is always real-time.
    eye.lerpVectors(player.prevPos, player.pos, alpha);
    this.camera.position.set(eye.x, eye.y + player.eyeOffset + this.dip, eye.z);
    this.camera.rotation.set(input.pitch, input.yaw, this.roll);
  }
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}
