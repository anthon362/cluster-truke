import { formatTime } from './format';

/** Minimal in-game HUD: crosshair dot and the attempt timer. */
export class Hud {
  private readonly timer: HTMLDivElement;
  private last = '';

  constructor(parent: HTMLElement) {
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    parent.appendChild(crosshair);
    this.timer = document.createElement('div');
    this.timer.className = 'timer';
    parent.appendChild(this.timer);
  }

  setTime(seconds: number): void {
    const text = formatTime(seconds);
    if (text !== this.last) {
      this.timer.textContent = text;
      this.last = text;
    }
  }
}
