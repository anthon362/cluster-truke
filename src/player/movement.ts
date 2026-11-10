/**
 * Pure movement maths for the player, kept free of physics-engine calls so it
 * can be unit tested. All vectors here are horizontal (x, z).
 */
import { TUNING } from '../config/tuning';

const P = TUNING.player;

export interface Vec2 {
  x: number;
  z: number;
}

export interface MoveInput {
  /** -1..1, positive = forward. */
  moveF: number;
  /** -1..1, positive = right. */
  moveS: number;
  sprint: boolean;
  jumpHeld: boolean;
  /** True only on the step where jump went down. */
  jumpPressed: boolean;
  /** Camera yaw in radians (three.js convention: 0 looks down -Z). */
  yaw: number;
  pitch: number;
}

export const NO_INPUT: MoveInput = {
  moveF: 0,
  moveS: 0,
  sprint: false,
  jumpHeld: false,
  jumpPressed: false,
  yaw: 0,
  pitch: 0,
};

/**
 * Velocity the input asks for. Forward and strafe are applied independently
 * and deliberately NOT normalised, so diagonals are faster than straight ahead.
 */
export function wishVelocity(input: MoveInput, out: Vec2): Vec2 {
  const speed = input.sprint ? P.sprintSpeed : P.walkSpeed;
  const f = input.moveF * speed * (input.moveF < 0 ? P.strafeMultiplier : 1);
  const s = input.moveS * speed * P.strafeMultiplier;
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  out.x = -sin * f + cos * s;
  out.z = -cos * f - sin * s;
  return out;
}

/**
 * Ground movement. `rel` is velocity relative to the surface stood on and is
 * modified in place. Built-up speed above the input cap only bleeds off slowly.
 */
export function groundMove(rel: Vec2, wish: Vec2, dt: number): Vec2 {
  const wishSpeed = Math.hypot(wish.x, wish.z);
  const speed = Math.hypot(rel.x, rel.z);

  if (wishSpeed < 1e-6) {
    const drop = P.groundDecel * dt;
    const k = speed > drop ? (speed - drop) / speed : 0;
    rel.x *= k;
    rel.z *= k;
    return rel;
  }

  if (speed > wishSpeed) {
    // Overspeed: steer toward the wish direction but only shed speed gently.
    const newSpeed = Math.max(wishSpeed, speed - P.overspeedBleed * dt);
    const k = speed / wishSpeed;
    moveToward(rel, wish.x * k, wish.z * k, P.groundAccel * dt);
    const s = Math.hypot(rel.x, rel.z);
    if (s > 1e-6) {
      rel.x *= newSpeed / s;
      rel.z *= newSpeed / s;
    }
    return rel;
  }

  return moveToward(rel, wish.x, wish.z, P.groundAccel * dt);
}

/**
 * Air movement, Quake style: only adds speed along the wish direction, up to
 * the wish speed, and never removes speed. `rel` is velocity relative to the
 * frame the player jumped from, so inherited truck speed is left alone.
 */
export function airMove(rel: Vec2, wish: Vec2, dt: number): Vec2 {
  const wishSpeed = Math.hypot(wish.x, wish.z);
  if (wishSpeed < 1e-6) return rel;
  const dx = wish.x / wishSpeed;
  const dz = wish.z / wishSpeed;
  const along = rel.x * dx + rel.z * dz;
  const add = Math.min(P.airAccel * dt, wishSpeed - along);
  if (add <= 0) return rel;
  rel.x += dx * add;
  rel.z += dz * add;
  return rel;
}

function moveToward(v: Vec2, tx: number, tz: number, maxDelta: number): Vec2 {
  const dx = tx - v.x;
  const dz = tz - v.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < 1e-9) {
    v.x = tx;
    v.z = tz;
  } else {
    v.x += (dx / d) * maxDelta;
    v.z += (dz / d) * maxDelta;
  }
  return v;
}
