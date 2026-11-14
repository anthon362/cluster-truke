import { TUNING } from '../config/tuning';
import type { MoveInput } from '../player/movement';

/** Actions the game understands. Rebinding UI arrives in M7; the table is ready. */
export type Action =
  'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'restart' | 'debug' | 'mute';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  restart: ['KeyR'],
  debug: ['F3'],
  mute: ['KeyM'],
};

const C = TUNING.camera;

export class Input {
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  sensitivity: number = C.sensitivityDefault;
  invertY = false;
  yaw = 0;
  pitch = 0;

  private readonly down = new Set<string>();
  private jumpQueued = false;
  private readonly oneShot = new Set<Action>();
  private anyPress = false;
  private primary = false;
  private secondary = false;

  constructor(private readonly lockTarget: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      if (this.matches('jump', e.code)) this.jumpQueued = true;
      let system = e.code === 'Escape';
      for (const a of ['restart', 'debug', 'mute'] as const) {
        if (this.matches(a, e.code)) {
          this.oneShot.add(a);
          if (a !== 'restart') system = true;
        }
      }
      if (!system) this.anyPress = true;
    });
    this.lockTarget.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.anyPress = true;
      if (e.button === 0) this.primary = true;
      if (e.button === 2) this.secondary = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.primary = false;
      if (e.button === 2) this.secondary = false;
    });
    // Right mouse is the utility ability, not a menu.
    this.lockTarget.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) {
        this.primary = false;
        this.secondary = false;
      }
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Raw pointer-lock deltas, no acceleration or smoothing.
      const k = C.mouseRadPerPixel * this.sensitivity;
      this.yaw -= e.movementX * k;
      this.pitch -= e.movementY * k * (this.invertY ? -1 : 1);
      this.pitch = Math.min(Math.max(this.pitch, -C.pitchLimit), C.pitchLimit);
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.lockTarget;
  }

  requestLock(): void {
    // unadjustedMovement asks the browser for raw input where supported.
    const req = this.lockTarget.requestPointerLock as (o?: object) => Promise<void> | void;
    try {
      const p = req.call(this.lockTarget, { unadjustedMovement: true });
      if (p && 'catch' in p) p.catch(() => this.lockTarget.requestPointerLock());
    } catch {
      this.lockTarget.requestPointerLock();
    }
  }

  /** True once per key press. */
  consume(action: 'restart' | 'debug' | 'mute'): boolean {
    return this.oneShot.delete(action);
  }

  /** True if any gameplay key or mouse button was freshly pressed since the last call. */
  consumeAnyPress(): boolean {
    const v = this.anyPress;
    this.anyPress = false;
    return v;
  }

  /** Sample input for one fixed step. Jump presses are never lost between frames. */
  sample(): MoveInput {
    const jumpPressed = this.jumpQueued;
    this.jumpQueued = false;
    return {
      moveF: (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0),
      moveS: (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0),
      sprint: this.held('sprint'),
      jumpHeld: this.held('jump'),
      jumpPressed,
      yaw: this.yaw,
      pitch: this.pitch,
      primaryHeld: this.primary,
      secondaryHeld: this.secondary,
    };
  }

  private held(action: Action): boolean {
    return this.bindings[action].some((code) => this.down.has(code));
  }

  private matches(action: Action, code: string): boolean {
    return this.bindings[action].includes(code);
  }
}
