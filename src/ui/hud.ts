import { formatTime } from './format';

/** Minimal in-game HUD: crosshair dot and the attempt timer. */
export class Hud {
  private readonly timer: HTMLDivElement;
  private readonly levelName: HTMLDivElement;
  private last = '';

  constructor(parent: HTMLElement) {
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    parent.appendChild(crosshair);
    this.timer = document.createElement('div');
    this.timer.className = 'timer';
    parent.appendChild(this.timer);
    this.levelName = document.createElement('div');
    this.levelName.className = 'level-name';
    parent.appendChild(this.levelName);
  }

  setLevel(id: string, name: string): void {
    this.levelName.textContent = `${id}  ${name}`;
  }

  setTime(seconds: number): void {
    const text = formatTime(seconds);
    if (text !== this.last) {
      this.timer.textContent = text;
      this.last = text;
    }
  }
}
