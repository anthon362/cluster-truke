import { TUNING } from '../config/tuning';
import type { MoveInput } from '../player/movement';
import { type Action, DEFAULT_BINDINGS } from './bindings';

export type { Action } from './bindings';

const C = TUNING.camera;
const S = TUNING.settings;

/** Things a single press asks for, read once by the app. */
export type OneShot = 'restart' | 'debug' | 'mute' | 'pause' | 'confirm';

/**
 * Stick response: nothing inside the dead zone, then a curve so small
 * movements stay small (console ports of this kind of game are often
 * criticised for twitchy aiming).
 */
export function stickResponse(value: number, deadzone: number, curve: number = S.padCurve): number {
  const mag = Math.abs(value);
  if (mag <= deadzone) return 0;
  const t = Math.min(1, (mag - deadzone) / (1 - deadzone));
  return Math.sign(value) * t ** curve;
}

/** Standard-mapping gamepad buttons. */
const PAD = { A: 0, Y: 3, LB: 4, LT: 6, RT: 7, START: 9, L3: 10 } as const;

export class Input {
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  sensitivity: number = C.sensitivityDefault;
  invertY = false;
  padSensitivityX = 1;
  padSensitivityY = 1;
  padDeadzone: number = S.padDeadzone;
  yaw = 0;
  pitch = 0;
  /** True once a gamepad has been used; the game then runs without mouse capture. */
  padActive = false;
  /** When set, the next key press is handed to this instead of the game (rebinding). */
  captureKey: ((code: string) => void) | null = null;

  private readonly down = new Set<string>();
  private jumpQueued = false;
  private readonly oneShot = new Set<OneShot>();
  private anyPress = false;
  primary = false;
  secondary = false;
  private padMoveF = 0;
  private padMoveS = 0;
  private padSprint = false;
  private padJump = false;
  private padPrimary = false;
  private padSecondary = false;
  private padPrev: boolean[] = [];

  constructor(private readonly lockTarget: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.captureKey) {
        e.preventDefault();
        const take = this.captureKey;
        this.captureKey = null;
        take(e.code);
        return;
      }
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
      if (e.code === 'Enter') this.oneShot.add('confirm');
      if (!system) this.anyPress = true;
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Raw pointer-lock deltas, no acceleration or smoothing.
      const k = C.mouseRadPerPixel * this.sensitivity;
      this.yaw -= e.movementX * k;
      this.pitch -= e.movementY * k * (this.invertY ? -1 : 1);
      this.clampPitch();
    });
    this.lockTarget.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.anyPress = true;
      this.padActive = false;
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

  /** True once per press. */
  consume(what: OneShot): boolean {
    return this.oneShot.delete(what);
  }

  /** True if any gameplay key or button was freshly pressed since the last call. */
  consumeAnyPress(): boolean {
    const v = this.anyPress;
    this.anyPress = false;
    return v;
  }

  /**
   * Read the gamepad. Called once per frame with the real frame time, so stick
   * look is smooth and independent of the simulation rate.
   * `looking`: false in menus, where the sticks must not turn the camera.
   */
  pollGamepad(dt: number, looking: boolean): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected && p.mapping === 'standard') {
        pad = p;
        break;
      }
    }
    if (!pad) {
      this.padMoveF = this.padMoveS = 0;
      this.padSprint = this.padJump = this.padPrimary = this.padSecondary = false;
      return;
    }
    const dz = this.padDeadzone;
    // Movement uses a linear response so walking speed is easy to hold.
    this.padMoveS = stickResponse(pad.axes[0] ?? 0, dz, 1);
    this.padMoveF = -stickResponse(pad.axes[1] ?? 0, dz, 1);
    const lookX = stickResponse(pad.axes[2] ?? 0, dz);
    const lookY = stickResponse(pad.axes[3] ?? 0, dz);
    if (looking) {
      this.yaw -= lookX * S.padLookX * this.padSensitivityX * dt;
      this.pitch -= lookY * S.padLookY * this.padSensitivityY * dt * (this.invertY ? -1 : 1);
      this.clampPitch();
    }
    const pressed = (i: number) => {
      const b = pad!.buttons[i];
      return !!b && (b.pressed || b.value > S.padTrigger);
    };
    const edge = (i: number) => pressed(i) && !this.padPrev[i];
    this.padSprint = pressed(PAD.LB) || pressed(PAD.L3);
    this.padJump = pressed(PAD.A);
    this.padPrimary = pressed(PAD.RT);
    this.padSecondary = pressed(PAD.LT);
    if (edge(PAD.A)) {
      this.jumpQueued = true;
      this.oneShot.add('confirm');
    }
    if (edge(PAD.START)) this.oneShot.add('pause');
    if (edge(PAD.Y)) this.oneShot.add('restart');
    const used =
      pad.buttons.some((b, i) => b.pressed && !this.padPrev[i]) ||
      this.padMoveF !== 0 ||
      this.padMoveS !== 0 ||
      lookX !== 0 ||
      lookY !== 0;
    if (pad.buttons.some((b, i) => b.pressed && !this.padPrev[i])) this.anyPress = true;
    if (used) this.padActive = true;
    this.padPrev = pad.buttons.map((b) => b.pressed || b.value > S.padTrigger);
  }

  /** Sample input for one fixed step. Jump presses are never lost between frames. */
  sample(): MoveInput {
    const jumpPressed = this.jumpQueued;
    this.jumpQueued = false;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return {
      moveF: clamp((this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0) + this.padMoveF),
      moveS: clamp((this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0) + this.padMoveS),
      sprint: this.held('sprint') || this.padSprint,
      jumpHeld: this.held('jump') || this.padJump,
      jumpPressed,
      yaw: this.yaw,
      pitch: this.pitch,
      primaryHeld: this.primary || this.padPrimary,
      secondaryHeld: this.secondary || this.padSecondary,
    };
  }

  private clampPitch(): void {
    this.pitch = Math.min(Math.max(this.pitch, -C.pitchLimit), C.pitchLimit);
  }

  private held(action: Action): boolean {
    return this.bindings[action].some((code) => this.down.has(code));
  }

  private matches(action: Action, code: string): boolean {
    return this.bindings[action].includes(code);
  }
}
