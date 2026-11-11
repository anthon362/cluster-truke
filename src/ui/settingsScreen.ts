import { TUNING } from '../config/tuning';
import { ACTION_LABELS, type Action, DEFAULT_BINDINGS, RESERVED_KEYS, keyLabel, rebind } from '../core/bindings';
import type { Input } from '../core/input';
import { type Quality, type Settings, defaultSettings } from '../core/settings';

const C = TUNING.camera;
const S = TUNING.settings;

/** Settings: sliders, toggles and key rebinding. Every change applies and saves at once. */
export class SettingsScreen {
  readonly el: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly settings: Settings,
    private readonly input: Input,
    private readonly onChange: () => void,
    onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay settings hidden';
    this.el.innerHTML = `<h3>Settings</h3><div class="settings-body"></div>
      <div class="buttons">
        <button type="button" class="reset">Reset to defaults</button>
        <button type="button" class="close primary">Back</button>
      </div>`;
    this.body = this.el.querySelector('.settings-body')!;
    this.el.querySelector('.close')!.addEventListener('click', () => {
      this.input.captureKey = null;
      onClose();
    });
    this.el.querySelector('.reset')!.addEventListener('click', () => {
      Object.assign(this.settings, defaultSettings());
      this.changed();
    });
    parent.appendChild(this.el);
  }

  show(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
    if (visible) this.render();
  }

  private changed(): void {
    this.onChange();
    this.render();
  }

  private render(): void {
    const s = this.settings;
    const rows: HTMLElement[] = [];
    const head = (text: string) => {
      const h = document.createElement('h4');
      h.textContent = text;
      rows.push(h);
    };
    const row = (label: string, control: HTMLElement, value?: HTMLElement) => {
      const r = document.createElement('label');
      r.className = 'setting';
      const name = document.createElement('span');
      name.textContent = label;
      r.append(name, control);
      if (value) r.append(value);
      rows.push(r);
    };
    const slider = (
      label: string,
      key: 'fov' | 'sensitivity' | 'master' | 'music' | 'sfx' | 'padSensitivityX' | 'padSensitivityY' | 'padDeadzone',
      min: number,
      max: number,
      step: number,
      show: (v: number) => string,
    ) => {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(s[key]);
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = show(s[key]);
      input.addEventListener('input', () => {
        s[key] = Number(input.value);
        value.textContent = show(s[key]);
        this.onChange();
      });
      row(label, input, value);
    };
    const toggle = (label: string, key: 'invertY' | 'shake' | 'speedReadout' | 'ghost') => {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = s[key];
      input.addEventListener('change', () => {
        s[key] = input.checked;
        this.onChange();
      });
      row(label, input);
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;

    head('View');
    slider('Field of view', 'fov', C.fovMin, C.fovMax, 1, (v) => `${v}°`);
    toggle('Camera shake', 'shake');
    toggle('Show speed', 'speedReadout');
    toggle('Ghost of your best run', 'ghost');
    const quality = document.createElement('select');
    for (const q of ['low', 'medium', 'high'] as Quality[]) {
      const o = document.createElement('option');
      o.value = q;
      o.textContent = q[0].toUpperCase() + q.slice(1);
      o.selected = s.quality === q;
      quality.appendChild(o);
    }
    quality.addEventListener('change', () => {
      s.quality = quality.value as Quality;
      this.onChange();
    });
    row('Quality', quality);

    head('Mouse');
    slider('Sensitivity', 'sensitivity', S.sensitivityMin, S.sensitivityMax, 0.05, (v) => v.toFixed(2));
    toggle('Invert Y', 'invertY');

    head('Gamepad');
    slider('Look speed, sideways', 'padSensitivityX', S.padSensitivityMin, S.padSensitivityMax, 0.05, (v) => v.toFixed(2));
    slider('Look speed, up and down', 'padSensitivityY', S.padSensitivityMin, S.padSensitivityMax, 0.05, (v) => v.toFixed(2));
    slider('Stick dead zone', 'padDeadzone', 0, 0.5, 0.01, pct);

    head('Sound');
    slider('Master volume', 'master', 0, 1, 0.01, pct);
    slider('Music volume', 'music', 0, 1, 0.01, pct);
    slider('Effects volume', 'sfx', 0, 1, 0.01, pct);

    head('Keys');
    for (const action of Object.keys(DEFAULT_BINDINGS) as Action[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'key';
      button.textContent = s.bindings[action].map(keyLabel).join(' / ');
      button.addEventListener('click', () => {
        button.textContent = 'Press a key…';
        button.classList.add('waiting');
        this.input.captureKey = (code) => {
          if (!RESERVED_KEYS.includes(code)) s.bindings = rebind(s.bindings, action, code);
          this.changed();
        };
      });
      row(ACTION_LABELS[action], button);
    }
    const note = document.createElement('div');
    note.className = 'hint';
    note.textContent =
      'Mouse: left = movement ability, right = utility ability. Gamepad: left stick move, right stick look, A jump, LB or L3 sprint, RT movement ability, LT utility ability, Start pause, Y restart.';
    rows.push(note);
    this.body.replaceChildren(...rows);
  }
}
