/** Actions the game understands, and their default keys (KeyboardEvent.code values). */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'jump'
  | 'restart'
  | 'debug'
  | 'mute';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Move forward',
  back: 'Move back',
  left: 'Move left',
  right: 'Move right',
  sprint: 'Sprint',
  jump: 'Jump',
  restart: 'Restart',
  mute: 'Mute music',
  debug: 'Debug overlay',
};

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

/** Keys that cannot be bound because the browser or the game needs them. */
export const RESERVED_KEYS = ['Escape', 'Enter', 'F5', 'F11', 'F12'];

/** "KeyW" -> "W", "ShiftLeft" -> "Left Shift", "ArrowUp" -> "Up". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  const side = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (side) return `${side[2]} ${side[1] === 'Control' ? 'Ctrl' : side[1]}`;
  return code.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
}

/**
 * Bind `code` as the only key for `action`. A key can drive one action, so it
 * is removed from any other action that had it (that action keeps its other
 * keys, or goes back to its default if it would be left with none).
 */
export function rebind(
  bindings: Record<Action, string[]>,
  action: Action,
  code: string,
): Record<Action, string[]> {
  if (RESERVED_KEYS.includes(code)) return bindings;
  const out = structuredClone(bindings);
  for (const other of Object.keys(out) as Action[]) {
    if (other === action) continue;
    out[other] = out[other].filter((k) => k !== code);
    if (out[other].length === 0) {
      out[other] = DEFAULT_BINDINGS[other].filter((k) => k !== code);
    }
  }
  out[action] = [code];
  return out;
}
