import { TUNING } from '../config/tuning';
import type { GameLoop } from '../core/loop';
import type { Sim } from '../core/sim';

/** F3 overlay: fps, physics step time, bodies, player speed, seed. */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  visible = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'debug hidden';
    parent.appendChild(this.el);
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
  }

  update(
    sim: Sim,
    loop: GameLoop,
    app: { lastRestartMs: number; restarts: number; musicStarts: number },
  ): void {
    if (!this.visible) return;
    const p = sim.player;
    const over = loop.stepMs > TUNING.loop.stepBudgetMs;
    const world = Math.hypot(p.vel.x, p.vel.z);
    const lines = [
      `fps         ${loop.fps.toFixed(0)}`,
      `step        ${loop.stepMs.toFixed(2)} ms${over ? '  OVER BUDGET' : ''}`,
      `bodies      ${sim.physics.activeBodyCount} active / ${sim.physics.bodyCount}`,
      `trucks      ${count(sim, 'driving')} driving, ${count(sim, 'wreck')} wrecks, ${count(sim, 'gone')} gone, ${sim.explosions} explosions`,
      `speed       ${p.relativeSpeed.toFixed(1)} m/s on truck, ${world.toFixed(1)} m/s world`,
      `vertical    ${p.vel.y.toFixed(1)} m/s`,
      `player      ${p.grounded ? 'grounded' : p.clinging ? 'clinging' : 'air'}`,
      `attempt     #${sim.attempts} ${sim.state}${sim.failReason ? ` (${sim.failReason})` : ''}, ${sim.falls} fails`,
      `restart     ${app.lastRestartMs.toFixed(2)} ms last, ${app.restarts} total, music started ${app.musicStarts}x`,
      `level       ${sim.level.id}`,
      `time        ${sim.time.toFixed(2)} s`,
      `seed        ${sim.seed}${sim.god ? '  GOD' : ''}`,
    ];
    this.el.textContent = lines.join('\n');
    this.el.classList.toggle('warn', over);
  }
}

function count(sim: Sim, what: 'driving' | 'wreck' | 'gone'): number {
  let n = 0;
  for (const t of sim.trucks) {
    if (what === 'driving' ? t.driving : t.state === what) n++;
  }
  return n;
}
