import { Quaternion, Vector3 } from 'three';
import { TUNING } from '../config/tuning';
import { GROUP, PhysicsWorld, RAPIER, groups } from '../physics/world';

const T = TUNING.truck;

/** Where a truck is trying to go. Spline paths with lanes arrive in M2. */
export interface TruckRoute {
  /** Point to steer at, `lookAhead` metres beyond the given position. */
  target(pos: Vector3, lookAhead: number, out: Vector3): Vector3;
}

/** A straight lane along +Z at a fixed X. */
export class StraightRoute implements TruckRoute {
  constructor(public readonly x: number) {}
  target(pos: Vector3, lookAhead: number, out: Vector3): Vector3 {
    return out.set(this.x, 0, pos.z + lookAhead);
  }
}

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

const UP = new Vector3(0, 1, 0);
const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();
const q1 = new Quaternion();

export class Truck {
  readonly body: RAPIER.RigidBody;
  readonly colliders: RAPIER.Collider[] = [];
  cruiseSpeed: number = T.cruiseSpeed;
  route: TruckRoute;
  /** True while the drive model is in control (upright and wheels on the ground). */
  driving = false;

  /** Transforms before and after the latest physics step, for render interpolation. */
  readonly prevPos = new Vector3();
  readonly prevRot = new Quaternion();
  readonly pos = new Vector3();
  readonly rot = new Quaternion();

  private readonly spawnPos = new Vector3();
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(
    private readonly physics: PhysicsWorld,
    spawn: Vector3,
    route: TruckRoute,
  ) {
    this.route = route;
    this.spawnPos.copy(spawn);
    const world = physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    const parts = [
      { ...TRUCK_SHAPE.trailer, mass: T.mass * T.trailerMassShare },
      { ...TRUCK_SHAPE.cab, mass: T.mass * (1 - T.trailerMassShare) },
    ];
    for (const p of parts) {
      const desc = RAPIER.ColliderDesc.cuboid(p.half.x, p.half.y, p.half.z)
        .setTranslation(p.centre.x, p.centre.y, p.centre.z)
        .setMass(p.mass)
        .setFriction(T.friction)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(T.restitution)
        .setCollisionGroups(groups(GROUP.TRUCK));
      this.colliders.push(world.createCollider(desc, this.body));
    }
    this.reset();
  }

  /** Back to the spawn point, already rolling at cruise speed. */
  reset(): void {
    const s = this.spawnPos;
    this.body.setTranslation({ x: s.x, y: s.y, z: s.z }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: this.cruiseSpeed }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.readTransform();
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);
  }

  /** Apply drive forces. Call once per fixed step before the physics step. */
  drive(dt: number): void {
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);

    const body = this.body;
    const rot = q1.copy(body.rotation() as Quaternion);
    const up = v1.copy(UP).applyQuaternion(rot);
    const upright = up.y > Math.cos(T.uprightLimit);
    this.driving = upright && this.wheelsOnGround(rot);
    if (!this.driving) return; // pure physics debris

    const mass = body.mass();
    const lin = body.linvel();
    const fwd = v1.set(0, 0, 1).applyQuaternion(rot);
    fwd.y = 0;
    fwd.normalize();
    const right = v2.set(fwd.z, 0, -fwd.x);

    // Forward: accelerate toward cruise speed.
    const vF = lin.x * fwd.x + lin.z * fwd.z;
    const maxDv = T.accel * dt;
    const dvF = Math.min(Math.max(this.cruiseSpeed - vF, -maxDv), maxDv);
    // Lateral grip: cancel sideways sliding.
    const vR = lin.x * right.x + lin.z * right.z;
    const dvR = -vR * T.lateralGrip;
    body.applyImpulse(
      {
        x: (fwd.x * dvF + right.x * dvR) * mass,
        y: 0,
        z: (fwd.z * dvF + right.z * dvR) * mass,
      },
      true,
    );

    // Steering: yaw toward the look-ahead point on the route.
    const p = body.translation();
    const target = this.route.target(v3.set(p.x, p.y, p.z), T.lookAhead, v3);
    const toX = target.x - p.x;
    const toZ = target.z - p.z;
    // Signed heading error around +Y (positive = target is to the left).
    const err = Math.atan2(fwd.z * toX - fwd.x * toZ, fwd.x * toX + fwd.z * toZ);
    const wantYawRate = Math.min(Math.max(err * T.steerGain, -T.maxSteerRate), T.maxSteerRate);
    const ang = body.angvel();
    const yawInertia = (mass * (T.length * T.length + T.width * T.width)) / 12;
    body.applyTorqueImpulse(
      { x: 0, y: (wantYawRate - ang.y) * T.steerResponse * yawInertia, z: 0 },
      true,
    );
  }

  /** Read the post-step transform and enforce the speed clamp. */
  afterStep(): void {
    const lin = this.body.linvel();
    const speed = Math.hypot(lin.x, lin.y, lin.z);
    const max = TUNING.physics.maxTruckSpeed;
    if (speed > max) {
      const k = max / speed;
      this.body.setLinvel({ x: lin.x * k, y: lin.y * k, z: lin.z * k }, true);
    }
    this.readTransform();
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

  private readTransform(): void {
    const p = this.body.translation();
    const r = this.body.rotation();
    this.pos.set(p.x, p.y, p.z);
    this.rot.set(r.x, r.y, r.z, r.w);
  }

  private wheelsOnGround(rot: Quaternion): boolean {
    const p = this.body.translation();
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
