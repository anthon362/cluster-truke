import { NO_INPUT, type MoveInput } from '../src/player/movement';
import { Vector3 } from 'three';
import { TUNING } from '../src/config/tuning';
import type { Sim } from '../src/core/sim';
import { TRUCK_SHAPE } from '../src/trucks/truck';

const T = TUNING.truck;
const P = TUNING.player;

/** Truck forward is +Z, which is yaw = PI in camera convention. */
export const FACING_FORWARD = Math.PI;

export function input(partial: Partial<MoveInput> = {}): MoveInput {
  return { ...NO_INPUT, yaw: FACING_FORWARD, ...partial };
}

export function run(sim: Sim, steps: number, inp: MoveInput, each?: (i: number) => void): void {
  for (let i = 0; i < steps; i++) {
    sim.step(i === 0 ? inp : { ...inp, jumpPressed: false });
    each?.(i);
  }
}

/** Scripted player: sprint along the convoy, hopping from trailer to trailer. */
export function bot(sim: Sim, dir: 1 | -1): MoveInput {
  const p = sim.player;
  const here = p.groundTruck ?? p.lastTruck!;
  const a = here.assignment;
  const next = sim.pool.find(a.convoy, a.row + dir, a.lane);
  // Face along the truck being aimed for and correct sideways error with strafe,
  // which is steadier than swinging the view around.
  const aimAt = !p.grounded && next ? next : here;
  const fwd = new Vector3(0, 0, dir).applyQuaternion(aimAt.rot);
  const yaw = Math.atan2(-fwd.x, -fwd.z);
  const side = new Vector3(1, 0, 0).applyQuaternion(aimAt.rot);
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const centre = TRUCK_SHAPE.trailer.centre.clone().applyQuaternion(aimAt.rot).add(aimAt.pos);
  const truckVel = aimAt.body.linvel();
  const err = p.pos.clone().sub(centre).dot(side);
  const errVel = (p.vel.x - truckVel.x) * side.x + (p.vel.z - truckVel.z) * side.z;
  const steer = Math.max(-1, Math.min(1, -(1.2 * err + 0.35 * errVel)));
  const moveS = steer * side.dot(right);
  const local = p.pos.clone().sub(here.pos).applyQuaternion(here.rot.clone().invert());
  // Predict where a full jump and a tapped (low) jump would land on the next truck,
  // measured along the direction of travel, and take whichever hits its trailer.
  const fullAir = (2 * P.jumpVelocity) / P.gravity;
  const along = local.z * dir - T.rowSpacing;
  const full = along + p.relativeSpeed * fullAir;
  const low = along + p.relativeSpeed * fullAir * P.jumpCutMultiplier;
  const lo = dir === 1 ? -4.3 : -1.5;
  const hi = dir === 1 ? 1.2 : 4.0;
  const inWindow = (x: number) => x >= lo && x <= hi;
  // Coyote time lets the bot jump just after running off a trailer, like a player would.
  const ready = (p.grounded || p.timeSinceGrounded <= P.coyoteTime * 0.6) && !!next;
  const fullJump = ready && inWindow(full);
  // A low jump from the cab cannot clear the next trailer's roof.
  const onTrailer = local.y - P.height / 2 > (T.trailerRoof + T.cabRoof) / 2;
  const lowJump = ready && !fullJump && onTrailer && inWindow(low);
  // Falling short of a roof: hold jump to climb the truck face instead.
  const climb = !p.grounded && p.timeSinceGrounded > 0.4 && p.feetY < T.trailerRoof + 0.3;
  const rising = !p.grounded && p.vel.y > p.frameVel.y && !botLow;
  if (fullJump) botLow = false;
  if (lowJump) botLow = true;
  return {
    ...NO_INPUT,
    yaw,
    // Above sprint speed, holding forward in the air leaves no air control
    // (speed is only ever added along the wish direction), so let go and strafe.
    moveF: !p.grounded && p.relativeSpeed > P.sprintSpeed ? 0 : 1,
    moveS,
    sprint: true,
    jumpHeld: fullJump || rising || climb,
    jumpPressed: fullJump || lowJump,
  };
}
let botLow = false;
