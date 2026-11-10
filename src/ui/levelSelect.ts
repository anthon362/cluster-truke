import type { SaveData } from '../core/save';
import type { LevelEntry } from '../level/levels';
import { formatTime } from './format';

/**
 * Level list (a stub until the real menus in M7): one tile per level with its
 * best time. Level files that failed validation are listed with their problems.
 */
export class LevelSelect {
  readonly el: HTMLDivElement;
  private readonly list: HTMLDivElement;

  constructor(
    parent: HTMLElement,
    private readonly entries: readonly LevelEntry[],
    private readonly onPick: (id: string) => void,
    /** Whether a level may be played yet. */
    private readonly unlocked: (id: string) => boolean,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'overlay levels hidden';
    this.el.innerHTML = `<h3>Choose a level</h3><div class="hint bank"></div><div class="level-list"></div>`;
    this.list = this.el.querySelector('.level-list')!;
    parent.appendChild(this.el);
  }

  show(visible: boolean, save: SaveData, currentId: string): void {
    this.el.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.el.querySelector('.bank')!.textContent =
      `Bank: ${save.points.toLocaleString('en-US')} points`;
    this.list.replaceChildren();
    let world = '';
    for (const entry of this.entries) {
      const level = entry.level;
      if (!level) {
        const bad = document.createElement('div');
        bad.className = 'level-tile broken';
        const title = document.createElement('b');
        title.textContent = `${entry.file} cannot be loaded`;
        const why = document.createElement('pre');
        why.textContent = (entry.problems ?? []).join('\n');
        bad.append(title, why);
        this.list.appendChild(bad);
        continue;
      }
      if (level.world !== world) {
        world = level.world;
        const head = document.createElement('div');
        head.className = 'level-world';
        head.textContent = world.toUpperCase();
        this.list.appendChild(head);
      }
      const best = save.bestTimes[level.id];
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'level-tile' + (level.id === currentId ? ' current' : '');
      const id = document.createElement('span');
      id.className = 'id';
      id.textContent = level.id;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = level.name;
      const time = document.createElement('span');
      time.className = 'best';
      time.textContent =
        best !== undefined ? `✓ ${formatTime(best)}` : `par ${formatTime(level.parTime)}`;
      tile.append(id, name, time);
      if (!this.unlocked(level.id)) {
        tile.disabled = true;
        tile.classList.add('locked');
        time.textContent = 'locked: finish the level before it';
      }
      tile.addEventListener('click', () => this.onPick(level.id));
      this.list.appendChild(tile);
    }
  }
}
