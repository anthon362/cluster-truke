import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
} from 'three';
import { TUNING } from '../config/tuning';

const J = TUNING.juice;

/**
 * Streaks around the edge of the view that appear with speed. They are
 * attached to the camera, so they sell speed without moving the view itself.
 */
export class SpeedLines {
  private readonly lines: LineSegments;
  private readonly material: LineBasicMaterial;
  enabled = true;

  constructor(camera: PerspectiveCamera) {
    const n = J.speedLineCount;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      // A ring of streaks pointing away from the viewer, kept out of the middle of the view.
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.13;
      const r = 2.2 + ((i * 7) % 5) * 0.35;
      const z = -3 - ((i * 5) % 7) * 0.6;
      const len = 1.2 + ((i * 3) % 4) * 0.5;
      pos.set(
        [Math.cos(a) * r, Math.sin(a) * r, z, Math.cos(a) * r, Math.sin(a) * r, z - len],
        i * 6,
      );
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    this.material = new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      fog: false,
      depthTest: false,
    });
    this.lines = new LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    camera.add(this.lines);
  }

  /** `speed`: the player's world speed in m/s. */
  update(speed: number, dt: number): void {
    const want = this.enabled
      ? Math.min(1, Math.max(0, (speed - J.speedLinesFrom) / (J.speedLinesFull - J.speedLinesFrom)))
      : 0;
    const o = this.material.opacity;
    this.material.opacity = o + (want * 0.55 - o) * Math.min(1, dt * 8);
    this.lines.visible = this.material.opacity > 0.01;
    // Slide the streaks toward the viewer and wrap, so they read as motion.
    this.lines.position.z = (this.lines.position.z + speed * dt * 0.5) % 2;
  }
}
