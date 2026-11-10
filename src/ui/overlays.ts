import { GAME_TITLE } from '../config/meta';
import type { Bonus } from '../score/score';
import { formatTime } from './format';

export type OverlayKind = 'none' | 'start' | 'paused' | 'failed' | 'won' | 'levels';

const KEYS = `
  <div class="keys">
    <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>Shift</kbd> sprint &nbsp;
    <kbd>Space</kbd> jump<br />
    <kbd>R</kbd> restart &nbsp; <kbd>Esc</kbd> pause &nbsp; <kbd>M</kbd> mute &nbsp; <kbd>F3</kbd> debug
  </div>`;

/** Start, pause, fail and win screens. Plain HTML over the canvas. */
export class Overlays {
  private readonly start: HTMLDivElement;
  private readonly failed: HTMLDivElement;
  private readonly won: HTMLDivElement;
  private readonly wonTime: HTMLElement;
  private readonly wonBest: HTMLElement;
  private readonly wonBreakdown: HTMLElement;
  private readonly wonEarned: HTMLElement;
  private readonly wonBank: HTMLElement;
  private readonly startTitle: HTMLElement;
  private readonly startGo: HTMLElement;
  private kind: OverlayKind = 'none';

  private readonly nextButton: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    handlers: { play(): void; retry(): void; next(): void; levels(): void },
  ) {
    this.start = el(
      'start',
      `<h1></h1><div class="go"></div>${KEYS}
       <div class="buttons"><button type="button" class="pick">Levels</button></div>`,
    );
    this.start.querySelector('.pick')!.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.levels();
    });
    this.startTitle = this.start.querySelector('h1')!;
    this.startGo = this.start.querySelector('.go')!;
    this.start.addEventListener('click', handlers.play);

    this.failed = el('failed', `<h2>FAILED</h2><div class="hint">press any key</div>`);

    this.won = el(
      'won',
      `<h2>FINISHED</h2>
       <div class="result"><span class="label">Time</span><span class="time"></span></div>
       <div class="result small"><span class="label">Best</span><span class="best"></span></div>
       <div class="breakdown"></div>
       <div class="result small"><span class="label">Points</span><span class="earned"></span></div>
       <div class="hint bank"></div>
       <div class="buttons">
         <button type="button" class="next primary">Next</button>
         <button type="button" class="retry">Retry</button>
         <button type="button" class="pick">Levels</button>
       </div>
       <div class="hint"><kbd>Enter</kbd> next &nbsp; <kbd>R</kbd> retry</div>`,
    );
    this.wonTime = this.won.querySelector('.time')!;
    this.wonBest = this.won.querySelector('.best')!;
    this.wonBreakdown = this.won.querySelector('.breakdown')!;
    this.wonEarned = this.won.querySelector('.earned')!;
    this.wonBank = this.won.querySelector('.bank')!;
    this.nextButton = this.won.querySelector('.next')!;
    this.nextButton.addEventListener('click', handlers.next);
    this.won.querySelector('.retry')!.addEventListener('click', handlers.retry);
    this.won.querySelector('.pick')!.addEventListener('click', handlers.levels);

    parent.append(this.start, this.failed, this.won);
    this.show('start');
  }

  setWinResult(time: number, best: number, newBest: boolean, hasNext: boolean): void {
    this.nextButton.disabled = !hasNext;
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
    this.start.classList.toggle('hidden', kind !== 'start' && kind !== 'paused');
    this.failed.classList.toggle('hidden', kind !== 'failed');
    this.won.classList.toggle('hidden', kind !== 'won');
    if (kind === 'start') {
      this.startTitle.textContent = GAME_TITLE;
      this.startGo.textContent = 'Click to play';
    } else if (kind === 'paused') {
      this.startTitle.textContent = 'PAUSED';
      this.startGo.textContent = 'Click to resume';
    }
  }
}

function el(className: string, html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = `overlay ${className} hidden`;
  d.innerHTML = html;
  return d;
}
