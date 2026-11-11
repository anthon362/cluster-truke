import type { SaveData } from '../core/save';
import type { LevelDef } from '../level/schema';
import { formatTime } from './format';

/** Best time per campaign level, grouped by world. */
export class BestTimes {
  readonly el: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly levels: readonly LevelDef[],
    onClose: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay times hidden';
    this.el.innerHTML = `<h3>Best Times</h3><div class="times-body"></div>
      <div class="buttons"><button type="button" class="close primary">Back</button></div>`;
    this.body = this.el.querySelector('.times-body')!;
    this.el.querySelector('.close')!.addEventListener('click', onClose);
    parent.appendChild(this.el);
  }

  show(visible: boolean, save: SaveData): void {
    this.el.classList.toggle('hidden', !visible);
    if (!visible) return;
    const out: HTMLElement[] = [];
    let world = '';
    for (const level of this.levels) {
      if (level.world !== world) {
        world = level.world;
        const h = document.createElement('h4');
        h.textContent = world.toUpperCase();
        out.push(h);
      }
      const best = save.bestTimes[level.id];
      const row = document.createElement('div');
      row.className = 'time-row' + (best !== undefined && best <= level.parTime ? ' under-par' : '');
      for (const text of [
        level.id,
        level.name,
        best !== undefined ? formatTime(best) : '—',
        `par ${formatTime(level.parTime)}`,
      ]) {
        const cell = document.createElement('span');
        cell.textContent = text;
        row.appendChild(cell);
      }
      out.push(row);
    }
    this.body.replaceChildren(...out);
  }
}
