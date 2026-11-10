import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import type { Rng } from '../core/rng';
import { GROUP, PhysicsWorld, RAPIER, groups } from '../physics/world';
import type { Path } from './path';

const T = TUNING.truck;

/**
 * Truck geometry in body-local space. Origin is the centre of the base,
 * +Z is forward, the rear bumper is at z = -length / 2.
 */
export const TRUCK_SHAPE = (() => {
  const rear = -T.length / 2;
  const trailerCentreZ = rear + T.trailerLength / 2;
  const cabCentreZ = rear + T.trailerLength + T.cabGap + T.cabLength / 2;
  return {
    trailer: {
      half: new Vector3(T.width / 2, T.trailerRoof / 2, T.trailerLength / 2),
      centre: new Vector3(0, T.trailerRoof / 2, trailerCentreZ),
    },
    cab: {
      half: new Vector3(T.width / 2, T.cabRoof / 2, T.cabLength / 2),
      centre: new Vector3(0, T.cabRoof / 2, cabCentreZ),
    },
  };
})();

/** Where and how a truck is asked to drive. */
export interface TruckAssignment {
  convoy: string;
  row: number;
  lane: number;
  path: Path;
  laneOffset: number;
  /** +1 along the path, -1 against it. */
  dir: 1 | -1;
  /** Path distance of the spawn point. */
  startS: number;
  speed: number;
  speedVariance: number;
  wobble: number;
  /** 0 for the rear row .. 1 for the front row. */
  rowFraction: number;
  spawnDelay: number;
}

/** alive: normal body. wreck: exploded, still solid. gone: removed from play. */
export type TruckState = 'waiting' | 'alive' | 'wreck' | 'gone';

/** What the forward sensing ray needs to know about other trucks. */
export interface TruckLookup {
  byCollider(handle: number): Truck | undefined;
}

const UP = new Vector3(0, 1, 0);
const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const v4 = new Vector3();
const q1 = new Quaternion();
const YAW_INERTIA = (T.mass * (T.length * T.length + T.width * T.width)) / 12;

export class Truck {
  readonly body: RAPIER.RigidBody;
  readonly colliders: RAPIER.Collider[] = [];
  state: TruckState = 'alive';
  /** True while the drive model is in control (upright and on the ground). */
  driving = false;
  /** At least one corner is within reach of the ground (false while flying or stacked on trucks). */
  onGround = true;
  cruiseSpeed: number = T.cruiseSpeed;
  /** Progress along the path (m). */
  s = 0;

  /** Transforms before and after the latest physics step, for render interpolation. */
  readonly prevPos = new Vector3();
  readonly prevRot = new Quaternion();
  readonly pos = new Vector3();
  readonly rot = new Quaternion();

  private wobbleAmp = 0;
  private wobbleHz = 0;
  private wobblePhase = 0;
  private speedHz = 0;
  private speedPhase = 0;
  private speedAmp = 0;
  private panicLeft = 0;
  private panicSide = 0;
  /** Speed limit from a driving truck close ahead. */
  private followSpeed = Infinity;
  /** Closing fast on a slower truck ahead: brake hard. */
  private braking = false;
  private senseFlip = 1;
  private panicSwerve: number = T.panicSwerve;
  private boostLeft = 0;
  private boostFactor = 1;
  /** A spare truck stays out of play until an ability calls it in. */
  spare = false;
  private slotFree = false;
  private tippedTime = 0;
  private stuckTime = 0;
  private wreckLeft = 0;
  private friction = -1;
  private readonly preVel = new Vector3();
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(
    private readonly physics: PhysicsWorld,
    public readonly index: number,
    public assignment: TruckAssignment,
  ) {
    const world = physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false),
    );
    const parts = [
      { ...TRUCK_SHAPE.trailer, mass: T.mass * T.trailerMassShare },
      { ...TRUCK_SHAPE.cab, mass: T.mass * (1 - T.trailerMassShare) },
    ];
    for (const p of parts) {
      const desc = RAPIER.ColliderDesc.cuboid(p.half.x, p.half.y, p.half.z)
        .setTranslation(p.centre.x, p.centre.y, p.centre.z)
        .setMass(p.mass)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(T.restitution)
        .setCollisionGroups(groups(GROUP.TRUCK));
      this.colliders.push(world.createCollider(desc, this.body));
    }
  }

  get isSolid(): boolean {
    return this.state === 'alive' || this.state === 'wreck';
  }

  /** Back to the spawn point with fresh driver noise. Reuses the body (pooling). */
  reset(rng: Rng): void {
    const a = this.assignment;
    // Speed wanders around the convoy speed instead of being a fixed offset, so
    // drivers bunch up and spread out without the formation drifting apart.
    this.cruiseSpeed = a.speed;
    this.speedAmp = a.speedVariance * rng.range(0.5, 1);
    this.speedHz = rng.range(T.speedWanderHzMin, T.speedWanderHzMax);
    this.speedPhase = rng.range(0, Math.PI * 2);
    // Rear rows are sloppier than the lead rows, so skill at the front is rewarded.
    const calm = T.leadRowCalm + (1 - T.leadRowCalm) * (1 - a.rowFraction);
    this.wobbleAmp = a.wobble * calm * rng.range(0.5, 1);
    this.wobbleHz = rng.range(T.wobbleHzMin, T.wobbleHzMax);
    this.wobblePhase = rng.range(0, Math.PI * 2);
    this.panicLeft = 0;
    this.followSpeed = Infinity;
    this.braking = false;
    this.tippedTime = 0;
    this.stuckTime = 0;
    this.wreckLeft = 0;
    this.s = a.startS;

    const p = a.path.pointAt(a.startS, a.laneOffset, v1);
    const t = a.path.tangentAt(a.startS, v2).multiplyScalar(a.dir);
    const yaw = Math.atan2(t.x, t.z);
    q1.setFromAxisAngle(UP, yaw);
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setRotation({ x: q1.x, y: q1.y, z: q1.z, w: q1.w }, true);
    this.body.setLinvel({ x: t.x * this.cruiseSpeed, y: 0, z: t.z * this.cruiseSpeed }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.panicSwerve = T.panicSwerve;
    this.boostLeft = 0;
    this.slotFree = false;
    this.setState(this.spare ? 'gone' : a.spawnDelay > 0 ? 'waiting' : 'alive');
    this.setFriction(T.friction);
    this.driving = this.state === 'alive';
    this.onGround = true;
    this.readTransform();
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);
    this.preVel.set(t.x * this.cruiseSpeed, 0, t.z * this.cruiseSpeed);
  }

  /** Apply drive forces. Call once per fixed step before the physics step. */
  drive(dt: number, time: number, step: number, lookup: TruckLookup): void {
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);
    if (this.state === 'waiting' && time >= this.assignment.spawnDelay) this.setState('alive');
    if (!this.isSolid) return;

    const body = this.body;
    const rot = q1.copy(this.rot);
    const up = v1.copy(UP).applyQuaternion(rot);
    const upright = up.y > Math.cos(T.uprightLimit);
    this.onGround = this.wheelsOnGround(rot);
    this.driving = this.state === 'alive' && upright && this.onGround;
    this.setFriction(this.driving ? T.friction : T.debrisFriction);

    if (this.driving) {
      const a = this.assignment;
      const lin = body.linvel();
      const fwd = v1.set(0, 0, 1).applyQuaternion(rot);
      if ((step + this.index) % T.senseInterval === 0) this.sense(fwd, lookup);
      fwd.y = 0;
      fwd.normalize();
      const right = v2.set(fwd.z, 0, -fwd.x);

      // Forward: accelerate toward cruise speed (or the truck just ahead).
      if (this.boostLeft > 0) this.boostLeft -= dt;
      // A boosted driver stops minding the gap and leans on the truck ahead.
      const boosted = this.boostLeft > 0;
      const want = boosted
        ? this.wantedSpeed(time)
        : Math.min(this.wantedSpeed(time), this.followSpeed);
      const vF = lin.x * fwd.x + lin.z * fwd.z;
      const dvF = Math.min(
        Math.max(want - vF, -(this.braking && !boosted ? T.brakeAccel : T.accel) * dt),
        T.accel * dt,
      );
      // Lateral grip: cancel sideways sliding.
      const vR = lin.x * right.x + lin.z * right.z;
      const dvR = -vR * T.lateralGrip;
      body.applyImpulse(
        {
          x: (fwd.x * dvF + right.x * dvR) * T.mass,
          y: 0,
          z: (fwd.z * dvF + right.z * dvR) * T.mass,
        },
        true,
      );

      // Steering: yaw toward a look-ahead point on the lane, plus driver noise.
      this.s = a.path.project(this.pos, this.s);
      let offset = a.laneOffset;
      if (this.panicLeft > 0) {
        this.panicLeft -= dt;
        offset += this.panicSide * this.panicSwerve * a.dir;
        if (this.panicLeft <= 0) this.panicSwerve = T.panicSwerve;
      }
      const target = a.path.pointAt(this.s + T.lookAhead * a.dir, offset, v3);
      const toX = target.x - this.pos.x;
      const toZ = target.z - this.pos.z;
      // Signed heading error around +Y.
      let err = Math.atan2(fwd.z * toX - fwd.x * toZ, fwd.x * toX + fwd.z * toZ);
      err += this.wobbleAmp * Math.sin(time * this.wobbleHz * Math.PI * 2 + this.wobblePhase);
      const wantYaw = Math.min(Math.max(err * T.steerGain, -T.maxSteerRate), T.maxSteerRate);
      const ang = body.angvel();
      body.applyTorqueImpulse(
        { x: 0, y: (wantYaw - ang.y) * T.steerResponse * YAW_INERTIA, z: 0 },
        true,
      );
    }

    const lin = body.linvel();
    this.preVel.set(lin.x, lin.y, lin.z);
  }

  /** Convoy speed plus driver wander, nudged back toward the formation slot. */
  private wantedSpeed(time: number): number {
    const a = this.assignment;
    const wander = this.speedAmp * Math.sin(time * this.speedHz * Math.PI * 2 + this.speedPhase);
    const slotS = a.startS + a.dir * a.speed * Math.max(0, time - a.spawnDelay);
    const behind = (slotS - this.s) * a.dir;
    const limit = a.speedVariance * T.slotCatchUp;
    const catchUp = this.slotFree
      ? 0
      : Math.min(Math.max((behind * T.slotGain) / a.speed, -limit), limit);
    return a.speed * (1 + wander + catchUp) * (this.boostLeft > 0 ? this.boostFactor : 1);
  }

  /**
   * Read the post-step transform, clamp speeds and update timers.
   * Returns true if this truck should explode now.
   */
  afterStep(dt: number): boolean {
    if (!this.isSolid) return false;
    const body = this.body;
    const lin = body.linvel();
    const speed = Math.hypot(lin.x, lin.y, lin.z);
    const max = TUNING.physics.maxTruckSpeed;
    if (speed > max) {
      const k = max / speed;
      body.setLinvel({ x: lin.x * k, y: lin.y * k, z: lin.z * k }, true);
    }
    const ang = body.angvel();
    const spin = Math.hypot(ang.x, ang.y, ang.z);
    if (spin > T.maxAngularSpeed) {
      const k = T.maxAngularSpeed / spin;
      body.setAngvel({ x: ang.x * k, y: ang.y * k, z: ang.z * k }, true);
    }
    this.readTransform();

    if (this.state === 'wreck') {
      this.wreckLeft -= dt;
      if (this.wreckLeft <= 0) this.setState('gone');
      return false;
    }

    // Heavy impact: the step changed our velocity a lot.
    const dv = Math.hypot(lin.x - this.preVel.x, lin.y - this.preVel.y, lin.z - this.preVel.z);
    if (dv > T.explodeDeltaV) return true;

    // Pinned against something while trying to drive (not merely queueing behind a truck).
    if (this.driving && speed < T.stuckSpeed && this.followSpeed === Infinity) {
      this.stuckTime += dt;
      if (this.stuckTime >= T.stuckTime) return true;
    } else {
      this.stuckTime = 0;
    }

    // Lying on a side or the roof for too long.
    const upY = v1.copy(UP).applyQuaternion(this.rot).y;
    if (upY < T.tippedDot) {
      this.tippedTime += dt;
      if (this.tippedTime >= T.explodeUpsideDownTime) return true;
    } else {
      this.tippedTime = 0;
    }
    return false;
  }

  /** Become a wreck: still solid for a while, no longer driven. */
  explode(rng: Rng): void {
    if (this.state !== 'alive') return;
    this.setState('wreck');
    this.wreckLeft = T.wreckLifetime;
    this.driving = false;
    this.body.applyImpulse({ x: 0, y: T.wreckPop * T.mass, z: 0 }, true);
    this.body.applyTorqueImpulse(
      {
        x: rng.range(-1, 1) * T.blastSpin * YAW_INERTIA,
        y: rng.range(-1, 1) * T.blastSpin * YAW_INERTIA,
        z: rng.range(-1, 1) * T.blastSpin * YAW_INERTIA * 0.3,
      },
      true,
    );
  }

  /** Shove from an explosion at `origin`. */
  blast(origin: Vector3, rng: Rng): void {
    if (!this.isSolid) return;
    const com = this.body.worldCom();
    const d = v1.set(com.x - origin.x, com.y - origin.y, com.z - origin.z);
    const dist = d.length();
    if (dist >= T.explosionRadius || dist < 1e-3) return;
    const k = (1 - dist / T.explosionRadius) * T.blastSpeed * T.mass;
    d.multiplyScalar(1 / dist);
    d.y += T.blastUp;
    this.body.applyImpulse({ x: d.x * k, y: d.y * k, z: d.z * k }, true);
    const spin = (k / T.mass / T.blastSpeed) * T.blastSpin * YAW_INERTIA;
    this.body.applyTorqueImpulse(
      { x: rng.range(-1, 1) * spin, y: rng.range(-1, 1) * spin, z: rng.range(-1, 1) * spin * 0.3 },
      true,
    );
  }

  /** Swerve to one side of the lane for a while (flare). `side`: +1 or -1 in path terms. */
  avoid(side: number, seconds: number, swerve: number): void {
    if (!this.driving) return;
    this.panicLeft = seconds;
    this.panicSide = side;
    this.panicSwerve = swerve;
  }

  /** Change velocity by `dv` and add some yaw spin (kicked by the player's jump). */
  shove(dv: Vector3, spinY: number): void {
    if (!this.isSolid) return;
    this.body.applyImpulse({ x: dv.x * T.mass, y: dv.y * T.mass, z: dv.z * T.mass }, true);
    this.body.applyTorqueImpulse({ x: 0, y: spinY * YAW_INERTIA, z: 0 }, true);
  }

  /** Drive faster for a while (tailwind). */
  boost(factor: number, seconds: number): void {
    this.boostFactor = factor;
    this.boostLeft = seconds;
  }

  /** Bring a spare truck into play at a pose, already rolling along its path. */
  spawnAt(pos: Vector3, yaw: number, path: Path, s: number, laneOffset: number): void {
    const a = this.assignment;
    this.assignment = { ...a, path, dir: 1, laneOffset, startS: s };
    this.s = s;
    q1.setFromAxisAngle(UP, yaw);
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setRotation({ x: q1.x, y: q1.y, z: q1.z, w: q1.w }, true);
    const vx = Math.sin(yaw) * a.speed;
    const vz = Math.cos(yaw) * a.speed;
    this.body.setLinvel({ x: vx, y: 0, z: vz }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.setState('alive');
    this.tippedTime = 0;
    this.stuckTime = 0;
    this.readTransform();
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);
    this.preVel.set(vx, 0, vz);
    // A called-in truck has no formation slot to chase: it just cruises.
    this.slotFree = true;
  }

  /** This attempt's driver noise, for checking seeds. */
  get noiseSignature(): string {
    return [
      this.wobbleAmp,
      this.wobbleHz,
      this.wobblePhase,
      this.speedAmp,
      this.speedHz,
      this.speedPhase,
    ]
      .map((n) => n.toFixed(5))
      .join(',');
  }

  /** Remove from play (fell out of the world, left far behind). */
  despawn(): void {
    if (this.state !== 'gone') this.setState('gone');
  }

  /** World velocity of the truck's surface at a world-space point. */
  pointVelocity(point: Vector3, out: Vector3): Vector3 {
    const lin = this.body.linvel();
    const ang = this.body.angvel();
    const com = this.body.worldCom();
    const rx = point.x - com.x;
    const ry = point.y - com.y;
    const rz = point.z - com.z;
    return out.set(
      lin.x + ang.y * rz - ang.z * ry,
      lin.y + ang.z * rx - ang.x * rz,
      lin.z + ang.x * ry - ang.y * rx,
    );
  }

  private setState(state: TruckState): void {
    this.state = state;
    const solid = state === 'alive' || state === 'wreck';
    if (this.body.isEnabled() !== solid) this.body.setEnabled(solid);
  }

  private setFriction(value: number): void {
    if (value === this.friction) return;
    this.friction = value;
    for (const c of this.colliders) c.setFriction(value);
  }

  private readTransform(): void {
    const p = this.body.translation();
    const r = this.body.rotation();
    this.pos.set(p.x, p.y, p.z);
    this.rot.set(r.x, r.y, r.z, r.w);
  }

  /** Look ahead: follow a driving truck, panic at obstacles and wrecks. */
  private sense(fwd: Vector3, lookup: TruckLookup): void {
    // Alternate between the left and right side so partial overlaps are noticed too.
    this.senseFlip = -this.senseFlip;
    const o = v4
      .set(this.senseFlip * T.senseSide, T.senseHeight, T.length / 2 + 0.2)
      .applyQuaternion(this.rot)
      .add(this.pos);
    this.ray.origin.x = o.x;
    this.ray.origin.y = o.y;
    this.ray.origin.z = o.z;
    this.ray.dir.x = fwd.x;
    this.ray.dir.y = fwd.y;
    this.ray.dir.z = fwd.z;
    const hit = this.physics.world.castRay(
      this.ray,
      T.panicDistance,
      true,
      undefined,
      groups(GROUP.TRUCK, GROUP.TRUCK | GROUP.WORLD),
      undefined,
      this.body,
    );
    this.followSpeed = Infinity;
    this.braking = false;
    if (!hit) return;
    // On a bend the straight ray sweeps across neighbouring lanes; only react
    // to things that are actually in this truck's lane.
    const a = this.assignment;
    const hx = o.x + fwd.x * hit.timeOfImpact;
    const hz = o.z + fwd.z * hit.timeOfImpact;
    const at = v4.set(hx, 0, hz);
    const sHit = a.path.project(at, this.s + hit.timeOfImpact * a.dir);
    if (Math.abs(a.path.lateralAt(at, sHit) - a.laneOffset) > T.senseLaneHalfWidth) return;
    const other = lookup.byCollider(hit.collider.handle);
    if (other && other.driving) {
      // Keep a gap that shrinks with distance; brake hard if closing fast.
      const lin = other.body.linvel();
      const mine = this.body.linvel();
      const theirs = lin.x * fwd.x + lin.z * fwd.z;
      const gap = Math.max(0, hit.timeOfImpact - T.followDistance);
      this.followSpeed = Math.max(0, theirs + gap * T.followGain);
      this.braking = mine.x * fwd.x + mine.z * fwd.z - this.followSpeed > T.brakeMargin;
      return;
    }
    // Scenery, a wreck or a tumbling truck: these drivers notice far too late
    // to brake. Swerve a little and hope.
    if (this.panicLeft <= 0) {
      this.panicLeft = T.panicTime;
      this.panicSide = (this.index * 7 + Math.floor(this.s)) % 2 === 0 ? 1 : -1;
    }
  }

  private wheelsOnGround(rot: Quaternion): boolean {
    const p = this.pos;
    const hx = T.width / 2;
    const hz = T.length / 2;
    const filter = groups(GROUP.TRUCK, GROUP.WORLD);
    for (let i = 0; i < 4; i++) {
      const local = v3
        .set(i & 1 ? hx : -hx, T.groundRayLift, i & 2 ? hz : -hz)
        .applyQuaternion(rot);
      this.ray.origin.x = p.x + local.x;
      this.ray.origin.y = p.y + local.y;
      this.ray.origin.z = p.z + local.z;
      this.ray.dir.x = 0;
      this.ray.dir.y = -1;
      this.ray.dir.z = 0;
      const hit = this.physics.world.castRay(
        this.ray,
        T.groundRayLift + T.groundRayLength,
        true,
        undefined,
        filter,
      );
      if (hit) return true;
    }
    return false;
  }
}
