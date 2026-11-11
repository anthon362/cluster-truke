import { TUNING } from '../config/tuning';

const G = TUNING.ghost;
/** Position resolution of a stored ghost: 1 cm. Angle resolution: 0.001 rad. */
const POS_SCALE = 100;
const ANGLE_SCALE = 1000;
const FIELDS = 4; // x, y, z, yaw

/** Records the player's position and view direction at a fixed rate during an attempt. */
export class GhostRecorder {
  private data: number[] = [];
  private next = 0;

  reset(): void {
    this.data = [];
    this.next = 0;
  }

  /** Call every step with the attempt time; samples are taken at the ghost rate. */
  record(time: number, x: number, y: number, z: number, yaw: number): void {
    if (time + 1e-9 < this.next) return;
    this.next += 1 / G.sampleHz;
    this.data.push(x, y, z, yaw);
  }

  get samples(): Float32Array {
    return new Float32Array(this.data);
  }
}

/**
 * Pack samples into a compact string: the first sample in full, then 16-bit
 * differences between consecutive samples, base64-encoded. A 25 s run is
 * about 8 kB.
 */
export function encodeGhost(samples: Float32Array): string {
  const n = Math.floor(samples.length / FIELDS);
  if (n === 0) return '';
  const head = new Float32Array(samples.subarray(0, FIELDS));
  const deltas = new Int16Array((n - 1) * FIELDS);
  // Differences are taken between rounded values so rounding errors do not add up.
  const q = (i: number, f: number) =>
    Math.round(samples[i * FIELDS + f] * (f === 3 ? ANGLE_SCALE : POS_SCALE));
  for (let i = 1; i < n; i++) {
    for (let f = 0; f < FIELDS; f++) {
      const d = q(i, f) - q(i - 1, f);
      deltas[(i - 1) * FIELDS + f] = Math.max(-32768, Math.min(32767, d));
    }
  }
  const bytes = new Uint8Array(head.byteLength + deltas.byteLength);
  bytes.set(new Uint8Array(head.buffer), 0);
  bytes.set(new Uint8Array(deltas.buffer), head.byteLength);
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return btoa(text);
}

/** Reverse of `encodeGhost`. Returns an empty array for anything that is not a valid ghost. */
export function decodeGhost(encoded: string): Float32Array {
  try {
    const text = atob(encoded);
    const headBytes = FIELDS * 4;
    if (text.length < headBytes || (text.length - headBytes) % (FIELDS * 2) !== 0) {
      return new Float32Array(0);
    }
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    const head = new Float32Array(bytes.buffer.slice(0, headBytes));
    const deltas = new Int16Array(bytes.buffer.slice(headBytes));
    const n = deltas.length / FIELDS + 1;
    const out = new Float32Array(n * FIELDS);
    const acc = [0, 1, 2, 3].map((f) => Math.round(head[f] * (f === 3 ? ANGLE_SCALE : POS_SCALE)));
    for (let f = 0; f < FIELDS; f++) out[f] = acc[f] / (f === 3 ? ANGLE_SCALE : POS_SCALE);
    for (let i = 1; i < n; i++) {
      for (let f = 0; f < FIELDS; f++) {
        acc[f] += deltas[(i - 1) * FIELDS + f];
        out[i * FIELDS + f] = acc[f] / (f === 3 ? ANGLE_SCALE : POS_SCALE);
      }
    }
    return out;
  } catch {
    return new Float32Array(0);
  }
}

/** Where a recorded ghost is at a given attempt time. */
export class GhostPlayer {
  readonly count: number;

  constructor(private readonly samples: Float32Array) {
    this.count = Math.floor(samples.length / FIELDS);
  }

  get duration(): number {
    return Math.max(0, this.count - 1) / G.sampleHz;
  }

  /** Writes the interpolated pose into `out`; returns false when the ghost has no data for that time. */
  at(time: number, out: { x: number; y: number; z: number; yaw: number }): boolean {
    if (this.count === 0 || time < 0 || time > this.duration) return false;
    const f = time * G.sampleHz;
    const i = Math.min(this.count - 1, Math.floor(f));
    const j = Math.min(this.count - 1, i + 1);
    const t = f - i;
    const a = i * FIELDS;
    const b = j * FIELDS;
    const s = this.samples;
    out.x = s[a] + (s[b] - s[a]) * t;
    out.y = s[a + 1] + (s[b + 1] - s[a + 1]) * t;
    out.z = s[a + 2] + (s[b + 2] - s[a + 2]) * t;
    out.yaw = s[a + 3] + (s[b + 3] - s[a + 3]) * t;
    return true;
  }
}

const ghostKey = (levelId: string) => `righop-ghost-${levelId}`;

/** Store a level's best-run ghost. Skipped (returns false) if it is over budget or storage refuses. */
export function storeGhost(
  storage: { setItem(k: string, v: string): void } | undefined,
  levelId: string,
  samples: Float32Array,
): boolean {
  const text = encodeGhost(samples);
  if (!storage || text.length === 0 || text.length > G.maxStoredChars) return false;
  try {
    storage.setItem(ghostKey(levelId), text);
    return true;
  } catch {
    return false;
  }
}

export function loadGhost(
  storage: { getItem(k: string): string | null } | undefined,
  levelId: string,
): GhostPlayer | null {
  try {
    const text = storage?.getItem(ghostKey(levelId));
    if (!text) return null;
    const player = new GhostPlayer(decodeGhost(text));
    return player.count > 1 ? player : null;
  } catch {
    return null;
  }
}
