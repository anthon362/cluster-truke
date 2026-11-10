import { Vector3, WebGLRenderer } from 'three';
import { Music } from './audio/music';
import { ABILITIES, type AbilityId, abilityInfo } from './config/abilities';
import { GAME_TITLE } from './config/meta';
import { TUNING } from './config/tuning';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { claimWorldClear, loadSave, recordTime, storeSave } from './core/save';
import { Sim } from './core/sim';
import { Particles } from './fx/particles';
import { LEVELS, LEVEL_ENTRIES, findLevel } from './level/levels';
import type { LevelDef } from './level/schema';
import { initPhysics } from './physics/world';
import { CameraRig } from './player/camera';
import type { MoveInput } from './player/movement';
import { AbilityFx } from './render/abilityFx';
import { LevelScene } from './render/levelScene';
import { TruckRenderer } from './render/truckMesh';
import { DebugOverlay } from './ui/debugOverlay';
import { Hud } from './ui/hud';
import { LevelSelect } from './ui/levelSelect';
import { Overlays } from './ui/overlays';
import { Shop } from './ui/shop';

/**
 * start:   title overlay, nothing simulated yet
 * playing: attempt in progress (needs the mouse captured)
 * paused:  mouse released mid-attempt; simulation frozen
 * failed:  attempt over, world keeps moving, any key restarts
 * won:     attempt over, result shown, mouse released for the buttons
 * levels:  level list
 * shop:    ability shop
 */
type AppState = 'start' | 'playing' | 'paused' | 'failed' | 'won' | 'levels' | 'shop';

/** Everything that belongs to one loaded level and is replaced when switching. */
interface Loaded {
  sim: Sim;
  scene: LevelScene;
  truckRenderer: TruckRenderer;
  particles: Particles;
  abilityFx: AbilityFx;
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
  // ?abilities=all: every ability is owned for this session (testing). Nothing is saved while it is on.
  const allAbilities = params.get('abilities') === 'all';
  if (allAbilities) save.owned = ABILITIES.map((a) => a.id);
  // ?equip=towLine,slowLane: start with these equipped (they must be owned or unlocked as above).
  for (const id of (params.get('equip') ?? '').split(',')) {
    const info = abilityInfo(id.trim());
    if (info && save.owned.includes(info.id)) save.equipped[info.slot] = info.id;
  }
  const persist = () => {
    if (!allAbilities) storeSave(storage, save);
  };
  const equippedId = (slot: 'movement' | 'utility'): AbilityId | null => {
    const info = abilityInfo(save.equipped[slot] ?? '');
    return info && info.slot === slot ? info.id : null;
  };

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  const input = new Input(canvas);
  const music = new Music();
  const hud = new Hud(ui);

  const attempted = new Set<string>();
  const build = (level: LevelDef): Loaded => {
    // The first-try bonus is once per level per session, however the level is reached.
    const sim = new Sim({
      seed,
      god,
      level,
      firstTry: !attempted.has(level.id),
      movement: equippedId('movement'),
      utility: equippedId('utility'),
    });
    attempted.add(level.id);
    const scene = new LevelScene(sim.level, sim.pool.paths.values(), sim.goal, sim.hazards);
    hud.setLevel(level.id, level.name);
    return {
      sim,
      scene,
      truckRenderer: new TruckRenderer(scene.scene, sim.trucks.length),
      particles: new Particles(scene.scene),
      abilityFx: new AbilityFx(scene.scene),
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
    hud.clearPopups();
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
    hud.clearPopups();
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
    shop: () => {
      if (input.locked) document.exitPointerLock();
      shopReturn = state === 'won' ? 'won' : state === 'start' ? 'start' : 'paused';
      state = 'shop';
      shop.show(true);
    },
  });
  let shopReturn: AppState = 'start';
  const shop = new Shop(
    ui,
    save,
    () => {
      // Bought or (un)equipped: save, and apply to the level that is loaded right now.
      persist();
      game.sim.abilities.equip('movement', equippedId('movement'));
      game.sim.abilities.equip('utility', equippedId('utility'));
    },
    () => {
      shop.show(false);
      state = shopReturn;
    },
  );
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
    // Slow-motion abilities slow the world; mouse look stays real-time.
    timeScale: () => game.sim.timeScale,
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
        } else if (e.type === 'bonus') {
          hud.popBonus(e.bonus);
        } else if (e.type === 'failed') {
          state = 'failed';
          failedAt = performance.now();
        } else if (e.type === 'won') {
          state = 'won';
          const newBest = recordTime(save, sim.level.id, e.time);
          // One-time bonus when this win completes the world.
          const world = sim.level.world;
          const worldIds = LEVELS.filter((l) => l.world === world).map((l) => l.id);
          if (world !== 'test' && claimWorldClear(save, world, worldIds)) {
            hud.popBonus(sim.score.worldClear());
          }
          // Points are banked only now, on finishing.
          save.points += sim.score.total;
          persist();
          overlays.setWinPoints(sim.score.breakdown(), sim.score.total, save.points);
          overlays.setWinResult(e.time, save.bestTimes[sim.level.id], newBest, !!nextLevel());
          // Free the mouse for the buttons.
          if (input.locked) document.exitPointerLock();
        }
      }
    },
    render: (alpha, dt) => {
      const { sim, scene, truckRenderer, particles, abilityFx } = game;
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
      hud.setAbilities(sim.abilities.movement, sim.abilities.utility);
      ui.classList.toggle('letterbox', sim.cinematic && state === 'playing');
      ui.classList.toggle('slowmo', !sim.cinematic && sim.timeScale < 1 && state === 'playing');

      // Mouse look stays real-time even between physics steps.
      const view: MoveInput = { ...lastInput, yaw: input.yaw, pitch: input.pitch };
      rig.update(sim.player, view, alpha, Math.min(dt, TUNING.loop.maxFrameTime));
      truckRenderer.update(sim.trucks, alpha);
      if (state === 'playing' || state === 'failed' || state === 'won') {
        particles.update(Math.min(dt, TUNING.loop.maxFrameTime));
      }
      scene.update(rig.camera.position, alpha);
      abilityFx.update(sim, rig.camera.position, performance.now() / 1000);
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
