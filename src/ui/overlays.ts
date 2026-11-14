import { GAME_TITLE } from '../config/meta';
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
       <div class="buttons">
         <button type="button" class="next primary">Next</button>
         <button type="button" class="retry">Retry</button>
         <button type="button" class="pick">Levels</button>
       </div>
       <div class="hint"><kbd>Enter</kbd> next &nbsp; <kbd>R</kbd> retry</div>`,
    );
    this.wonTime = this.won.querySelector('.time')!;
    this.wonBest = this.won.querySelector('.best')!;
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
