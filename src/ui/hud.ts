import type { Ability } from '../abilities/ability';
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
  private readonly speed: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly bars: { root: HTMLDivElement; name: HTMLElement; fill: HTMLElement }[] = [];
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
    for (const side of ['left', 'right']) {
      const root = document.createElement('div');
      root.className = `ability-bar ${side} hidden`;
      root.innerHTML = `<div class="name"></div><div class="track"><div class="fill"></div></div>`;
      parent.appendChild(root);
      this.bars.push({
        root,
        name: root.querySelector('.name')!,
        fill: root.querySelector('.fill')!,
      });
    }
    this.speed = document.createElement('div');
    this.speed.className = 'speed hidden';
    parent.appendChild(this.speed);
    this.hint = document.createElement('div');
    this.hint.className = 'tutorial hidden';
    parent.appendChild(this.hint);
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

  /** Energy bars in the bottom corners: movement left, utility right. */
  setAbilities(movement: Ability | null, utility: Ability | null): void {
    [movement, utility].forEach((a, i) => {
      const bar = this.bars[i];
      bar.root.classList.toggle('hidden', !a);
      if (!a) return;
      if (bar.name.textContent !== a.info.name) bar.name.textContent = a.info.name;
      // One bar: empty while cooling down or drained, full when ready.
      const level = Math.min(a.energy01, 1 - a.cooldown01);
      bar.fill.style.width = `${Math.round(level * 100)}%`;
      bar.root.classList.toggle('ready', level >= 0.999);
    });
  }

  /** Optional speed readout (a setting). */
  setSpeed(visible: boolean, metresPerSecond: number): void {
    this.speed.classList.toggle('hidden', !visible);
    if (visible) this.speed.textContent = `${Math.round(metresPerSecond * 3.6)} km/h`;
  }

  /** A line of help for first-time players; empty text hides it. */
  setHint(text: string): void {
    this.hint.classList.toggle('hidden', text === '');
    if (this.hint.textContent !== text) this.hint.textContent = text;
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
