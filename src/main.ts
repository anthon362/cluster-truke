import { Vector3, WebGLRenderer } from 'three';
import { Music } from './audio/music';
import { GAME_TITLE } from './config/meta';
import { TUNING } from './config/tuning';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { loadSave, recordTime, storeSave } from './core/save';
import { Sim } from './core/sim';
import { Particles } from './fx/particles';
import { convoyTestLevel, singleTruckLevel } from './level/testLevels';
import { initPhysics } from './physics/world';
import { CameraRig } from './player/camera';
import type { MoveInput } from './player/movement';
import { LevelScene } from './render/levelScene';
import { TruckRenderer } from './render/truckMesh';
import { DebugOverlay } from './ui/debugOverlay';
import { Hud } from './ui/hud';
import { Overlays } from './ui/overlays';

/**
 * start:   title overlay, nothing simulated yet
 * playing: attempt in progress (needs the mouse captured)
 * paused:  mouse released mid-attempt; simulation frozen
 * failed:  attempt over, world keeps moving, any key restarts
 * won:     attempt over, result shown, mouse released for the buttons
 */
type AppState = 'start' | 'playing' | 'paused' | 'failed' | 'won';

/** How long to wait for the browser to grant mouse capture before showing "paused". */
const LOCK_WAIT_MS = 600;

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
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })();
  const save = loadSave(storage);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new LevelScene(sim.level, sim.pool.paths.values(), sim.goal);
  const truckRenderer = new TruckRenderer(scene.scene, sim.trucks.length);
  const particles = new Particles(scene.scene);
  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  const input = new Input(canvas);
  const music = new Music();

  let state: AppState = autostart ? 'playing' : 'start';
  let lockWaitUntil = 0;
  let failedAt = 0;
  let wasGrounded = true;
  let lastRestartMs = 0;
  let restarts = 0;
  let lastInput: MoveInput = input.sample();

  /** Face the way the truck under the player is heading. */
  const faceForward = () => {
    const t = sim.player.groundTruck ?? sim.trucks[0];
    const fwd = new Vector3(0, 0, 1).applyQuaternion(t.rot);
    input.yaw = Math.atan2(-fwd.x, -fwd.z);
    input.pitch = 0;
  };
  faceForward();

  const captureMouse = () => {
    if (autostart || input.locked) return;
    lockWaitUntil = performance.now() + LOCK_WAIT_MS;
    input.requestLock();
  };

  /** New attempt. Nothing is rebuilt or reloaded: pooled bodies are reset in place. */
  const restart = () => {
    const t0 = performance.now();
    sim.reset();
    lastRestartMs = performance.now() - t0;
    restarts++;
    faceForward();
    wasGrounded = true;
    input.consumeAnyPress();
    state = 'playing';
    captureMouse();
  };

  const hud = new Hud(ui);
  const debug = new DebugOverlay(ui);
  if (params.get('debug') === '1') debug.toggle(true);
  const overlays = new Overlays(ui, {
    play: () => {
      music.start();
      if (state === 'start' || state === 'paused') {
        state = 'playing';
        captureMouse();
      }
    },
    retry: () => {
      music.start();
      restart();
    },
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && state === 'won') restart();
  });

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    rig.camera.aspect = window.innerWidth / window.innerHeight;
    rig.camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const loop = new GameLoop({
    // The world keeps moving behind the fail and win screens.
    isRunning: () => state === 'playing' || state === 'failed' || state === 'won',
    step: () => {
      lastInput = input.sample();
      sim.step(lastInput);
      if (sim.state === 'playing' && sim.player.grounded && !wasGrounded) {
        rig.onLanding(sim.player.landingImpact);
      }
      wasGrounded = sim.player.grounded;
      for (const e of sim.events) {
        if (e.type === 'explosion') {
          particles.burst(e.pos);
          rig.onExplosion(e.pos.distanceTo(sim.player.pos));
        } else if (e.type === 'failed') {
          state = 'failed';
          failedAt = performance.now();
        } else if (e.type === 'won') {
          state = 'won';
          const newBest = recordTime(save, sim.level.id, e.time);
          if (newBest) storeSave(storage, save);
          overlays.setWinResult(e.time, save.bestTimes[sim.level.id], newBest);
          // Free the mouse for the buttons.
          if (input.locked) document.exitPointerLock();
        }
      }
    },
    render: (alpha, dt) => {
      if (input.consume('debug')) debug.toggle();
      if (input.consume('mute')) music.toggleMute();

      // Mouse released during play (Esc, alt-tab) pauses; getting it back resumes.
      const waitingForLock = performance.now() < lockWaitUntil;
      if (state === 'playing' && !autostart && !input.locked && !waitingForLock) state = 'paused';

      const restartKey = input.consume('restart');
      if (state === 'failed') {
        const ready = performance.now() - failedAt >= TUNING.ui.failInputDelay * 1000;
        const any = input.consumeAnyPress();
        if (ready && (any || restartKey)) restart();
      } else if (restartKey && (state === 'playing' || state === 'won')) {
        restart();
      }

      overlays.show(state === 'playing' ? 'none' : state);
      hud.setTime(sim.time);

      // Mouse look stays real-time even between physics steps.
      const view: MoveInput = { ...lastInput, yaw: input.yaw, pitch: input.pitch };
      rig.update(sim.player, view, alpha, Math.min(dt, TUNING.loop.maxFrameTime));
      truckRenderer.update(sim.trucks, alpha);
      if (state !== 'paused' && state !== 'start') {
        particles.update(Math.min(dt, TUNING.loop.maxFrameTime));
      }
      scene.update(rig.camera.position);
      renderer.render(scene.scene, rig.camera);
      debug.update(sim, loop, { lastRestartMs, restarts, musicStarts: music.starts });
    },
  });
  loop.start();

  if (import.meta.env.DEV) {
    // Handy in the browser console while tuning, and used by automated checks.
    Object.assign(window, {
      righop: {
        sim,
        input,
        rig,
        music,
        TUNING,
        restart,
        get state() {
          return state;
        },
        get lastRestartMs() {
          return lastRestartMs;
        },
      },
    });
  }
}

boot().catch((err) => {
  console.error(err);
  document.body.textContent = `Failed to start: ${err}`;
});
