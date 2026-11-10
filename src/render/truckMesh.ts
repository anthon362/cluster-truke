import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { TUNING } from '../config/tuning';
import { TRUCK_SHAPE, Truck } from '../trucks/truck';
import { PALETTE, SCENE_DIMS as D } from './palette';

const T = TUNING.truck;

const mats = {
  trailer: new MeshLambertMaterial({ color: PALETTE.truckTrailer, flatShading: true }),
  stripe: new MeshLambertMaterial({ color: PALETTE.truckStripe, flatShading: true }),
  cab: new MeshLambertMaterial({ color: PALETTE.truckCab, flatShading: true }),
  dark: new MeshLambertMaterial({ color: PALETTE.truckDark, flatShading: true }),
  glass: new MeshLambertMaterial({ color: PALETTE.truckGlass, flatShading: true }),
};

function box(
  w: number,
  h: number,
  l: number,
  mat: MeshLambertMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, l), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * Primitive-only truck. Tops and sides match the colliders exactly so what
 * you see is what you can stand on. (One InstancedMesh per part arrives with convoys.)
 */
export function createTruckMesh(): Group {
  const g = new Group();
  const tr = TRUCK_SHAPE.trailer;
  const cab = TRUCK_SHAPE.cab;
  const clear = D.chassisClearance;

  // Trailer body with a coloured band, sitting on a dark chassis.
  const bodyH = T.trailerRoof - clear;
  g.add(box(T.width, bodyH, T.trailerLength, mats.trailer, 0, clear + bodyH / 2, tr.centre.z));
  g.add(
    box(
      T.width + 0.02,
      D.stripeHeight,
      T.trailerLength + 0.02,
      mats.stripe,
      0,
      clear + 0.5,
      tr.centre.z,
    ),
  );
  g.add(box(T.width * 0.8, clear * 0.5, T.length * 0.96, mats.dark, 0, clear * 0.75, 0));

  // Cab with a windscreen.
  const cabH = T.cabRoof - clear;
  g.add(box(T.width, cabH, T.cabLength, mats.cab, 0, clear + cabH / 2, cab.centre.z));
  g.add(
    box(
      T.width * 0.86,
      cabH * 0.32,
      0.06,
      mats.glass,
      0,
      clear + cabH * 0.68,
      cab.centre.z + T.cabLength / 2 + 0.01,
    ),
  );

  // Wheels are decoration only (no colliders, no wheel simulation).
  const wheelGeo = new CylinderGeometry(D.wheelRadius, D.wheelRadius, D.wheelWidth, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const x = T.width / 2 - D.wheelWidth / 2;
  const rear = -T.length / 2;
  for (const z of [rear + 1.2, rear + 2.5, cab.centre.z - 0.2]) {
    for (const side of [-1, 1]) {
      const w = new Mesh(wheelGeo, mats.dark);
      w.position.set(side * x, D.wheelRadius, z);
      g.add(w);
    }
  }
  return g;
}

/** Place a truck mesh between its last two physics states. */
export function syncTruckMesh(mesh: Group, truck: Truck, alpha: number): void {
  mesh.position.lerpVectors(truck.prevPos, truck.pos, alpha);
  mesh.quaternion.slerpQuaternions(truck.prevRot, truck.rot, alpha);
}
