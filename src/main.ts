import { CapsuleGeometry, Mesh, MeshBasicMaterial, Vector3, WebGLRenderer } from 'three';
import { AudioEngine } from './audio/engine';
import { Music } from './audio/music';
import { Sfx } from './audio/sfx';
import { ABILITIES, type AbilityId, abilityInfo } from './config/abilities';
import { GAME_TITLE } from './config/meta';
import { TUNING } from './config/tuning';
import { Input } from './core/input';
import { GameLoop } from './core/loop';
import { claimWorldClear, loadSave, recordTime, storeSave } from './core/save';
import { Sim } from './core/sim';
import { Particles } from './fx/particles';
import { SpeedLines } from './fx/speedLines';
import { LEVELS, LEVEL_ENTRIES, findLevel } from './level/levels';
import { campaignLevels, isUnlocked, nextCampaignLevel } from './level/progress';
import type { LevelDef } from './level/schema';
import { initPhysics } from './physics/world';
import { CameraRig } from './player/camera';
import type { MoveInput } from './player/movement';
import { AbilityFx } from './render/abilityFx';
import { LevelScene } from './render/levelScene';
import { PALETTE } from './render/palette';
import { TruckRenderer } from './render/truckMesh';
import { type GhostPlayer, GhostRecorder, loadGhost, storeGhost } from './replay/ghost';
import { BestTimes } from './ui/bestTimes';
import { DebugOverlay } from './ui/debugOverlay';
import { Hud } from './ui/hud';
import { LevelSelect } from './ui/levelSelect';
import { Overlays } from './ui/overlays';
import { SettingsScreen } from './ui/settingsScreen';
import { Shop } from './ui/shop';

/**
 * menu:     main menu, nothing simulated
 * playing:  attempt in progress (mouse captured, or a gamepad in use)
 * paused:   attempt frozen
 * failed:   attempt over, world keeps moving, any key restarts
 * won:      attempt over, result shown
 * levels / shop / settings / times: sub-screens that return to where they were opened from
 */
type AppState =
  'menu' | 'playing' | 'paused' | 'failed' | 'won' | 'levels' | 'shop' | 'settings' | 'times';

/** Everything that belongs to one loaded level and is replaced when switching. */
interface Loaded {
  sim: Sim;
  scene: LevelScene;
  truckRenderer: TruckRenderer;
  particles: Particles;
  abilityFx: AbilityFx;
  ghostMesh: Mesh;
  ghost: GhostPlayer | null;
}

/** How long to wait for the browser to grant mouse capture before showing "paused". */
const LOCK_WAIT_MS = 600;
/** How long the first-level help line stays up (seconds of play). */
const HINT_SECONDS = 9;
const J = TUNING.juice;

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  // ?seed=123 fixes driver noise, ?god=1 disables death, ?debug=1 opens the overlay,
  // ?autostart=1 skips the menu and runs without pointer lock (automated checks).
  const seed = seedParam !== null && seedParam !== '' ? Number(seedParam) >>> 0 : undefined;
  const autostart = params.get('autostart') === '1';
  const god = params.get('god') === '1';
  // ?level=1-3 jumps straight to a level (test levels: single, convoy, block, hazards).
  const levelParam = params.get('level');
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
  const settings = save.settings;
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

  // ?unlock=1 opens every level (testing).
  const unlockAll = params.get('unlock') === '1';
  const unlocked = (id: string): boolean => {
    const level = findLevel(id);
    return !!level && (unlockAll || isUnlocked(level, LEVELS, save.bestTimes));
  };
  /** Where "Play" goes: the first open campaign level that has not been finished, else the first level. */
  const continueLevel = (): LevelDef | undefined => {
    const campaign = campaignLevels(LEVELS);
    return (
      campaign.find((l) => save.bestTimes[l.id] === undefined && unlocked(l.id)) ??
      campaign[0] ??
      LEVELS[0]
    );
  };
  const firstLevel =
    (levelParam ? findLevel(levelParam) : undefined) ?? continueLevel() ?? findLevel('test-convoy');
  if (!firstLevel) throw new Error('No valid level files found');

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  const speedLines = new SpeedLines(rig.camera);
  const input = new Input(canvas);
  const audio = new AudioEngine();
  const music = new Music(audio);
  const sfx = new Sfx(audio);
  const hud = new Hud(ui);
  const recorder = new GhostRecorder();
  const ghostGeo = new CapsuleGeometry(
    TUNING.player.radius,
    TUNING.player.height - TUNING.player.radius * 2,
    4,
    10,
  );
  const ghostMat = new MeshBasicMaterial({
    color: PALETTE.ghost,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });

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
    // The camera carries the speed lines, so it has to be in the scene to be drawn.
    scene.scene.add(rig.camera);
    const ghostMesh = new Mesh(ghostGeo, ghostMat);
    ghostMesh.visible = false;
    scene.scene.add(ghostMesh);
    hud.setLevel(level.id, level.name);
    music.setWorld(level.world);
    const particles = new Particles(scene.scene);
    particles.density = settings.quality === 'low' ? TUNING.quality.lowParticles : 1;
    return {
      sim,
      scene,
      truckRenderer: new TruckRenderer(scene.scene, sim.trucks.length),
      particles,
      abilityFx: new AbilityFx(scene.scene),
      ghostMesh,
      ghost: loadGhost(storage, level.id),
    };
  };
  let game = build(firstLevel);

  let state: AppState = autostart ? 'playing' : 'menu';
  /** Where a sub-screen goes back to. */
  let returnTo: AppState = 'menu';
  let lockWaitUntil = 0;
  let failedAt = 0;
  let wasGrounded = true;
  let lastRestartMs = 0;
  let restarts = 0;
  let winSlowLeft = 0;
  let nextHorn = J.hornMin;
  let lastInput: MoveInput = input.sample();

  /** Push the saved settings into everything that uses them. Called at start and on every change. */
  const applySettings = () => {
    rig.baseFov = settings.fov;
    rig.shakeEnabled = settings.shake;
    input.sensitivity = settings.sensitivity;
    input.invertY = settings.invertY;
    input.padSensitivityX = settings.padSensitivityX;
    input.padSensitivityY = settings.padSensitivityY;
    input.padDeadzone = settings.padDeadzone;
    input.bindings = settings.bindings;
    audio.setVolumes(settings.master, settings.music, settings.sfx);
    // Quality: resolution, speed lines and particle count. Nothing else is expensive.
    const cap = settings.quality === 'low' ? 1 : settings.quality === 'medium' ? 1.5 : 2;
    // Low also renders below native resolution, which is the biggest saving on weak graphics.
    const scale = settings.quality === 'low' ? TUNING.quality.lowRenderScale : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap) * scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    speedLines.enabled = settings.quality !== 'low';
    game.particles.density = settings.quality === 'low' ? TUNING.quality.lowParticles : 1;
  };

  /** Face the way the truck under the player is heading. */
  const faceForward = () => {
    const t = game.sim.player.groundTruck ?? game.sim.trucks[0];
    const fwd = new Vector3(0, 0, 1).applyQuaternion(t.rot);
    input.yaw = Math.atan2(-fwd.x, -fwd.z);
    input.pitch = 0;
  };
  faceForward();

  const captureMouse = () => {
    // With a gamepad there is no mouse to capture.
    if (autostart || input.locked || input.padActive) return;
    lockWaitUntil = performance.now() + LOCK_WAIT_MS;
    input.requestLock();
  };
  const releaseMouse = () => {
    if (input.locked) document.exitPointerLock();
  };

  const beginAttempt = () => {
    hud.clearPopups();
    recorder.reset();
    faceForward();
    wasGrounded = true;
    winSlowLeft = 0;
    input.consumeAnyPress();
    state = 'playing';
    captureMouse();
  };

  /** New attempt. Nothing is rebuilt or reloaded: pooled bodies are reset in place. */
  const restart = () => {
    audio.start();
    const t0 = performance.now();
    game.sim.reset();
    lastRestartMs = performance.now() - t0;
    restarts++;
    beginAttempt();
  };

  /** Switch level: the old physics world and meshes are freed, then a new attempt starts. */
  const loadLevel = (level: LevelDef) => {
    audio.start();
    // The camera and the ghost are shared between levels: take them out before freeing the rest.
    game.scene.scene.remove(rig.camera, game.ghostMesh);
    game.scene.dispose();
    game.sim.dispose();
    game = build(level);
    beginAttempt();
  };
  const nextLevel = (): LevelDef | undefined => nextCampaignLevel(game.sim.level, LEVELS);

  /** Leave a sub-screen. */
  const back = () => {
    levelSelect.show(false, save, game.sim.level.id);
    shop.show(false);
    settingsScreen.show(false);
    bestTimes.show(false, save);
    state = returnTo;
  };
  /** Open a sub-screen from the menu, the pause screen or the win screen. */
  const open = (screen: 'levels' | 'shop' | 'settings' | 'times') => {
    sfx.ui();
    releaseMouse();
    if (state === 'menu' || state === 'paused' || state === 'won') returnTo = state;
    else if (state === 'playing') returnTo = 'paused';
    state = screen;
    if (screen === 'levels') levelSelect.show(true, save, game.sim.level.id);
    if (screen === 'shop') shop.show(true);
    if (screen === 'settings') settingsScreen.show(true);
    if (screen === 'times') bestTimes.show(true, save);
  };

  const debug = new DebugOverlay(ui);
  if (params.get('debug') === '1') debug.toggle(true);

  const play = () => {
    audio.start();
    sfx.ui();
    // Play continues the campaign; if that level is already loaded, just start it.
    const level = continueLevel();
    if (level && level.id !== game.sim.level.id && !levelParam) loadLevel(level);
    else restart();
  };
  const overlays = new Overlays(ui, {
    play,
    resume: () => {
      audio.start();
      state = 'playing';
      captureMouse();
    },
    restart,
    next: () => {
      const next = nextLevel();
      if (next) loadLevel(next);
    },
    raceGhost: () => {
      settings.ghost = true;
      overlays.setGhost(true);
      persist();
      restart();
    },
    toggleGhost: () => {
      settings.ghost = !settings.ghost;
      persist();
      return settings.ghost;
    },
    levels: () => open('levels'),
    shop: () => open('shop'),
    times: () => open('times'),
    settings: () => open('settings'),
    quit: () => {
      sfx.ui();
      releaseMouse();
      state = 'menu';
    },
  });
  overlays.setGhost(settings.ghost);

  const levelSelect = new LevelSelect(
    ui,
    LEVEL_ENTRIES,
    (id) => {
      const level = findLevel(id);
      if (!level || !unlocked(id)) return;
      levelSelect.show(false, save, id);
      loadLevel(level);
    },
    unlocked,
    back,
  );
  const shop = new Shop(
    ui,
    save,
    () => {
      // Bought or (un)equipped: save, and apply to the level that is loaded right now.
      persist();
      game.sim.abilities.equip('movement', equippedId('movement'));
      game.sim.abilities.equip('utility', equippedId('utility'));
    },
    back,
  );
  const settingsScreen = new SettingsScreen(
    ui,
    settings,
    input,
    () => {
      applySettings();
      overlays.setGhost(settings.ghost);
      persist();
    },
    back,
  );
  const bestTimes = new BestTimes(ui, campaignLevels(LEVELS), back);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    rig.camera.aspect = window.innerWidth / window.innerHeight;
    rig.camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  applySettings();
  resize();
  // Any click on a button gives a click sound and wakes the audio.
  ui.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) {
      audio.start();
      sfx.ui();
    }
  });

  const ghostPose = { x: 0, y: 0, z: 0, yaw: 0 };

  const loop = new GameLoop({
    // The world keeps moving behind the fail and win screens.
    isRunning: () => state === 'playing' || state === 'failed' || state === 'won',
    // Slow-motion abilities and the moment after a win slow the world; mouse look stays real-time.
    timeScale: () => Math.min(game.sim.timeScale, winSlowLeft > 0 ? J.winSlowScale : 1),
    step: () => {
      const { sim, particles } = game;
      const p = sim.player;
      lastInput = input.sample();
      sim.step(lastInput);

      if (sim.state === 'playing') {
        recorder.record(sim.time, p.pos.x, p.pos.y, p.pos.z, lastInput.yaw);
        if (p.jumped || p.airJumped) sfx.jump();
        if (p.grounded && !wasGrounded) {
          rig.onLanding(p.landingImpact);
          sfx.land(p.landingImpact);
          if (p.landingImpact > J.hardLanding) {
            rig.addShake(((p.landingImpact - J.hardLanding) / J.hardLanding) * J.hardLandingShake);
          }
        }
      }
      wasGrounded = p.grounded;

      for (const e of sim.events) {
        if (e.type === 'explosion') {
          const distance = e.pos.distanceTo(p.pos);
          particles.burst(e.pos);
          rig.onExplosion(distance);
          sfx.explosion(distance);
        } else if (e.type === 'bonus') {
          hud.popBonus(e.bonus);
          sfx.bonus();
        } else if (e.type === 'failed') {
          state = 'failed';
          failedAt = performance.now();
          sfx.fail();
        } else if (e.type === 'won') {
          state = 'won';
          winSlowLeft = J.winSlowTime;
          sfx.win();
          const newBest = recordTime(save, sim.level.id, e.time);
          if (newBest && storeGhost(storage, sim.level.id, recorder.samples)) {
            game.ghost = loadGhost(storage, sim.level.id);
          }
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
          releaseMouse();
        }
      }
    },
    render: (alpha, dt) => {
      const { sim, scene, truckRenderer, particles, abilityFx, ghostMesh, ghost } = game;
      const frame = Math.min(dt, TUNING.loop.maxFrameTime);
      input.pollGamepad(frame, state === 'playing' || state === 'failed' || state === 'won');
      if (winSlowLeft > 0) winSlowLeft -= frame;

      if (input.consume('debug')) debug.toggle();
      if (input.consume('mute')) audio.toggleMusicMute();

      // Losing the mouse during play (Esc, alt-tab) pauses. A gamepad needs no mouse.
      const waitingForLock = performance.now() < lockWaitUntil;
      const needsMouse = !autostart && !input.padActive;
      if (state === 'playing' && needsMouse && !input.locked && !waitingForLock) state = 'paused';

      const restartKey = input.consume('restart');
      const confirm = input.consume('confirm');
      const pauseKey = input.consume('pause');
      if (state === 'failed') {
        const ready = performance.now() - failedAt >= TUNING.ui.failInputDelay * 1000;
        const any = input.consumeAnyPress();
        if (ready && (any || restartKey || confirm)) restart();
      } else if (state === 'won') {
        if (restartKey) restart();
        else if (confirm) {
          const next = nextLevel();
          if (next) loadLevel(next);
          else restart();
        }
      } else if (state === 'playing') {
        if (restartKey) restart();
        else if (pauseKey) {
          releaseMouse();
          state = 'paused';
        }
      } else if (state === 'paused') {
        if (pauseKey || confirm) {
          state = 'playing';
          captureMouse();
        } else if (restartKey) restart();
      } else if (state === 'menu') {
        if (confirm) play();
      }

      overlays.show(
        state === 'menu' || state === 'paused' || state === 'failed' || state === 'won'
          ? state
          : state === 'playing'
            ? 'none'
            : 'other',
      );
      if (state === 'menu') {
        const next = continueLevel();
        const fresh = Object.keys(save.bestTimes).length === 0;
        overlays.setContinue(fresh || !next ? 'Play' : `Play  ${next.id}`);
      }

      const p = sim.player;
      const active = state === 'playing';
      const worldSpeed = Math.hypot(p.vel.x, p.vel.z);
      hud.setTime(sim.time);
      hud.setAbilities(sim.abilities.movement, sim.abilities.utility);
      hud.setSpeed(settings.speedReadout && active, worldSpeed);
      // First-time help: only on the very first level, only until it has been finished once.
      const newPlayer = sim.level.id === '1-1' && save.bestTimes['1-1'] === undefined;
      hud.setHint(
        active && newPlayer && sim.time < HINT_SECONDS
          ? 'Stay on the trucks: the ground ends the run. Run and jump forward to the green gate.  WASD move · Shift sprint · Space jump'
          : '',
      );
      ui.classList.toggle('in-game', state === 'playing' || state === 'failed' || state === 'won');
      ui.classList.toggle('letterbox', sim.cinematic && active);
      ui.classList.toggle('slowmo', !sim.cinematic && sim.timeScale < 1 && active);

      // Sound that follows the action.
      const under = p.groundTruck ?? p.lastTruck;
      const truckSpeed = under?.isSolid
        ? Math.hypot(under.body.linvel().x, under.body.linvel().z)
        : 0;
      sfx.ambience(truckSpeed, worldSpeed, -p.vel.y, active);
      if (active) {
        nextHorn -= frame;
        if (nextHorn <= 0) {
          nextHorn = J.hornMin + Math.random() * (J.hornMax - J.hornMin);
          let nearest = Infinity;
          for (const t of sim.trucks) {
            if (t.driving && t !== under) nearest = Math.min(nearest, t.pos.distanceTo(p.pos));
          }
          if (nearest < Infinity) sfx.horn(nearest);
        }
      }

      // Mouse look stays real-time even between physics steps.
      const view: MoveInput = { ...lastInput, yaw: input.yaw, pitch: input.pitch };
      rig.update(p, view, alpha, frame);
      speedLines.update(active ? worldSpeed : 0, frame);
      truckRenderer.update(sim.trucks, alpha);
      if (state === 'playing' || state === 'failed' || state === 'won') particles.update(frame);
      scene.update(rig.camera.position, alpha);
      abilityFx.update(sim, rig.camera.position, performance.now() / 1000);

      // Ghost of the best run, in step with the attempt clock.
      const showGhost = settings.ghost && active && !!ghost && ghost.at(sim.time, ghostPose);
      ghostMesh.visible = showGhost;
      if (showGhost) ghostMesh.position.set(ghostPose.x, ghostPose.y, ghostPose.z);

      renderer.render(scene.scene, rig.camera);
      debug.update(sim, loop, { lastRestartMs, restarts, audioStarts: audio.starts });
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
        get ghost() {
          return game.ghost;
        },
        loadLevel: (id: string) => {
          const level = findLevel(id);
          if (level) loadLevel(level);
        },
        input,
        rig,
        audio,
        music,
        settings,
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
