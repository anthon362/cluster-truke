import { Vector3, WebGLRenderer } from 'three';
import { Music } from './audio/music';
import { GAME_TITLE } from './config/meta';
import { TUNING } from './config/tuning';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { loadSave, recordTime, storeSave } from './core/save';
import { Sim } from './core/sim';
import { Particles } from './fx/particles';
import { LEVELS, LEVEL_ENTRIES, findLevel } from './level/levels';
import type { LevelDef } from './level/schema';
import { initPhysics } from './physics/world';
import { CameraRig } from './player/camera';
import type { MoveInput } from './player/movement';
import { LevelScene } from './render/levelScene';
import { TruckRenderer } from './render/truckMesh';
import { DebugOverlay } from './ui/debugOverlay';
import { Hud } from './ui/hud';
import { LevelSelect } from './ui/levelSelect';
import { Overlays } from './ui/overlays';

/**
 * start:   title overlay, nothing simulated yet
 * playing: attempt in progress (needs the mouse captured)
 * paused:  mouse released mid-attempt; simulation frozen
 * failed:  attempt over, world keeps moving, any key restarts
 * won:     attempt over, result shown, mouse released for the buttons
 * levels:  level list
 */
type AppState = 'start' | 'playing' | 'paused' | 'failed' | 'won' | 'levels';

/** Everything that belongs to one loaded level and is replaced when switching. */
interface Loaded {
  sim: Sim;
  scene: LevelScene;
  truckRenderer: TruckRenderer;
  particles: Particles;
}

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
  const god = params.get('god') === '1';
  // ?level=1-3 jumps straight to a level (test levels: single, convoy, block, hazards).
  const levelParam = params.get('level');
  const firstLevel =
    (levelParam ? findLevel(levelParam) : undefined) ??
    LEVELS.find((l) => /^\d+-\d+$/.test(l.id)) ??
    findLevel('test-convoy') ??
    LEVELS[0];
  if (!firstLevel) throw new Error('No valid level files found');
  if (levelParam && !findLevel(levelParam)) console.warn(`Unknown level "${levelParam}"`);

  await initPhysics();
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

  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  const input = new Input(canvas);
  const music = new Music();
  const hud = new Hud(ui);

  const build = (level: LevelDef): Loaded => {
    const sim = new Sim({ seed, god, level });
    const scene = new LevelScene(sim.level, sim.pool.paths.values(), sim.goal, sim.hazards);
    hud.setLevel(level.id, level.name);
    return {
      sim,
      scene,
      truckRenderer: new TruckRenderer(scene.scene, sim.trucks.length),
      particles: new Particles(scene.scene),
    };
  };
  let game = build(firstLevel);

  let state: AppState = autostart ? 'playing' : 'start';
  let lockWaitUntil = 0;
  let failedAt = 0;
  let wasGrounded = true;
  let lastRestartMs = 0;
  let restarts = 0;
  let lastInput: MoveInput = input.sample();

  /** Face the way the truck under the player is heading. */
  const faceForward = () => {
    const t = game.sim.player.groundTruck ?? game.sim.trucks[0];
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
    game.sim.reset();
    lastRestartMs = performance.now() - t0;
    restarts++;
    faceForward();
    wasGrounded = true;
    input.consumeAnyPress();
    state = 'playing';
    captureMouse();
  };

  /** Switch level: the old physics world and meshes are freed, then a new attempt starts. */
  const loadLevel = (level: LevelDef) => {
    game.scene.dispose();
    game.sim.dispose();
    game = build(level);
    faceForward();
    wasGrounded = true;
    input.consumeAnyPress();
    state = 'playing';
    captureMouse();
  };
  const nextLevel = (): LevelDef | undefined => {
    const i = LEVELS.findIndex((l) => l.id === game.sim.level.id);
    const next = LEVELS[i + 1];
    // Do not roll from the campaign into the test levels (or between worlds of tests).
    return next && next.world === game.sim.level.world ? next : undefined;
  };

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
    next: () => {
      const next = nextLevel();
      if (next) loadLevel(next);
    },
    levels: () => {
      if (input.locked) document.exitPointerLock();
      state = 'levels';
      levelSelect.show(true, save, game.sim.level.id);
    },
  });
  const levelSelect = new LevelSelect(ui, LEVEL_ENTRIES, (id) => {
    music.start();
    const level = findLevel(id);
    if (!level) return;
    levelSelect.show(false, save, id);
    loadLevel(level);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' || state !== 'won') return;
    const next = nextLevel();
    if (next) loadLevel(next);
    else restart();
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
      const { sim, particles } = game;
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
          overlays.setWinResult(e.time, save.bestTimes[sim.level.id], newBest, !!nextLevel());
          // Free the mouse for the buttons.
          if (input.locked) document.exitPointerLock();
        }
      }
    },
    render: (alpha, dt) => {
      const { sim, scene, truckRenderer, particles } = game;
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
      if (state !== 'paused' && state !== 'start' && state !== 'levels') {
        particles.update(Math.min(dt, TUNING.loop.maxFrameTime));
      }
      scene.update(rig.camera.position, alpha);
      renderer.render(scene.scene, rig.camera);
      debug.update(sim, loop, { lastRestartMs, restarts, musicStarts: music.starts });
    },
  });
  loop.start();

  if (import.meta.env.DEV) {
    // Handy in the browser console while tuning, and used by automated checks.
    Object.assign(window, {
      righop: {
        get sim() {
          return game.sim;
        },
        loadLevel: (id: string) => {
          const level = findLevel(id);
          if (level) loadLevel(level);
        },
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
