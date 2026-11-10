import { Vector3 } from 'three';
import { type AbilityId, type AbilityInfo, abilityInfo } from '../config/abilities';
import type { Sim } from '../core/sim';
import type { MoveInput } from '../player/movement';

/**
 * Base class for abilities. The manager calls the hooks; subclasses override
 * what they need. `dt` is simulation time; `real(dt)` converts it to real
 * seconds so timers do not stretch in slow motion.
 */
export abstract class Ability {
  readonly info: AbilityInfo;

  constructor(
    public readonly id: AbilityId,
    protected readonly sim: Sim,
  ) {
    this.info = abilityInfo(id)!;
  }

  get slot() {
    return this.info.slot;
  }

  get cost() {
    return this.info.cost;
  }

  /** 0..1 charge shown in the HUD bar. */
  get energy01(): number {
    return 1;
  }

  /** 0 = ready, 1 = just used. */
  get cooldown01(): number {
    return 0;
  }

  onEquip(): void {}
  onUnequip(): void {}
  /** New attempt. */
  reset(): void {}
  onPress(_input: MoveInput): void {}
  onHold(_dt: number, _input: MoveInput): void {}
  onRelease(): void {}
  /** Every step, held or not. */
  update(_dt: number, _input: MoveInput): void {}

  protected real(dt: number): number {
    return dt / this.sim.timeScale;
  }
}

/** A countdown in real seconds. */
export class Cooldown {
  left = 0;
  constructor(public readonly total: number) {}
  get ready(): boolean {
    return this.left <= 0;
  }
  get value01(): number {
    return this.total > 0 ? Math.max(0, this.left) / this.total : 0;
  }
  start(): void {
    this.left = this.total;
  }
  tick(realDt: number): void {
    if (this.left > 0) this.left -= realDt;
  }
  reset(): void {
    this.left = 0;
  }
}

/** A meter that drains while used and refills after a pause. */
export class Energy {
  value: number;
  private idle = 0;
  constructor(
    public readonly max: number,
    private readonly refillDelay: number,
    private readonly refillTime: number,
  ) {
    this.value = max;
  }
  get value01(): number {
    return this.value / this.max;
  }
  get empty(): boolean {
    return this.value <= 0;
  }
  drain(realDt: number): void {
    this.value = Math.max(0, this.value - realDt);
    this.idle = 0;
  }
  /** Call on steps where the ability is not draining. */
  rest(realDt: number): void {
    this.idle += realDt;
    if (this.idle >= this.refillDelay) {
      this.value = Math.min(this.max, this.value + (this.max / this.refillTime) * realDt);
    }
  }
  reset(): void {
    this.value = this.max;
    this.idle = 0;
  }
}

/** Unit vector the camera is looking along. */
export function lookDir(input: MoveInput, out: Vector3): Vector3 {
  const cp = Math.cos(input.pitch);
  return out.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp);
}
