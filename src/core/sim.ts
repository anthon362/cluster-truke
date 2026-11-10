import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import { PhysicsWorld } from '../physics/world';
import { PlayerController } from '../player/controller';
import type { MoveInput } from '../player/movement';
import { StraightRoute, TRUCK_SHAPE, Truck } from '../trucks/truck';
import { Rng } from './rng';

export interface SimOptions {
  seed?: number;
  /** Disable falling-off resets (layout testing). */
  god?: boolean;
}

/**
 * The whole simulation with no rendering, so it runs identically in the
 * browser and in headless tests. M1: one truck on flat ground, player on top.
 */
export class Sim {
  readonly physics = new PhysicsWorld();
  readonly trucks: Truck[] = [];
  readonly player: PlayerController;
  readonly rng: Rng;
  readonly god: boolean;
  time = 0;
  /** Counts resets caused by touching the ground / falling. */
  falls = 0;

  constructor(options: SimOptions = {}) {
    this.rng = new Rng(options.seed ?? Rng.randomSeed());
    this.god = options.god ?? false;
    this.physics.addTestGround();
    this.player = new PlayerController(this.physics);
    const truck = new Truck(this.physics, new Vector3(0, 0, 0), new StraightRoute(0));
    this.trucks.push(truck);
    this.player.registerTruck(truck);
    this.reset();
  }

  get seed(): number {
    return this.rng.seed;
  }

  /** Back to the start without rebuilding anything. */
  reset(): void {
    this.time = 0;
    for (const t of this.trucks) t.reset();
    const truck = this.trucks[0];
    const c = TRUCK_SHAPE.trailer.centre;
    this.player.spawnOn(
      truck,
      new Vector3(truck.pos.x + c.x, truck.pos.y + TUNING.truck.trailerRoof, truck.pos.z + c.z),
    );
  }

  /** One fixed step. Order: truck drive -> physics -> player -> triggers. */
  step(input: MoveInput): void {
    const dt = TUNING.loop.fixedStep;
    for (const t of this.trucks) t.drive(dt);
    this.physics.step();
    for (const t of this.trucks) t.afterStep();
    this.player.step(dt, input);
    this.time += dt;

    const L = TUNING.testLevel;
    const touchedGround = this.player.feetY < L.groundTouchY;
    if (!this.god && (touchedGround || this.player.pos.y < L.killY)) {
      this.falls++;
      this.reset();
    }
  }
}
