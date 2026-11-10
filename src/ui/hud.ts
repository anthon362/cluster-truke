import type { Bonus } from '../score/score';
import { formatTime } from './format';

/** How long a bonus pop-up stays on screen (ms); matches the CSS animation. */
const POPUP_MS = 1500;
const MAX_POPUPS = 6;

/** Minimal in-game HUD: crosshair dot and the attempt timer. */
export class Hud {
  private readonly timer: HTMLDivElement;
  private readonly levelName: HTMLDivElement;
  private readonly popups: HTMLDivElement;
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
    this.popups = document.createElement('div');
    this.popups.className = 'popups';
    parent.appendChild(this.popups);
  }

  /** Show a bonus the moment it is earned. */
  popBonus(bonus: Bonus): void {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = `+${bonus.points}  ${bonus.kind}`;
    this.popups.appendChild(el);
    while (this.popups.childElementCount > MAX_POPUPS) this.popups.firstElementChild?.remove();
    window.setTimeout(() => el.remove(), POPUP_MS);
  }

  clearPopups(): void {
    this.popups.replaceChildren();
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
