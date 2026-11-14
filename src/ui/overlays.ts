import { GAME_TITLE, GAME_VERSION } from '../config/meta';
import type { Bonus } from '../score/score';
import { formatTime } from './format';

export type OverlayKind = 'none' | 'menu' | 'paused' | 'failed' | 'won' | 'other';

export interface OverlayHandlers {
  /** Main menu Play: continue the campaign. */
  play(): void;
  resume(): void;
  restart(): void;
  next(): void;
  raceGhost(): void;
  toggleGhost(): boolean;
  levels(): void;
  shop(): void;
  times(): void;
  settings(): void;
  editor(): void;
  quit(): void;
}

function el(className: string, html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = `overlay ${className} hidden`;
  d.innerHTML = html;
  return d;
}

/** Wire every `data-do="name"` button inside `root` to the handler of that name. */
function wire(root: HTMLElement, handlers: Record<string, () => void>): void {
  root.querySelectorAll<HTMLButtonElement>('button[data-do]').forEach((b) => {
    const run = handlers[b.dataset.do!];
    if (run) b.addEventListener('click', run);
  });
}

/** Main menu, pause, fail and win screens. Plain HTML over the canvas. */
export class Overlays {
  private readonly menu: HTMLDivElement;
  private readonly paused: HTMLDivElement;
  private readonly failed: HTMLDivElement;
  private readonly won: HTMLDivElement;
  private readonly wonTime: HTMLElement;
  private readonly wonEnding: HTMLElement;
  private readonly wonBest: HTMLElement;
  private readonly wonBreakdown: HTMLElement;
  private readonly wonEarned: HTMLElement;
  private readonly wonBank: HTMLElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly ghostButton: HTMLButtonElement;
  private readonly playButton: HTMLButtonElement;
  private kind: OverlayKind = 'none';

  constructor(parent: HTMLElement, h: OverlayHandlers) {
    this.menu = el(
      'menu',
      `<div class="trucks" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
       <h1></h1>
       <div class="tagline">Run the convoy. Never touch the ground.</div>
       <div class="menu-buttons">
         <button type="button" class="primary" data-do="play">Play</button>
         <button type="button" data-do="levels">Levels</button>
         <button type="button" data-do="shop">Abilities</button>
         <button type="button" data-do="times">Best Times</button>
         <button type="button" data-do="settings">Settings</button>
         <button type="button" data-do="editor">Level Editor</button>
       </div>
       <div class="hint">Mouse and keyboard, or a gamepad (press A to play)</div>
       <div class="version"></div>`,
    );
    this.menu.querySelector('h1')!.textContent = GAME_TITLE;
    this.menu.querySelector('.version')!.textContent = `v${GAME_VERSION}`;
    this.playButton = this.menu.querySelector('[data-do="play"]')!;

    this.paused = el(
      'paused',
      `<h2>PAUSED</h2>
       <div class="menu-buttons">
         <button type="button" class="primary" data-do="resume">Resume</button>
         <button type="button" data-do="restart">Restart</button>
         <button type="button" data-do="ghost"></button>
         <button type="button" data-do="settings">Settings</button>
         <button type="button" data-do="shop">Abilities</button>
         <button type="button" data-do="levels">Levels</button>
         <button type="button" data-do="quit">Quit to menu</button>
       </div>`,
    );
    this.ghostButton = this.paused.querySelector('[data-do="ghost"]')!;

    this.failed = el('failed', `<h2>FAILED</h2><div class="hint">press any key</div>`);

    this.won = el(
      'won',
      `<h2>FINISHED</h2>
       <div class="hint ending hidden">That was the last road. Every level is open: go back for the times.</div>
       <div class="result"><span class="label">Time</span><span class="time"></span></div>
       <div class="result small"><span class="label">Best</span><span class="best"></span></div>
       <div class="breakdown"></div>
       <div class="result small"><span class="label">Points</span><span class="earned"></span></div>
       <div class="hint bank"></div>
       <div class="buttons">
         <button type="button" class="primary" data-do="next">Next</button>
         <button type="button" data-do="restart">Retry</button>
         <button type="button" data-do="raceGhost">Race Ghost</button>
         <button type="button" data-do="quit">Menu</button>
       </div>
       <div class="hint"><kbd>Enter</kbd> next &nbsp; <kbd>R</kbd> retry</div>`,
    );
    this.wonTime = this.won.querySelector('.time')!;
    this.wonEnding = this.won.querySelector('.ending')!;
    this.wonBest = this.won.querySelector('.best')!;
    this.wonBreakdown = this.won.querySelector('.breakdown')!;
    this.wonEarned = this.won.querySelector('.earned')!;
    this.wonBank = this.won.querySelector('.bank')!;
    this.nextButton = this.won.querySelector('[data-do="next"]')!;

    const actions: Record<string, () => void> = {
      play: h.play,
      resume: h.resume,
      restart: h.restart,
      next: h.next,
      raceGhost: h.raceGhost,
      levels: h.levels,
      shop: h.shop,
      times: h.times,
      settings: h.settings,
      editor: h.editor,
      quit: h.quit,
      ghost: () => this.setGhost(h.toggleGhost()),
    };
    for (const root of [this.menu, this.paused, this.won]) wire(root, actions);
    parent.append(this.menu, this.paused, this.failed, this.won);
  }

  /** Label on the main menu's first button: "Play" for a new save, else the level it continues at. */
  setContinue(label: string): void {
    this.playButton.textContent = label;
  }

  setGhost(on: boolean): void {
    this.ghostButton.textContent = `Ghost: ${on ? 'own best' : 'off'}`;
  }

  /** `ending`: this was the last level of the campaign. */
  setWinResult(
    time: number,
    best: number,
    newBest: boolean,
    hasNext: boolean,
    ending = false,
  ): void {
    this.nextButton.disabled = !hasNext;
    this.won.querySelector('h2')!.textContent = ending ? 'SUMMIT REACHED' : 'FINISHED';
    this.wonEnding.classList.toggle('hidden', !ending);
    this.wonTime.textContent = formatTime(time);
    this.wonBest.textContent = formatTime(best) + (newBest ? '  NEW BEST' : '');
    this.wonBest.classList.toggle('new', newBest);
  }

  /** Points earned this attempt, per bonus, and the new bank balance. */
  setWinPoints(breakdown: readonly Bonus[], total: number, bank: number): void {
    this.wonBreakdown.replaceChildren(
      ...breakdown.map((b) => {
        const row = document.createElement('div');
        const name = document.createElement('span');
        name.textContent = b.kind;
        const pts = document.createElement('span');
        pts.textContent = `+${b.points}`;
        row.append(name, pts);
        return row;
      }),
    );
    this.wonEarned.textContent = `+${total}`;
    this.wonBank.textContent = `Bank: ${bank.toLocaleString('en-US')} points`;
  }

  show(kind: OverlayKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.menu.classList.toggle('hidden', kind !== 'menu');
    this.paused.classList.toggle('hidden', kind !== 'paused');
    this.failed.classList.toggle('hidden', kind !== 'failed');
    this.won.classList.toggle('hidden', kind !== 'won');
  }
}
