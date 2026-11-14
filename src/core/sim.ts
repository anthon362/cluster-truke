import { Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import { singleTruckLevel } from '../level/testLevels';
import type { LevelDef } from '../level/types';
import { GROUP, PhysicsWorld, RAPIER, groups } from '../physics/world';
import { PlayerController } from '../player/controller';
import type { MoveInput } from '../player/movement';
import { TruckPool } from '../trucks/convoy';
import { TRUCK_SHAPE, Truck } from '../trucks/truck';
import { Rng } from './rng';

export interface SimOptions {
  /** Fixed seed for driver noise. Omit for a new seed every attempt. */
  seed?: number;
  /** Disable falling-off resets (layout testing). */
  god?: boolean;
  level?: LevelDef;
}

export type SimEvent = { type: 'explosion'; pos: Vector3 };

const T = TUNING.truck;
const tmp = new Vector3();

/**
 * The whole simulation with no rendering, so it runs identically in the
 * browser and in headless tests.
 */
export class Sim {
  readonly physics = new PhysicsWorld();
  readonly level: LevelDef;
  readonly pool: TruckPool;
  readonly player: PlayerController;
  readonly god: boolean;
  /** Things that happened this step, for effects and sound. Cleared every step. */
  readonly events: SimEvent[] = [];
  rng: Rng;
  time = 0;
  stepCount = 0;
  /** Counts resets caused by touching the ground / falling. */
  falls = 0;
  explosions = 0;
  private readonly fixedSeed: number | undefined;

  constructor(options: SimOptions = {}) {
    this.level = options.level ?? singleTruckLevel();
    this.fixedSeed = options.seed;
    this.rng = new Rng(options.seed ?? Rng.randomSeed());
    this.god = options.god ?? false;
    this.physics.addTestGround();
    for (const s of this.level.scenery) {
      this.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)
          .setTranslation(s.pos[0], s.pos[1], s.pos[2])
          .setFriction(1)
          .setCollisionGroups(groups(GROUP.WORLD)),
      );
    }
    this.pool = new TruckPool(this.physics, this.level);
    this.player = new PlayerController(this.physics, this.pool);
    this.reset();
  }

  get trucks(): Truck[] {
    return this.pool.trucks;
  }

  get seed(): number {
    return this.rng.seed;
  }

  /** New attempt. Bodies are reused; only driver noise gets a new seed. */
  reset(): void {
    this.rng = new Rng(this.fixedSeed ?? Rng.randomSeed());
    this.time = 0;
    this.stepCount = 0;
    this.events.length = 0;
    this.pool.reset(this.rng);
    const p = this.level.player;
    const truck = this.pool.find(p.convoy, p.row, p.lane) ?? this.trucks[0];
    const feet = new Vector3(0, T.trailerRoof, TRUCK_SHAPE.trailer.centre.z)
      .applyQuaternion(truck.rot)
      .add(truck.pos);
    this.player.spawnOn(truck, feet);
  }

  /** One fixed step. Order: truck drive -> physics -> trucks -> player -> triggers. */
  step(input: MoveInput): void {
    const dt = TUNING.loop.fixedStep;
    this.events.length = 0;
    for (const t of this.trucks) t.drive(dt, this.time, this.stepCount, this.pool);
    this.physics.step();
    for (const t of this.trucks) {
      if (t.afterStep(dt)) this.explode(t);
      else if (t.isSolid) this.maybeDespawn(t);
    }
    this.player.step(dt, input);
    this.time += dt;
    this.stepCount++;

    const touchedGround = this.player.feetY < TUNING.testLevel.groundTouchY;
    if (!this.god && (touchedGround || this.player.pos.y < this.level.killY)) {
      this.falls++;
      this.reset();
    }
  }

  private explode(truck: Truck): void {
    const com = truck.body.worldCom();
    const origin = new Vector3(com.x, com.y, com.z);
    truck.explode(this.rng);
    for (const other of this.trucks) if (other !== truck) other.blast(origin, this.rng);
    this.player.blast(origin);
    this.explosions++;
    this.events.push({ type: 'explosion', pos: origin });
  }

  /** Drop trucks that fell out of the world, or debris left far behind the player. */
  private maybeDespawn(truck: Truck): void {
    if (truck.pos.y < this.level.killY) {
      truck.despawn();
      return;
    }
    if (truck.driving) return;
    const d = tmp.subVectors(this.player.pos, truck.pos);
    if (d.lengthSq() > T.despawnBehind * T.despawnBehind) {
      // "Behind" = the player has moved on along this truck's direction of travel.
      const a = truck.assignment;
      const ahead = a.path.tangentAt(truck.s, new Vector3()).multiplyScalar(a.dir);
      if (d.dot(ahead) > 0) truck.despawn();
    }
  }
}
