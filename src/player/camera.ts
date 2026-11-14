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
  private shake = 0;
  private shakeClock = 0;
  /** Setting: camera shake on/off. */
  shakeEnabled = true;

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

  /** An explosion went off `distance` metres away. */
  onExplosion(distance: number): void {
    const k = 1 - distance / C.shakeRadius;
    if (k > 0) this.shake = Math.max(this.shake, k * k);
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
    // Explosion shake: a quick fading wobble of the view, never of the aim itself.
    this.shake = Math.max(0, this.shake - dt / C.shakeTime);
    this.shakeClock += dt * C.shakeHz;
    const amp = this.shakeEnabled ? this.shake * C.shakeMaxAngle : 0;
    this.camera.rotation.set(
      input.pitch + Math.sin(this.shakeClock * 6.3) * amp,
      input.yaw + Math.sin(this.shakeClock * 4.1 + 1.7) * amp,
      this.roll + Math.sin(this.shakeClock * 5.3 + 0.4) * amp,
    );
  }
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}
