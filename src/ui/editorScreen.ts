import {
  type Draft,
  type Footprint,
  type Item,
  OPTIONAL,
  type Ref,
  TEMPLATES,
  WORLDS,
  add,
  addConvoy,
  addPoint,
  addRoad,
  check,
  describe,
  draftFrom,
  footprint,
  itemAt,
  move,
  newDraft,
  optionalKey,
  parse,
  pick,
  placed,
  playerStart,
  remove,
  roadLines,
  serialize,
  truckStarts,
} from '../editor/model';
import type { LevelDef } from '../level/schema';

const STORAGE_KEY = 'righop-editor';
const MAX_UNDO = 60;
const DEG = Math.PI / 180;
/** Things snap to this many metres when dragged. */
const SNAP = 0.5;
const TRUCK = { w: 2.6, l: 10 };
/** Pixels per metre when a level is opened. */
const START_SCALE = 2.6;

/** Map colours by what a thing is. */
const COLOR: Record<string, string> = {
  box: '#8d9299',
  breakableWall: '#d9a066',
  spinner: '#f2c230',
  ice: '#bfe9ff',
  rotor: '#e5484d',
  beam: '#ff2e88',
  pendulum: '#2b2f36',
  plate: '#ff7a1a',
  boulder: '#8c7a66',
  wind: '#ffffff',
  belt: '#39e0ff',
  press: '#3b3f47',
  slide: '#f2f6fa',
  goal: '#3dffb0',
};

export interface EditorHandlers {
  /** Play the level being edited. */
  play(level: LevelDef): void;
  close(): void;
}

/**
 * The level editor: a map seen from above on the left, the selected thing's
 * settings on the right. It edits the same JSON the game loads, checks it
 * with the game's own validation as you go, and can export and import it as
 * a file.
 */
export class EditorScreen {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly props: HTMLElement;
  private readonly title: HTMLElement;
  private readonly things: HTMLElement;
  private readonly problems: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private draft: Draft;
  private selected: Ref | null = null;
  private readonly undoStack: string[] = [];
  /** Map position at the middle of the view, and pixels per metre. */
  private view = { x: 0, z: 110, scale: START_SCALE };
  private drag: { ref: Ref | null; x: number; z: number; moved: boolean } | null = null;
  private visible = false;

  constructor(
    parent: HTMLElement,
    private readonly levels: readonly LevelDef[],
    private readonly storage: Storage | undefined,
    private readonly handlers: EditorHandlers,
  ) {
    this.draft = this.restore();
    this.el = document.createElement('div');
    this.el.className = 'overlay editor hidden';
    this.el.innerHTML = `
      <div class="ed-bar">
        <b>Level editor</b>
        <button type="button" data-do="new">New</button>
        <select class="ed-open"><option value="">Open a copy of…</option></select>
        <button type="button" data-do="import">Import file</button>
        <button type="button" data-do="export">Export file</button>
        <button type="button" data-do="undo">Undo</button>
        <span class="ed-space"></span>
        <button type="button" class="primary" data-do="play">Play</button>
        <button type="button" data-do="close">Back</button>
        <input type="file" accept=".json,application/json" class="ed-file" hidden />
      </div>
      <div class="ed-body">
        <div class="ed-left">
          <h4>Add</h4>
          <div class="ed-add"></div>
          <h4>In this level</h4>
          <div class="ed-things"></div>
        </div>
        <canvas class="ed-map"></canvas>
        <div class="ed-right">
          <h4 class="ed-title"></h4>
          <div class="ed-props"></div>
          <h4>Problems</h4>
          <pre class="ed-problems"></pre>
        </div>
      </div>
      <div class="ed-help">Drag a thing to move it · drag empty space to pan · wheel to zoom · Delete removes · Ctrl+Z undoes · the player looks up the map, so their left is on the right</div>`;
    parent.appendChild(this.el);
    this.canvas = this.el.querySelector('.ed-map')!;
    this.g = this.canvas.getContext('2d')!;
    this.props = this.el.querySelector('.ed-props')!;
    this.title = this.el.querySelector('.ed-title')!;
    this.things = this.el.querySelector('.ed-things')!;
    this.problems = this.el.querySelector('.ed-problems')!;
    this.playButton = this.el.querySelector('[data-do="play"]')!;

    const addBox = this.el.querySelector('.ed-add')!;
    const adders: [string, () => Ref | undefined][] = [
      ...Object.keys(TEMPLATES).map((name): [string, () => Ref | undefined] => [
        name,
        () => add(this.draft, name, this.freeSpot()),
      ]),
      ['Road point', () => addPoint(this.draft, this.selectedRoad())],
      ['Road', () => addRoad(this.draft)],
      ['Convoy', () => addConvoy(this.draft, this.selectedRoad())],
    ];
    for (const [name, run] of adders) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.addEventListener('click', () => {
        this.remember();
        const ref = run();
        if (ref) this.selected = ref;
        this.changed(true);
      });
      addBox.appendChild(b);
    }

    const open = this.el.querySelector<HTMLSelectElement>('.ed-open')!;
    for (const level of levels) {
      const o = document.createElement('option');
      o.value = level.id;
      o.textContent = `${level.id}  ${level.name}`;
      open.appendChild(o);
    }
    open.addEventListener('change', () => {
      const level = this.levels.find((l) => l.id === open.value);
      open.value = '';
      if (level) this.replace(draftFrom(level));
    });

    const file = this.el.querySelector<HTMLInputElement>('.ed-file')!;
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      void f.text().then((text) => {
        const { draft, problems } = parse(text);
        if (draft) this.replace(draft);
        else {
          this.problems.textContent = `${f.name} was not opened:\n- ${problems.join('\n- ')}`;
          this.problems.classList.add('bad');
        }
      });
    });

    const actions: Record<string, () => void> = {
      new: () => this.replace(newDraft()),
      import: () => file.click(),
      export: () => this.download(),
      undo: () => this.undo(),
      play: () => {
        const { level } = check(this.draft);
        if (level) this.handlers.play(level);
      },
      close: () => this.handlers.close(),
    };
    this.el.querySelectorAll<HTMLButtonElement>('button[data-do]').forEach((b) => {
      b.addEventListener('click', () => actions[b.dataset.do!]?.());
    });

    this.canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    this.canvas.addEventListener('pointerup', () => this.pointerUp());
    this.canvas.addEventListener('pointercancel', () => this.pointerUp());
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const before = this.toMap(e.offsetX, e.offsetY);
        this.view.scale = Math.min(
          12,
          Math.max(0.25, this.view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)),
        );
        // Keep the spot under the pointer where it is.
        const after = this.toMap(e.offsetX, e.offsetY);
        this.view.x += before.x - after.x;
        this.view.z += before.z - after.z;
        this.draw();
      },
      { passive: false },
    );
    window.addEventListener('resize', () => this.visible && this.draw());
    window.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !typing) {
        e.preventDefault();
        this.undo();
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && !typing && this.selected) {
        e.preventDefault();
        this.remember();
        if (remove(this.draft, this.selected)) this.selected = null;
        else this.undoStack.pop();
        this.changed(true);
      }
    });
  }

  show(visible: boolean): void {
    this.visible = visible;
    this.el.classList.toggle('hidden', !visible);
    if (visible) this.changed(true);
  }

  /** The level as it stands, if it is valid (tests and the Play button). */
  get level(): LevelDef | undefined {
    return check(this.draft).level;
  }

  // ---- state -----------------------------------------------------------------------------

  private restore(): Draft {
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      const saved = text ? parse(text).draft : undefined;
      if (saved) return saved;
    } catch {
      // Unreadable storage: start fresh.
    }
    return newDraft();
  }

  /** Keep the current state so the next change can be undone. */
  private remember(): void {
    this.undoStack.push(serialize(this.draft));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  private undo(): void {
    const text = this.undoStack.pop();
    if (!text) return;
    this.draft = JSON.parse(text) as Draft;
    this.selected = null;
    this.changed(true);
  }

  /** Swap in a whole other level (New, Open, Import). */
  private replace(draft: Draft): void {
    this.remember();
    this.draft = draft;
    this.selected = null;
    const start = playerStart(draft);
    this.view = { x: start?.[0] ?? 0, z: (start?.[1] ?? 0) + 90, scale: START_SCALE };
    this.changed(true);
  }

  /** Something in the level changed: save the draft, check it, redraw. `rebuild`: the panels too. */
  private changed(rebuild: boolean): void {
    try {
      this.storage?.setItem(STORAGE_KEY, serialize(this.draft));
    } catch {
      // Storage full or unavailable: the draft just is not kept between visits.
    }
    const { problems } = check(this.draft);
    this.problems.textContent = problems.length
      ? `- ${problems.join('\n- ')}`
      : 'None. Ready to play.';
    this.problems.classList.toggle('bad', problems.length > 0);
    this.playButton.disabled = problems.length > 0;
    if (rebuild) {
      this.buildThings();
      this.buildProps();
    }
    this.draw();
  }

  /** Where a new thing goes: the middle of the view, or a little further on if that spot is taken. */
  private freeSpot(): number {
    const taken = placed(this.draft).map((e) => e.f.z);
    let z = Math.round(this.view.z);
    while (taken.some((t) => Math.abs(t - z) < 6)) z += 12;
    return z;
  }

  private selectedRoad(): number {
    const s = this.selected;
    if (s?.list === 'point') return s.path;
    if (s?.list === 'paths') return s.index;
    return this.draft.paths.length - 1;
  }

  private download(): void {
    const slug = this.draft.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([serialize(this.draft)], { type: 'application/json' }));
    a.download = `${slug || 'level'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---- panels ----------------------------------------------------------------------------

  private sameRef(a: Ref | null, b: Ref): boolean {
    return !!a && JSON.stringify(a) === JSON.stringify(b);
  }

  private buildThings(): void {
    const d = this.draft;
    const refs: Ref[] = [
      ...d.paths.map((_, index): Ref => ({ list: 'paths', index })),
      ...d.convoys.map((_, index): Ref => ({ list: 'convoys', index })),
      { list: 'goal' },
      ...d.hazards.map((_, index): Ref => ({ list: 'hazards', index })),
      ...d.scenery.map((_, index): Ref => ({ list: 'scenery', index })),
    ];
    this.things.replaceChildren(
      ...refs.map((ref) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = describe(d, ref);
        b.classList.toggle('current', this.sameRef(this.selected, ref));
        b.addEventListener('click', () => {
          this.selected = ref;
          const f = footprint(d, ref);
          if (f) this.view = { ...this.view, x: f.x, z: f.z };
          this.changed(true);
        });
        return b;
      }),
    );
  }

  private buildProps(): void {
    const d = this.draft;
    const s = this.selected;
    this.props.replaceChildren();
    if (!s) {
      this.title.textContent = 'Level';
      const top = d as unknown as Item;
      this.fields(this.props, top, 'level', ['name', 'world', 'parTime', 'killY', 'ground']);
      this.group(this.props, 'palette', d.palette, 'palette');
      this.group(this.props, 'player', d.player, 'player');
      return;
    }
    this.title.textContent = describe(d, s);
    if (s.list === 'point') {
      const p = (d.paths[s.path].points as number[][])[s.index];
      this.fields(this.props, { 'x, height, z': p }, '');
    } else {
      const item = itemAt(d, s);
      if (item) this.fields(this.props, item, optionalKey(d, s));
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ed-delete';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      this.remember();
      if (remove(d, s)) this.selected = null;
      else this.undoStack.pop();
      this.changed(true);
    });
    this.props.appendChild(del);
  }

  private group(parent: HTMLElement, name: string, obj: Item, optional: string): void {
    const box = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = name;
    box.appendChild(legend);
    this.fields(box, obj, optional);
    parent.appendChild(box);
  }

  /** One row per setting of `obj`, by the kind of value it holds, plus buttons for optional ones. */
  private fields(parent: HTMLElement, obj: Item, optional: string, only?: string[]): void {
    const extra = OPTIONAL[optional] ?? {};
    const keys = (only ?? Object.keys(obj)).filter((k) => obj[k] !== undefined);
    for (const key of keys) {
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.group(parent, key, value as Item, '');
        if (key in extra) parent.lastElementChild!.appendChild(this.dropButton(obj, key));
        continue;
      }
      const row = document.createElement('label');
      row.className = 'ed-row';
      const name = document.createElement('span');
      name.textContent = key;
      row.appendChild(name);
      row.appendChild(this.control(obj, key));
      if (key in extra) row.appendChild(this.dropButton(obj, key));
      parent.appendChild(row);
    }
    const missing = Object.keys(extra).filter((k) => obj[k] === undefined);
    if (missing.length === 0) return;
    const more = document.createElement('div');
    more.className = 'ed-more';
    for (const key of missing) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `+ ${key}`;
      b.addEventListener('click', () => {
        this.remember();
        obj[key] = JSON.parse(JSON.stringify(extra[key]));
        this.changed(true);
      });
      more.appendChild(b);
    }
    parent.appendChild(more);
  }

  private dropButton(obj: Item, key: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ed-drop';
    b.textContent = '×';
    b.title = `Remove ${key}`;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      this.remember();
      delete obj[key];
      this.changed(true);
    });
    return b;
  }

  /** The input for one value. Edits apply as you type; the state before the edit can be undone. */
  private control(obj: Item, key: string): HTMLElement {
    const value = obj[key];
    const live = (el: HTMLElement, apply: () => void): void => {
      el.addEventListener('focus', () => this.remember());
      el.addEventListener('input', () => {
        apply();
        this.changed(false);
      });
      // Lists and the title depend on some values (ids, positions): refresh them when done.
      el.addEventListener('change', () => {
        this.buildThings();
        this.title.textContent = this.selected ? describe(this.draft, this.selected) : 'Level';
      });
    };
    if (key === 'type') {
      const fixed = document.createElement('b');
      fixed.textContent = String(value);
      return fixed;
    }
    const choices =
      key === 'world'
        ? [...WORLDS]
        : key === 'path'
          ? this.draft.paths.map((p) => String(p.id))
          : key === 'convoy'
            ? this.draft.convoys.map((c) => String(c.id))
            : key === 'ground' && (value === 'none' || value === 'flat')
              ? ['none', 'flat']
              : null;
    if (choices) {
      const sel = document.createElement('select');
      for (const c of new Set([...choices, String(value)])) {
        const o = document.createElement('option');
        o.value = o.textContent = c;
        sel.appendChild(o);
      }
      sel.value = String(value);
      live(sel, () => (obj[key] = sel.value));
      return sel;
    }
    if (typeof value === 'boolean') {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = value;
      live(box, () => (obj[key] = box.checked));
      return box;
    }
    if (typeof value === 'number') return this.number(value, (n) => (obj[key] = n), live);
    if (typeof value === 'string') {
      const text = document.createElement('input');
      const colour = /^#[0-9a-f]{6}$/i.test(value);
      text.type = colour ? 'color' : 'text';
      text.value = value;
      live(text, () => (obj[key] = text.value));
      return text;
    }
    if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
      const list = value as number[];
      const wrap = document.createElement('span');
      wrap.className = 'ed-vec';
      list.forEach((n, i) => wrap.appendChild(this.number(n, (v) => (list[i] = v), live)));
      return wrap;
    }
    // Lists of lists (road points, avalanche stages): edited as text.
    const area = document.createElement('textarea');
    area.rows = Math.min(8, Array.isArray(value) ? value.length + 1 : 3);
    area.value = Array.isArray(value)
      ? value.map((v) => JSON.stringify(v)).join('\n')
      : JSON.stringify(value);
    live(area, () => {
      try {
        obj[key] = Array.isArray(value)
          ? area.value
              .split('\n')
              .filter((line) => line.trim() !== '')
              .map((line) => JSON.parse(line) as unknown)
          : (JSON.parse(area.value) as unknown);
        area.classList.remove('bad');
      } catch {
        area.classList.add('bad');
      }
    });
    return area;
  }

  private number(
    value: number,
    set: (n: number) => void,
    live: (el: HTMLElement, apply: () => void) => void,
  ): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.value = String(value);
    live(input, () => {
      const n = Number(input.value);
      if (input.value !== '' && Number.isFinite(n)) set(n);
    });
    return input;
  }

  // ---- map -------------------------------------------------------------------------------

  /** Pointer position on the canvas (CSS pixels) to a place on the map. X runs to the left. */
  private toMap(px: number, py: number): { x: number; z: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: this.view.x - (px - r.width / 2) / this.view.scale,
      z: this.view.z - (py - r.height / 2) / this.view.scale,
    };
  }

  private pointerDown(e: PointerEvent): void {
    const at = this.toMap(e.offsetX, e.offsetY);
    const ref = pick(this.draft, at.x, at.z, 4 / this.view.scale) ?? null;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { ref, x: at.x, z: at.z, moved: false };
    if (!this.sameRef(this.selected, ref ?? { list: 'goal' }) || !ref) {
      this.selected = ref;
      this.changed(true);
    }
  }

  private pointerMove(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const at = this.toMap(e.offsetX, e.offsetY);
    if (!drag.ref) {
      // Panning: keep the grabbed spot under the pointer.
      this.view.x += drag.x - at.x;
      this.view.z += drag.z - at.z;
      this.draw();
      return;
    }
    const dx = Math.round((at.x - drag.x) / SNAP) * SNAP;
    const dz = Math.round((at.z - drag.z) / SNAP) * SNAP;
    if (dx === 0 && dz === 0) return;
    if (!drag.moved) this.remember();
    drag.moved = true;
    move(this.draft, drag.ref, dx, dz);
    drag.x += dx;
    drag.z += dz;
    this.changed(false);
  }

  private pointerUp(): void {
    const moved = this.drag?.moved;
    this.drag = null;
    if (moved) this.changed(true);
  }

  private draw(): void {
    const c = this.canvas;
    const g = this.g;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (w === 0 || h === 0) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const d = this.draft;
    const s = this.view.scale;
    const sx = (x: number) => w / 2 - (x - this.view.x) * s;
    const sy = (z: number) => h / 2 - (z - this.view.z) * s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = typeof d.palette.ground === 'string' ? d.palette.ground : '#d9b382';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(16, 20, 26, 0.35)';
    g.fillRect(0, 0, w, h);

    // Grid every 50 m, with distances along Z.
    g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    g.fillStyle = 'rgba(255, 255, 255, 0.55)';
    g.font = '11px system-ui, sans-serif';
    g.lineWidth = 1;
    const top = this.toMap(0, 0);
    const bottom = this.toMap(w, h);
    for (let z = Math.ceil(bottom.z / 50) * 50; z <= top.z; z += 50) {
      g.beginPath();
      g.moveTo(0, sy(z));
      g.lineTo(w, sy(z));
      g.stroke();
      g.fillText(`${z} m`, 6, sy(z) - 3);
    }
    for (let x = Math.ceil(bottom.x / 50) * 50; x <= top.x; x += 50) {
      g.beginPath();
      g.moveTo(sx(x), 0);
      g.lineTo(sx(x), h);
      g.stroke();
    }

    // Roads.
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    for (const road of roadLines(d)) {
      g.strokeStyle = typeof d.palette.road === 'string' ? d.palette.road : '#4a4f57';
      g.lineWidth = road.width * s;
      g.beginPath();
      road.points.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sy(z)) : g.moveTo(sx(x), sy(z))));
      g.stroke();
    }

    /** Draw in the thing's own axes, in metres: X across, Z along. */
    const inFrame = (f: { x: number; z: number; yaw: number }, paint: () => void): void => {
      const a = f.yaw * DEG;
      g.save();
      g.transform(
        -Math.cos(a) * s,
        Math.sin(a) * s,
        -Math.sin(a) * s,
        -Math.cos(a) * s,
        sx(f.x),
        sy(f.z),
      );
      paint();
      g.restore();
    };
    const shape = (f: Footprint): void => {
      g.beginPath();
      if (f.round) g.arc(0, 0, Math.max(f.w, f.l) / 2, 0, Math.PI * 2);
      else g.rect(-f.w / 2, -f.l / 2, f.w, f.l);
    };

    // Trucks where they start.
    g.fillStyle = '#eceae0';
    for (const [x, z, yaw] of truckStarts(d)) {
      inFrame({ x, z, yaw }, () => g.fillRect(-TRUCK.w / 2, -TRUCK.l / 2, TRUCK.w, TRUCK.l));
    }
    const start = playerStart(d);
    if (start) {
      g.fillStyle = '#ff5a4d';
      g.beginPath();
      g.arc(sx(start[0]), sy(start[1]), Math.max(4, 0.9 * s), 0, Math.PI * 2);
      g.fill();
    }

    // Everything with a place, large things first so small ones stay visible.
    for (const { ref, f } of placed(d).reverse()) {
      const item = itemAt(d, ref);
      const kind =
        ref.list === 'goal' ? 'goal' : ref.list === 'point' ? 'point' : String(item?.type);
      const colour =
        kind === 'box' && typeof item?.color === 'string' ? item.color : (COLOR[kind] ?? '#ffd166');
      const selected = this.sameRef(this.selected, ref);
      inFrame(f, () => {
        shape(f);
        g.globalAlpha = kind === 'wind' ? 0.12 : kind === 'point' ? 1 : 0.7;
        g.fillStyle = kind === 'point' ? '#ffd166' : colour;
        g.fill();
        g.globalAlpha = 1;
        g.lineWidth = (selected ? 3 : 1) / s;
        g.strokeStyle = selected ? '#ffffff' : 'rgba(0, 0, 0, 0.55)';
        g.stroke();
      });
      if (kind !== 'point' && kind !== 'box' && s > 0.8) {
        g.fillStyle = '#ffffff';
        g.fillText(kind, sx(f.x) + 4, sy(f.z) - 4);
      }
    }
  }
}
