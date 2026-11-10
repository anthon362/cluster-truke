import { NO_INPUT, type MoveInput } from '../src/player/movement';
import type { Sim } from '../src/core/sim';

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
