import { TUNING } from '../config/tuning';
import type { Sim } from '../core/sim';
import { Ability, Cooldown } from './ability';

const A = TUNING.abilities.showtime;

/** Slow-motion spotlight: points earned while it lasts are doubled. */
export class Showtime extends Ability {
  private readonly cd = new Cooldown(A.cooldown);
  private left = 0;

  constructor(sim: Sim) {
    super('showtime', sim);
  }
  get cooldown01(): number {
    return this.cd.value01;
  }
  get energy01(): number {
    return this.left > 0 ? this.left / A.duration : 1;
  }
  reset(): void {
    this.cd.reset();
    this.stop();
  }
  onUnequip(): void {
    this.stop();
  }
  onPress(): void {
    if (!this.cd.ready) return;
    this.left = A.duration;
    this.cd.start();
  }
  update(dt: number): void {
    const realDt = this.real(dt);
    this.cd.tick(realDt);
    if (this.left <= 0) return;
    this.left -= realDt;
    if (this.left <= 0) return this.stop();
    this.sim.slowTime(A.timeScale);
    this.sim.cinematic = true;
    this.sim.score.multiplier = A.multiplier;
  }

  private stop(): void {
    this.left = 0;
    this.sim.cinematic = false;
    this.sim.score.multiplier = 1;
  }
}
