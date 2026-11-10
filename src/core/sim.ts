import { Euler, Quaternion, Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import { type Hazard, createHazard } from '../level/hazards';
import { TEST_LEVELS } from '../level/levels';
import { Goal } from '../level/goal';
import type { LevelDef } from '../level/schema';
import { GROUP, PhysicsWorld, RAPIER, groups } from '../physics/world';
import { PlayerController } from '../player/controller';
import { type Bonus, ScoreKeeper } from '../score/score';
import type { MoveInput } from '../player/movement';
import { TruckPool } from '../trucks/convoy';
import { TRUCK_SHAPE, Truck } from '../trucks/truck';
import { Rng } from './rng';

export interface SimOptions {
  /** Fixed seed for driver noise. Omit for a new seed every attempt. */
  seed?: number;
  /** Disable falling-off resets (layout testing). */
  god?: boolean;
  /** Defaults to the one-truck test level. */
  level?: LevelDef;
  /** Whether the first attempt on this Sim can earn the first-try bonus (default true). */
  firstTry?: boolean;
}

export type SimEvent =
  | { type: 'explosion'; pos: Vector3 }
  | { type: 'bonus'; bonus: Bonus }
  | { type: 'failed'; reason: FailReason }
  | { type: 'won'; time: number };

export type SimState = 'playing' | 'won' | 'failed';
export type FailReason = 'ground' | 'scenery' | 'fell';

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
  stepCount = 0;
  readonly goal: Goal;
  readonly hazards: Hazard[] = [];
  readonly score: ScoreKeeper;
  /** This attempt is the first try of the session on this level. */
  firstTry: boolean;
  private wasGrounded = true;
  private takeoffTruck: Truck | null = null;
  state: SimState = 'playing';
  failReason: FailReason | null = null;
  /** Attempt timer in seconds; stops at the goal or on failing. */
  time = 0;
  /** Total failed attempts since this level was loaded. */
  falls = 0;
  /** Attempts started since this level was loaded (1 = first try). */
  attempts = 0;
  explosions = 0;
  private readonly fixedSeed: number | undefined;
  private readonly groundHandle: number | null;
  /** Scenery that blocks trucks but does not kill. */
  private readonly harmless = new Set<number>();
  /** Hazard colliders that shove trucks without blowing them up. */
  private readonly pushers = new Set<number>();
  private lethalTime = 0;
  /** World clock for trucks; keeps running after the attempt ends. */
  private clock = 0;

  constructor(options: SimOptions = {}) {
    this.level = options.level ?? TEST_LEVELS.single;
    this.fixedSeed = options.seed;
    this.rng = new Rng(options.seed ?? Rng.randomSeed());
    this.god = options.god ?? false;
    this.score = new ScoreKeeper(this.level.parTime);
    this.firstTry = options.firstTry ?? true;
    this.groundHandle = this.level.ground === 'none' ? null : this.physics.addTestGround().handle;
    const deg = Math.PI / 180;
    for (const s of this.level.scenery) {
      const r = s.rot ?? [0, 0, 0];
      const q = new Quaternion().setFromEuler(new Euler(r[0] * deg, r[1] * deg, r[2] * deg, 'XYZ'));
      const collider = this.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)
          .setTranslation(s.pos[0], s.pos[1], s.pos[2])
          .setRotation(q)
          .setFriction(1)
          .setCollisionGroups(groups(GROUP.WORLD)),
      );
      if (!s.lethal) this.harmless.add(collider.handle);
    }
    this.pool = new TruckPool(this.physics, this.level);
    this.goal = new Goal(this.level.goal, this.pool.paths.values());
    this.player = new PlayerController(this.physics, this.pool);
    const ctx = {
      physics: this.physics,
      trucks: this.pool.trucks,
      player: this.player,
      rng: () => this.rng,
      registerPusher: (handle: number) => void this.pushers.add(handle),
    };
    for (const h of this.level.hazards) this.hazards.push(createHazard(h, ctx));
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
    this.clock = 0;
    this.stepCount = 0;
    this.state = 'playing';
    this.failReason = null;
    this.lethalTime = 0;
    this.explosions = 0;
    if (this.attempts > 0) this.firstTry = false;
    this.attempts++;
    this.score.reset();
    this.wasGrounded = true;
    this.takeoffTruck = null;
    this.events.length = 0;
    this.pool.reset(this.rng);
    for (const h of this.hazards) h.reset();
    const p = this.level.player;
    const truck = this.pool.find(p.convoy, p.row, p.lane) ?? this.trucks[0];
    const feet = new Vector3(0, T.trailerRoof, TRUCK_SHAPE.trailer.centre.z)
      .applyQuaternion(truck.rot)
      .add(truck.pos);
    this.player.spawnOn(truck, feet);
  }

  /** Free the physics world when switching level. */
  dispose(): void {
    this.physics.dispose();
  }

  /**
   * One fixed step. Order: truck drive -> hazards -> physics -> trucks -> player -> triggers.
   * After failing, the world keeps running but the player is frozen; after
   * winning, the player keeps moving but can no longer fail.
   */
  step(input: MoveInput): void {
    const dt = TUNING.loop.fixedStep;
    this.events.length = 0;
    for (const t of this.trucks) t.drive(dt, this.clock, this.stepCount, this.pool);
    for (const h of this.hazards) h.update(dt);
    this.physics.step();
    for (const h of this.hazards) h.afterStep(dt);
    for (const t of this.trucks) {
      if (t.afterStep(dt) && !this.hitByPusher(t)) this.explode(t);
      else if (t.isSolid) this.maybeDespawn(t);
    }
    this.clock += dt;
    this.stepCount++;
    if (this.state === 'failed') return;

    this.player.step(dt, input);
    if (this.state !== 'playing') return;
    this.time += dt;
    this.trackStyle();

    // Goal first: reaching it wins even if the same step would have killed.
    if (this.goal.crossed(this.player.prevPos, this.player.pos)) {
      this.state = 'won';
      this.emit(this.score.finished(this.time, this.firstTry));
      this.events.push({ type: 'won', time: this.time });
      return;
    }
    const reason = this.god ? null : this.deathCheck(dt);
    if (reason) {
      this.state = 'failed';
      this.failReason = reason;
      this.falls++;
      // The player freezes here; make render interpolation hold still too.
      this.player.prevPos.copy(this.player.pos);
      this.events.push({ type: 'failed', reason });
    }
  }

  private emit(bonuses: Bonus[]): void {
    for (const bonus of bonuses) this.events.push({ type: 'bonus', bonus });
  }

  /** Turn what the player just did into scoring events. */
  private trackStyle(): void {
    const p = this.player;
    if (this.wasGrounded && !p.grounded) {
      const from = p.lastTruck;
      this.takeoffTruck = from;
      this.emit(this.score.leftGround(this.time, p.jumped, !!from && !from.onGround));
    } else if (!this.wasGrounded && p.grounded) {
      const from = this.takeoffTruck?.assignment;
      const to = p.groundTruck?.assignment;
      const skipped = from && to && from.convoy === to.convoy ? Math.abs(to.row - from.row) - 1 : 0;
      this.emit(this.score.landed(this.time, Math.max(0, skipped)));
    } else if (!p.grounded) {
      p.lethalNearby((handle) => {
        if (!this.harmless.has(handle)) this.score.passedClose();
      });
    }
    this.wasGrounded = p.grounded;
  }

  /**
   * Touching anything that is not a truck fails the attempt. The test capsule
   * is slightly smaller than the collision capsule, an overlap must last a
   * moment (grace), and while standing on or holding a truck the ground does
   * not count, so skimming it on a low wreck is survivable.
   */
  private deathCheck(dt: number): FailReason | null {
    if (this.player.pos.y < this.level.killY) return 'fell';
    let reason: FailReason | null = null;
    this.player.lethalOverlaps((handle) => {
      if (this.harmless.has(handle)) return;
      if (handle === this.groundHandle) {
        if (!this.player.onTruck) reason ??= 'ground';
      } else {
        reason = 'scenery';
      }
    });
    if (!reason) {
      this.lethalTime = 0;
      return null;
    }
    this.lethalTime += dt;
    return this.lethalTime > TUNING.player.lethalGrace ? reason : null;
  }

  private hitByPusher(truck: Truck): boolean {
    if (this.pushers.size === 0) return false;
    let hit = false;
    for (const c of truck.colliders) {
      this.physics.world.contactPairsWith(c, (other) => {
        if (this.pushers.has(other.handle)) hit = true;
      });
    }
    return hit;
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
