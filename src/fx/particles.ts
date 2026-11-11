import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Scene,
  Vector3,
} from 'three';
import { TUNING } from '../config/tuning';
import { PALETTE } from '../render/palette';

const F = TUNING.fx;
const m = new Matrix4();
const ZERO = new Matrix4().makeScale(0, 0, 0);

/** Pooled, capped chunk particles for explosions. Visual only. */
export class Particles {
  private readonly mesh: InstancedMesh;
  private readonly pos: Vector3[] = [];
  private readonly vel: Vector3[] = [];
  private readonly life = new Float32Array(F.maxParticles);
  private next = 0;
  /** Share of the full particle count to emit (quality setting). */
  density = 1;
  private readonly colors = [
    new Color(PALETTE.spark),
    new Color(PALETTE.smoke),
    new Color(PALETTE.truckStripe),
  ];

  constructor(scene: Scene) {
    this.mesh = new InstancedMesh(
      new BoxGeometry(F.particleSize, F.particleSize, F.particleSize),
      new MeshBasicMaterial(),
      F.maxParticles,
    );
    this.mesh.frustumCulled = false;
    for (let i = 0; i < F.maxParticles; i++) {
      this.pos.push(new Vector3());
      this.vel.push(new Vector3());
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, this.colors[0]);
    }
    scene.add(this.mesh);
  }

  burst(origin: Vector3): void {
    const count = Math.max(4, Math.round(F.explosionParticles * this.density));
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % F.maxParticles;
      this.pos[i].copy(origin);
      // Visual only, so plain Math.random is fine here (never affects gameplay).
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = F.particleSpeed * (0.4 + Math.random() * 0.6);
      this.vel[i].set(
        Math.cos(a) * sp * (1 - up * 0.5),
        sp * (0.3 + up),
        Math.sin(a) * sp * (1 - up * 0.5),
      );
      this.life[i] = F.particleLife * (0.6 + Math.random() * 0.4);
      this.mesh.setColorAt(i, this.colors[n % this.colors.length]);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < F.maxParticles; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      this.vel[i].y -= F.particleGravity * dt;
      this.pos[i].addScaledVector(this.vel[i], dt);
      const s = Math.min(1, this.life[i] / (F.particleLife * 0.5));
      m.makeScale(s, s, s).setPosition(this.pos[i]);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
