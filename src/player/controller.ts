import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import { GROUP, PhysicsWorld, RAPIER, groups } from '../physics/world';
import type { Truck, TruckLookup } from '../trucks/truck';
import { MoveInput, Vec2, airMove, groundMove, wishVelocity } from './movement';

const P = TUNING.player;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const DOWN = { x: 0, y: -1, z: 0 };

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpQ = new Quaternion();
const wish: Vec2 = { x: 0, z: 0 };
const rel2: Vec2 = { x: 0, z: 0 };

/**
 * Kinematic first-person character. It is not a rigid body: it only queries
 * truck colliders, so trucks never feel the player. Run it AFTER the physics
 * step so it uses the trucks' post-step transforms.
 */
export class PlayerController {
  /** Capsule centre. */
  readonly pos = new Vector3();
  readonly prevPos = new Vector3();
  /** World velocity. */
  readonly vel = new Vector3();
  /** Horizontal velocity relative to the surface stood on (valid while grounded). */
  readonly rel: Vec2 = { x: 0, z: 0 };
  /** Velocity of the reference frame the player is moving in (truck under/last under). */
  readonly frameVel = new Vector3();

  grounded = false;
  /** Truck currently stood on. */
  groundTruck: Truck | null = null;
  /** Last truck stood on (kept while airborne). */
  lastTruck: Truck | null = null;
  timeSinceGrounded = 0;
  /** Speed toward the surface at the most recent landing; consumed by the camera. */
  landingImpact = 0;

  /** Position in the ground truck's local space, used to ride it exactly. */
  private readonly localOnTruck = new Vector3();
  private jumpBufferLeft = 0;
  private jumpAvailable = false;
  private jumpRising = false;

  private readonly shape: RAPIER.Capsule;
  /** Slightly fatter capsule used to find truck faces within cling reach. */
  private readonly reachShape: RAPIER.Capsule;
  private readonly queryGroups = groups(GROUP.PLAYER, GROUP.TRUCK);
  /** Truck side or back currently within reach (airborne only). */
  private sideTruck: Truck | null = null;
  private readonly sideNormal = new Vector3();
  /** True while holding on to a truck side. */
  clinging = false;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly trucks: TruckLookup,
  ) {
    this.shape = new RAPIER.Capsule(P.height / 2 - P.radius, P.radius);
    this.reachShape = new RAPIER.Capsule(P.height / 2 - P.radius, P.radius + P.clingReach);
  }

  /** Put the player in the air at a position with a world velocity (tests, abilities). */
  placeInAir(pos: Vector3, vel: Vector3): void {
    this.pos.copy(pos);
    this.prevPos.copy(pos);
    this.vel.copy(vel);
    this.frameVel.set(0, 0, 0);
    this.grounded = false;
    this.groundTruck = null;
    this.sideTruck = null;
    this.clinging = false;
    this.jumpAvailable = false;
    this.jumpRising = false;
    this.jumpBufferLeft = 0;
    this.timeSinceGrounded = P.coyoteTime + 1;
  }

  /** Shove from an explosion at `origin`. Never lethal. */
  blast(origin: Vector3): void {
    const d = tmpA.subVectors(this.pos, origin);
    const dist = d.length();
    const radius = TUNING.truck.explosionRadius;
    if (dist >= radius || dist < 1e-3) return;
    const k = (1 - dist / radius) * P.blastSpeed;
    d.multiplyScalar(1 / dist);
    d.y += P.blastUp;
    this.vel.addScaledVector(d, k);
    if (this.grounded) {
      this.grounded = false;
      this.groundTruck = null;
      this.jumpAvailable = false;
      this.timeSinceGrounded = P.coyoteTime + 1;
    }
    this.jumpRising = false;
  }

  get feetY(): number {
    return this.pos.y - P.height / 2;
  }

  get eyeOffset(): number {
    return P.eyeHeight - P.height / 2;
  }

  /** Horizontal speed relative to the current reference frame. */
  get relativeSpeed(): number {
    return Math.hypot(this.vel.x - this.frameVel.x, this.vel.z - this.frameVel.z);
  }

  /** Place the player standing at `feet`, moving with `truck`. */
  spawnOn(truck: Truck, feet: Vector3): void {
    this.pos.set(feet.x, feet.y + P.height / 2 + P.skin, feet.z);
    this.prevPos.copy(this.pos);
    truck.pointVelocity(feet, this.frameVel);
    this.vel.copy(this.frameVel);
    this.rel.x = 0;
    this.rel.z = 0;
    this.grounded = true;
    this.groundTruck = truck;
    this.lastTruck = truck;
    this.timeSinceGrounded = 0;
    this.landingImpact = 0;
    this.jumpBufferLeft = 0;
    this.jumpAvailable = true;
    this.jumpRising = false;
    this.sideTruck = null;
    this.clinging = false;
    this.storeLocal();
  }

  step(dt: number, input: MoveInput): void {
    this.prevPos.copy(this.pos);

    if (input.jumpPressed) this.jumpBufferLeft = P.jumpBuffer;
    else this.jumpBufferLeft = Math.max(0, this.jumpBufferLeft - dt);

    wishVelocity(input, wish);
    let carried = false;

    // The truck under us may have despawned.
    if (this.grounded && !this.groundTruck?.isSolid) {
      this.grounded = false;
      this.groundTruck = null;
    }
    this.clinging = false;

    if (this.grounded && this.groundTruck) {
      // Velocity is kept relative to the truck, then rebuilt in world space.
      // Ride the truck exactly: follow where our spot on it went this step.
      const t = this.groundTruck;
      this.pos.copy(this.localOnTruck).applyQuaternion(t.rot).add(t.pos);
      carried = true;
      this.readFrameVelocity(t);
      groundMove(this.rel, wish, dt);
      this.vel.set(this.frameVel.x + this.rel.x, this.frameVel.y, this.frameVel.z + this.rel.z);
    } else {
      this.timeSinceGrounded += dt;
      rel2.x = this.vel.x - this.frameVel.x;
      rel2.z = this.vel.z - this.frameVel.z;
      // Clinging: holding jump against a truck side rides that truck and climbs it.
      const side = this.sideTruck?.isSolid ? this.sideTruck : null;
      if (side && input.jumpHeld) {
        this.clinging = true;
        this.lastTruck = side;
        // Switch reference frame to that truck without changing world velocity,
        // then let grip pull us along with it when no direction is held.
        this.readFrameVelocity(side);
        rel2.x = this.vel.x - this.frameVel.x;
        rel2.z = this.vel.z - this.frameVel.z;
        if (Math.hypot(wish.x, wish.z) < 1e-6) {
          const sp = Math.hypot(rel2.x, rel2.z);
          const k = sp > 1e-6 ? Math.max(0, sp - P.clingGrip * dt) / sp : 0;
          rel2.x *= k;
          rel2.z *= k;
        }
        const rise = this.vel.y - this.frameVel.y;
        if (rise < P.clingMaxRise) {
          const accel = rise < 0 ? P.clingCatchAccel : P.clingAccel;
          this.vel.y = this.frameVel.y + Math.min(P.clingMaxRise, rise + accel * dt);
        }
      }
      airMove(rel2, wish, dt);
      this.vel.x = this.frameVel.x + rel2.x;
      this.vel.z = this.frameVel.z + rel2.z;
      this.vel.y -= P.gravity * dt;
      // Variable jump height: letting go while rising cuts the jump short.
      if (this.jumpRising) {
        if (this.vel.y <= this.frameVel.y) this.jumpRising = false;
        else if (!input.jumpHeld) {
          this.vel.y = this.frameVel.y + (this.vel.y - this.frameVel.y) * P.jumpCutMultiplier;
          this.jumpRising = false;
        }
      }
    }

    // Jump: from the ground, or within coyote time after leaving an edge.
    const canJump = this.jumpAvailable && (this.grounded || this.timeSinceGrounded <= P.coyoteTime);
    if (this.jumpBufferLeft > 0 && canJump) {
      this.vel.y = this.frameVel.y + P.jumpVelocity;
      this.grounded = false;
      this.groundTruck = null;
      this.jumpAvailable = false;
      this.jumpRising = input.jumpHeld;
      if (!input.jumpHeld) {
        this.vel.y = this.frameVel.y + P.jumpVelocity * P.jumpCutMultiplier;
      }
      this.jumpBufferLeft = 0;
      this.timeSinceGrounded = P.coyoteTime + dt;
    } else if (this.jumpBufferLeft > 0 && !this.grounded && this.sideTruck?.isSolid) {
      // Tap jump on a truck side: kick up and away from it.
      this.readFrameVelocity(this.sideTruck);
      this.vel.y = this.frameVel.y + P.clingTapUp;
      this.vel.x += this.sideNormal.x * P.clingTapAway;
      this.vel.z += this.sideNormal.z * P.clingTapAway;
      this.jumpBufferLeft = 0;
      this.jumpRising = false;
    }

    // A carried player already has the truck's motion; only add their own.
    if (carried && this.grounded) tmpA.set(this.rel.x * dt, 0, this.rel.z * dt);
    else if (carried) tmpA.copy(this.vel).sub(this.frameVel).multiplyScalar(dt);
    else tmpA.copy(this.vel).multiplyScalar(dt);
    this.collideAndSlide(tmpA);
    this.depenetrate();
    this.probeGround(dt);
    this.findSide();
    this.storeLocal();
  }

  /** Look for a truck side or back within reach while airborne. */
  private findSide(): void {
    this.sideTruck = null;
    if (this.grounded) return;
    let best: number = P.clingReach;
    this.physics.world.intersectionsWithShape(
      this.pos,
      IDENTITY,
      this.reachShape,
      (collider) => {
        const c = collider.contactShape(this.shape, this.pos, IDENTITY, P.clingReach);
        if (c && c.distance < best && Math.abs(c.normal1.y) < P.sideNormalMaxY) {
          const truck = this.trucks.byCollider(collider.handle);
          if (truck) {
            best = c.distance;
            this.sideTruck = truck;
            this.sideNormal.set(c.normal1.x, 0, c.normal1.z).normalize();
          }
        }
        return true;
      },
      undefined,
      this.queryGroups,
    );
  }

  private storeLocal(): void {
    const t = this.groundTruck;
    if (!this.grounded || !t) return;
    this.localOnTruck.copy(this.pos).sub(t.pos).applyQuaternion(tmpQ.copy(t.rot).invert());
  }

  /** Frame velocity = truck surface velocity at the feet, clamped. */
  private readFrameVelocity(truck: Truck): void {
    tmpA.set(this.pos.x, this.feetY, this.pos.z);
    truck.pointVelocity(tmpA, this.frameVel);
    const max = TUNING.physics.maxTransferSpeed;
    if (this.frameVel.lengthSq() > max * max) this.frameVel.setLength(max);
  }

  /** Move by `move`, sliding along any truck surface that is hit. */
  private collideAndSlide(move: Vector3): void {
    const world = this.physics.world;
    for (let i = 0; i < P.slideIterations; i++) {
      if (move.lengthSq() < 1e-10) return;
      const hit = world.castShape(
        this.pos,
        IDENTITY,
        move,
        this.shape,
        0,
        1,
        false,
        undefined,
        this.queryGroups,
      );
      if (!hit) {
        this.pos.add(move);
        return;
      }
      const t = Math.max(0, hit.time_of_impact);
      this.pos.addScaledVector(move, t);
      const n = tmpB.set(hit.normal1.x, hit.normal1.y, hit.normal1.z);
      if (n.dot(move) > 0) n.negate();
      // Back off so the next cast starts clear of the surface.
      this.pos.addScaledVector(n, P.skin);
      // Remaining motion slides along the surface.
      move.multiplyScalar(1 - t);
      move.addScaledVector(n, -move.dot(n));
      // Lose the velocity component going into the surface, measured relative to it.
      const truck = this.trucks.byCollider(hit.collider.handle);
      const surfaceVel = truck ? truck.pointVelocity(this.pos, new Vector3()) : new Vector3();
      const into =
        (this.vel.x - surfaceVel.x) * n.x +
        (this.vel.y - surfaceVel.y) * n.y +
        (this.vel.z - surfaceVel.z) * n.z;
      if (into < 0) this.vel.addScaledVector(n, -into);
    }
  }

  /** Push out of any truck that moved into the capsule this step. */
  private depenetrate(): void {
    const world = this.physics.world;
    for (let i = 0; i < P.depenetrationIterations; i++) {
      let moved = false;
      world.intersectionsWithShape(
        this.pos,
        IDENTITY,
        this.shape,
        (collider) => {
          const c = collider.contactShape(this.shape, this.pos, IDENTITY, 0);
          if (c && c.distance < 0) {
            this.pos.x += c.normal1.x * -c.distance;
            this.pos.y += c.normal1.y * -c.distance;
            this.pos.z += c.normal1.z * -c.distance;
            moved = true;
          }
          return true;
        },
        undefined,
        this.queryGroups,
      );
      if (!moved) return;
    }
  }

  /** Decide whether the player is standing on a truck, and stick to it if so. */
  private probeGround(dt: number): void {
    const wasGrounded = this.grounded;
    const reach = wasGrounded ? P.groundSnap : P.groundProbe;
    const hit = this.physics.world.castShape(
      this.pos,
      IDENTITY,
      DOWN,
      this.shape,
      P.skin,
      reach,
      true,
      undefined,
      this.queryGroups,
    );
    const truck = hit ? this.trucks.byCollider(hit.collider.handle) : undefined;
    let standing = false;
    if (hit && truck && hit.normal1.y >= Math.cos(P.slideAngle)) {
      tmpA.set(this.pos.x, this.feetY - hit.time_of_impact, this.pos.z);
      const surfaceVel = truck.pointVelocity(tmpA, tmpB);
      const rise = this.vel.y - surfaceVel.y;
      if (rise <= P.maxLandingRise) {
        standing = true;
        this.pos.y -= hit.time_of_impact;
        if (!wasGrounded) {
          // Landing: keep horizontal speed, now expressed relative to the truck.
          this.landingImpact = Math.max(0, -rise);
          this.rel.x = this.vel.x - surfaceVel.x;
          this.rel.z = this.vel.z - surfaceVel.z;
        } else if (truck !== this.groundTruck) {
          this.rel.x = this.vel.x - surfaceVel.x;
          this.rel.z = this.vel.z - surfaceVel.z;
        }
        this.groundTruck = truck;
        this.lastTruck = truck;
        this.readFrameVelocity(truck);
        this.vel.y = this.frameVel.y;
        this.timeSinceGrounded = 0;
        this.jumpAvailable = true;
        this.jumpRising = false;
      }
    }
    if (!standing && wasGrounded) {
      // Walked off an edge: world velocity is kept as is (momentum inherited).
      this.timeSinceGrounded = dt;
      this.groundTruck = null;
    }
    this.grounded = standing;
  }
}
