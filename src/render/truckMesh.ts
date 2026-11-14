import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { TUNING } from '../config/tuning';
import { TRUCK_SHAPE, Truck, TruckState } from '../trucks/truck';
import { PALETTE, SCENE_DIMS as D } from './palette';

const T = TUNING.truck;

interface Part {
  mesh: InstancedMesh;
  /** Placement of each copy of this part within one truck. */
  locals: Matrix4[];
  /** Whether wrecks tint this part. */
  tint: boolean;
}

const ZERO = new Matrix4().makeScale(0, 0, 0);
const WHITE = new Color(0xffffff);
const pos = new Vector3();
const rot = new Quaternion();
const one = new Vector3(1, 1, 1);
const base = new Matrix4();
const m = new Matrix4();

/**
 * Draws every truck with a handful of InstancedMeshes (one per part type).
 * Tops and sides match the colliders exactly, so what you see is what you can stand on.
 */
export class TruckRenderer {
  private readonly parts: Part[] = [];
  private readonly lastState: (TruckState | null)[];
  private readonly wreckColor = new Color(PALETTE.wreck);
  /** Carried (floating) trucks are tinted so they read as different from the convoy. */
  private readonly carriedColor = new Color(PALETTE.carried);

  constructor(
    scene: Scene,
    private readonly count: number,
  ) {
    this.lastState = new Array(count).fill(null);
    const tr = TRUCK_SHAPE.trailer;
    const cab = TRUCK_SHAPE.cab;
    const clear = D.chassisClearance;
    const bodyH = T.trailerRoof - clear;
    const cabH = T.cabRoof - clear;
    const at = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);

    this.add(scene, new BoxGeometry(T.width, bodyH, T.trailerLength), PALETTE.truckTrailer, true, [
      at(0, clear + bodyH / 2, tr.centre.z),
    ]);
    this.add(
      scene,
      new BoxGeometry(T.width + 0.02, D.stripeHeight, T.trailerLength + 0.02),
      PALETTE.truckStripe,
      true,
      [at(0, clear + 0.5, tr.centre.z)],
    );
    this.add(scene, new BoxGeometry(T.width, cabH, T.cabLength), PALETTE.truckCab, true, [
      at(0, clear + cabH / 2, cab.centre.z),
    ]);
    this.add(scene, new BoxGeometry(T.width * 0.86, cabH * 0.32, 0.06), PALETTE.truckGlass, true, [
      at(0, clear + cabH * 0.68, cab.centre.z + T.cabLength / 2 + 0.01),
    ]);
    this.add(
      scene,
      new BoxGeometry(T.width * 0.8, clear * 0.5, T.length * 0.96),
      PALETTE.truckDark,
      false,
      [at(0, clear * 0.75, 0)],
    );
    // Wheels are decoration only (no colliders, no wheel simulation).
    const wheel = new CylinderGeometry(D.wheelRadius, D.wheelRadius, D.wheelWidth, 10);
    wheel.rotateZ(Math.PI / 2);
    const x = T.width / 2 - D.wheelWidth / 2;
    const rear = -T.length / 2;
    const wheels: Matrix4[] = [];
    for (const z of [rear + 1.2, rear + 2.5, cab.centre.z - 0.2]) {
      for (const side of [-1, 1]) wheels.push(at(side * x, D.wheelRadius, z));
    }
    this.add(scene, wheel, PALETTE.truckDark, false, wheels);
  }

  private add(
    scene: Scene,
    geometry: BufferGeometry,
    color: number,
    tint: boolean,
    locals: Matrix4[],
  ): void {
    const mesh = new InstancedMesh(
      geometry,
      new MeshLambertMaterial({ color, flatShading: true }),
      this.count * locals.length,
    );
    mesh.frustumCulled = false;
    if (tint) for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, WHITE);
    scene.add(mesh);
    this.parts.push({ mesh, locals, tint });
  }

  /** Place every truck between its last two physics states. */
  update(trucks: readonly Truck[], alpha: number): void {
    for (let i = 0; i < trucks.length; i++) {
      const t = trucks[i];
      const visible = t.isSolid;
      if (visible) {
        pos.lerpVectors(t.prevPos, t.pos, alpha);
        rot.slerpQuaternions(t.prevRot, t.rot, alpha);
        base.compose(pos, rot, one);
      }
      const stateChanged = this.lastState[i] !== t.state;
      for (const part of this.parts) {
        const n = part.locals.length;
        for (let j = 0; j < n; j++) {
          part.mesh.setMatrixAt(
            i * n + j,
            visible ? m.multiplyMatrices(base, part.locals[j]) : ZERO,
          );
          if (stateChanged && part.tint) {
            const normal = t.assignment.float ? this.carriedColor : WHITE;
            part.mesh.setColorAt(i * n + j, t.state === 'wreck' ? this.wreckColor : normal);
          }
        }
        if (stateChanged && part.tint && part.mesh.instanceColor) {
          part.mesh.instanceColor.needsUpdate = true;
        }
      }
      this.lastState[i] = t.state;
    }
    for (const part of this.parts) part.mesh.instanceMatrix.needsUpdate = true;
  }
}
