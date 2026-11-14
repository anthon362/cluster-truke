import { Vector3, WebGLRenderer } from 'three';
import { GAME_TITLE } from './config/meta';
import { TUNING } from './config/tuning';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { Sim } from './core/sim';
import { initPhysics } from './physics/world';
import { CameraRig } from './player/camera';
import type { MoveInput } from './player/movement';
import { Particles } from './fx/particles';
import { convoyTestLevel, singleTruckLevel } from './level/testLevels';
import { LevelScene } from './render/levelScene';
import { TruckRenderer } from './render/truckMesh';
import { DebugOverlay } from './ui/debugOverlay';
import { StartScreen } from './ui/startScreen';

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  // ?seed=123 fixes driver noise, ?god=1 disables death, ?debug=1 opens the overlay,
  // ?autostart=1 runs without pointer lock (automated checks).
  const seed = seedParam !== null && seedParam !== '' ? Number(seedParam) >>> 0 : undefined;
  const autostart = params.get('autostart') === '1';

  // Until the level select exists (M4): ?level=single | convoy | block.
  const levelParam = params.get('level') ?? 'convoy';
  const level =
    levelParam === 'single' ? singleTruckLevel() : convoyTestLevel(levelParam === 'block');

  await initPhysics();
  const sim = new Sim({ seed, god: params.get('god') === '1', level });

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new LevelScene(sim.level, sim.pool.paths.values());
  const truckRenderer = new TruckRenderer(scene.scene, sim.trucks.length);
  const particles = new Particles(scene.scene);

  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  const input = new Input(canvas);
  /** Face the way the truck under the player is heading. */
  const faceForward = () => {
    const t = sim.player.groundTruck ?? sim.trucks[0];
    const fwd = new Vector3(0, 0, 1).applyQuaternion(t.rot);
    input.yaw = Math.atan2(-fwd.x, -fwd.z);
    input.pitch = 0;
  };
  faceForward();

  const crosshair = document.createElement('div');
  crosshair.className = 'crosshair';
  ui.appendChild(crosshair);
  const debug = new DebugOverlay(ui);
  if (params.get('debug') === '1') debug.toggle(true);
  const start = new StartScreen(ui, () => input.requestLock());

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    rig.camera.aspect = window.innerWidth / window.innerHeight;
    rig.camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const isRunning = () => autostart || input.locked;
  let lastInput: MoveInput = input.sample();
  let wasGrounded = true;

  const restart = () => {
    sim.reset();
    faceForward();
    wasGrounded = true;
  };

  const loop = new GameLoop({
    isRunning,
    step: () => {
      lastInput = input.sample();
      const fallsBefore = sim.falls;
      sim.step(lastInput);
      if (sim.falls !== fallsBefore) {
        // Fell off: M1 simply puts you back on the truck (fail screen arrives in M3).
        faceForward();
        wasGrounded = true;
      } else if (sim.player.grounded && !wasGrounded) {
        rig.onLanding(sim.player.landingImpact);
      }
      wasGrounded = sim.player.grounded;
      for (const e of sim.events) {
        if (e.type === 'explosion') {
          particles.burst(e.pos);
          rig.onExplosion(e.pos.distanceTo(sim.player.pos));
        }
      }
    },
    render: (alpha, dt) => {
      if (input.consume('debug')) debug.toggle();
      if (input.consume('restart') && isRunning()) restart();
      start.show(!isRunning());

      // Mouse look stays real-time even between physics steps.
      const view: MoveInput = { ...lastInput, yaw: input.yaw, pitch: input.pitch };
      rig.update(sim.player, view, alpha, Math.min(dt, TUNING.loop.maxFrameTime));
      truckRenderer.update(sim.trucks, alpha);
      if (isRunning()) particles.update(Math.min(dt, TUNING.loop.maxFrameTime));
      scene.update(rig.camera.position);
      renderer.render(scene.scene, rig.camera);
      debug.update(sim, loop);
    },
  });
  loop.start();

  if (import.meta.env.DEV) {
    // Handy in the browser console while tuning.
    Object.assign(window, { righop: { sim, input, rig, TUNING } });
  }
}

boot().catch((err) => {
  console.error(err);
  document.body.textContent = `Failed to start: ${err}`;
});
