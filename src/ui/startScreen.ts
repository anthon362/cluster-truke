import { GAME_TITLE } from '../config/meta';

/** Click-to-play overlay; doubles as the pause screen until menus exist (M7). */
export class StartScreen {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement, onClick: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'start';
    this.el.innerHTML = `
      <h1></h1>
      <div class="go">Click to play</div>
      <div class="keys">
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move &nbsp; <kbd>Shift</kbd> sprint &nbsp;
        <kbd>Space</kbd> jump<br />
        <kbd>R</kbd> restart &nbsp; <kbd>Esc</kbd> pause &nbsp; <kbd>F3</kbd> debug
      </div>`;
    this.el.querySelector('h1')!.textContent = GAME_TITLE;
    this.el.addEventListener('click', onClick);
    parent.appendChild(this.el);
  }

  show(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
  }
}
