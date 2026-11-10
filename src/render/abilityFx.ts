import {
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import type { RoadFlare } from '../abilities/roadFlare';
import type { SpareRig } from '../abilities/spareRig';
import type { TowLine } from '../abilities/towLine';
import type { Sim } from '../core/sim';
import { PALETTE } from './palette';

/** Draws what abilities need to show in the world: the tow line, thrown markers, a burning flare. */
export class AbilityFx {
  private readonly line: Line;
  private readonly linePos: BufferAttribute;
  private readonly marker: Mesh;
  private readonly flare: Mesh;

  constructor(scene: Scene) {
    const geo = new BufferGeometry();
    this.linePos = new BufferAttribute(new Float32Array(6), 3);
    geo.setAttribute('position', this.linePos);
    this.line = new Line(geo, new LineBasicMaterial({ color: PALETTE.towLine, fog: false }));
    this.line.frustumCulled = false;
    this.marker = new Mesh(new SphereGeometry(0.28, 10, 8), new MeshBasicMaterial({ color: PALETTE.marker }));
    this.flare = new Mesh(new SphereGeometry(0.6, 10, 8), new MeshBasicMaterial({ color: PALETTE.flare, fog: false }));
    scene.add(this.line, this.marker, this.flare);
  }

  update(sim: Sim, eye: Vector3, timeSeconds: number): void {
    const tow = sim.abilities.get<TowLine>('towLine');
    this.line.visible = !!tow?.active;
    if (tow?.active) {
      // Start a little below the eye so the line is visible in first person.
      this.linePos.setXYZ(0, eye.x, eye.y - 0.35, eye.z);
      this.linePos.setXYZ(1, tow.hookPoint.x, tow.hookPoint.y, tow.hookPoint.z);
      this.linePos.needsUpdate = true;
    }

    const rig = sim.abilities.get<SpareRig>('spareRig');
    const flare = sim.abilities.get<RoadFlare>('roadFlare');
    const thrown = rig?.marker.active ? rig.marker : flare?.marker.active ? flare.marker : null;
    this.marker.visible = !!thrown;
    if (thrown) this.marker.position.copy(thrown.pos);

    this.flare.visible = !!flare && flare.burning > 0;
    if (flare && flare.burning > 0) {
      this.flare.position.copy(flare.flare);
      this.flare.position.y += 0.5;
      this.flare.scale.setScalar(1 + 0.35 * Math.sin(timeSeconds * 30));
    }
  }
}
