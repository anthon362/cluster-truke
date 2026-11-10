import { TUNING } from '../config/tuning';

const S = TUNING.score;

export type BonusKind =
  | 'FINISH'
  | 'ACE'
  | 'SPEED'
  | 'AIR TIME'
  | 'ROW SKIP'
  | 'AIRBORNE HOP'
  | 'CLOSE CALL'
  | 'WORLD CLEAR';

export interface Bonus {
  kind: BonusKind;
  points: number;
}

/** Points for finishing in `time` on a level with `par`: full at 0.6 x par, nothing at 2 x par. */
export function speedBonus(time: number, par: number): number {
  const slow = par * S.speedZeroAtPar;
  const fast = par * S.speedMaxAtPar;
  const k = (slow - time) / (slow - fast);
  return Math.round(S.speedMax * Math.min(1, Math.max(0, k)));
}

/**
 * Tracks the bonuses of one attempt. Pure logic driven by events from the
 * simulation; nothing is banked here (points only count if the attempt is won).
 */
export class ScoreKeeper {
  readonly bonuses: Bonus[] = [];
  /** Applied to every bonus as it is earned (a cinematic ability doubles it). */
  multiplier = 1;
  private airTimeAwarded = 0;
  private airStart = -1;
  private nearMiss = false;

  constructor(private readonly parTime: number) {}

  reset(): void {
    this.bonuses.length = 0;
    this.multiplier = 1;
    this.airTimeAwarded = 0;
    this.airStart = -1;
    this.nearMiss = false;
  }

  get total(): number {
    let sum = 0;
    for (const b of this.bonuses) sum += b.points;
    return sum;
  }

  /** Totals per kind, in the order first earned. */
  breakdown(): Bonus[] {
    const map = new Map<BonusKind, number>();
    for (const b of this.bonuses) map.set(b.kind, (map.get(b.kind) ?? 0) + b.points);
    return [...map].map(([kind, points]) => ({ kind, points }));
  }

  /** The player left a truck. `truckAirborne`: that truck was itself off the ground. */
  leftGround(time: number, byJump: boolean, truckAirborne: boolean): Bonus[] {
    this.airStart = time;
    this.nearMiss = false;
    return byJump && truckAirborne ? [this.award('AIRBORNE HOP', S.airborneHop)] : [];
  }

  /** While airborne the player passed close to the ground or a hazard. */
  passedClose(): void {
    if (this.airStart >= 0) this.nearMiss = true;
  }

  /** The player landed on a truck, having skipped `rowsSkipped` rows since take-off. */
  landed(time: number, rowsSkipped: number): Bonus[] {
    const out: Bonus[] = [];
    if (this.airStart < 0) return out;
    const air = time - this.airStart;
    this.airStart = -1;
    if (air > S.airTimeThreshold) {
      const want = Math.round((air - S.airTimeThreshold) * S.airTimePerSecond * this.multiplier);
      // Farmable, so capped per attempt.
      const points = Math.min(want, S.airTimeCap - this.airTimeAwarded);
      if (points > 0) {
        this.airTimeAwarded += points;
        out.push(this.push('AIR TIME', points));
      }
    }
    if (rowsSkipped > 0) out.push(this.award('ROW SKIP', S.rowSkip * rowsSkipped));
    if (this.nearMiss) out.push(this.award('CLOSE CALL', S.closeCall));
    this.nearMiss = false;
    return out;
  }

  /** The attempt was won. */
  finished(time: number, firstTry: boolean): Bonus[] {
    const out = [this.award('FINISH', S.finish)];
    if (firstTry) out.push(this.award('ACE', S.ace));
    const speed = speedBonus(time, this.parTime);
    if (speed > 0) out.push(this.award('SPEED', speed));
    return out;
  }

  /** One-time bonus for finishing every level of a world. */
  worldClear(): Bonus {
    return this.push('WORLD CLEAR', S.worldClear);
  }

  private award(kind: BonusKind, base: number): Bonus {
    return this.push(kind, Math.round(base * this.multiplier));
  }

  private push(kind: BonusKind, points: number): Bonus {
    const b = { kind, points };
    this.bonuses.push(b);
    return b;
  }
}
