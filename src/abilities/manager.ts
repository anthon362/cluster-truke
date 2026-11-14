import type { AbilityId, AbilitySlot } from '../config/abilities';
import type { Sim } from '../core/sim';
import type { MoveInput } from '../player/movement';
import type { Ability } from './ability';
import { HangTime } from './hangTime';
import { KickOff } from './kickOff';
import { Lunge } from './lunge';
import { MagnetBoots } from './magnetBoots';
import { RoadFlare } from './roadFlare';
import { SecondWind } from './secondWind';
import { Showtime } from './showtime';
import { SlowLane } from './slowLane';
import { Slipstream } from './slipstream';
import { SpareRig } from './spareRig';
import { Tailwind } from './tailwind';
import { TowLine } from './towLine';

const FACTORY: Record<AbilityId, (sim: Sim) => Ability> = {
  secondWind: (s) => new SecondWind(s),
  lunge: (s) => new Lunge(s),
  kickOff: (s) => new KickOff(s),
  hangTime: (s) => new HangTime(s),
  slipstream: (s) => new Slipstream(s),
  towLine: (s) => new TowLine(s),
  slowLane: (s) => new SlowLane(s),
  roadFlare: (s) => new RoadFlare(s),
  magnetBoots: (s) => new MagnetBoots(s),
  spareRig: (s) => new SpareRig(s),
  tailwind: (s) => new Tailwind(s),
  showtime: (s) => new Showtime(s),
};

/**
 * Holds the one movement and one utility ability in play, routes input to
 * them, and exposes them to the HUD. Movement uses the primary button,
 * utility the secondary; both can be used at the same time.
 */
export class AbilityManager {
  movement: Ability | null = null;
  utility: Ability | null = null;
  private prevPrimary = false;
  private prevSecondary = false;

  constructor(private readonly sim: Sim) {}

  /** Put an ability in its slot (or clear the slot with null). */
  equip(slot: AbilitySlot, id: AbilityId | null): void {
    const current = slot === 'movement' ? this.movement : this.utility;
    if (current?.id === id) return;
    current?.onUnequip();
    let next: Ability | null = null;
    if (id) {
      next = FACTORY[id](this.sim);
      if (next.slot !== slot) throw new Error(`${id} is a ${next.slot} ability, not ${slot}`);
      next.onEquip();
    }
    if (slot === 'movement') this.movement = next;
    else this.utility = next;
  }

  /** The equipped ability with this id, if any (tests, rendering). */
  get<T extends Ability>(id: AbilityId): T | null {
    if (this.movement?.id === id) return this.movement as T;
    if (this.utility?.id === id) return this.utility as T;
    return null;
  }

  reset(): void {
    this.prevPrimary = false;
    this.prevSecondary = false;
    this.movement?.reset();
    this.utility?.reset();
  }

  step(dt: number, input: MoveInput): void {
    this.prevPrimary = this.route(this.movement, !!input.primaryHeld, this.prevPrimary, dt, input);
    this.prevSecondary = this.route(
      this.utility,
      !!input.secondaryHeld,
      this.prevSecondary,
      dt,
      input,
    );
  }

  private route(
    a: Ability | null,
    held: boolean,
    was: boolean,
    dt: number,
    input: MoveInput,
  ): boolean {
    if (!a) return held;
    if (held && !was) a.onPress(input);
    if (held) a.onHold(dt, input);
    if (!held && was) a.onRelease();
    a.update(dt, input);
    return held;
  }
}
