# Changelog

## 1.0.0 (M10) — Release

- Par times corrected on 16 levels. On levels with a short convoy the old par could not be
  reached without abilities (nobody can get ahead of the front row), and five pars were below
  the 15 s the design sets as the minimum.
- Release checks over the whole campaign: shape, par range, a fast scripted run under par on
  38 of 54 levels, and the simulation and restart cost of the largest level.
- `npm run package` builds a zip for static hosting or a game portal; `npm run check` runs
  everything.
- The version is shown on the main menu.

## M9 — Level editor

- A level editor in the browser (main menu, Level Editor): a top-down map with drag, pan and
  zoom, a settings panel for the selected thing, undo, and the game's own level check running
  as you edit.
- Every hazard and scenery box can be added; any level of the game can be opened as a copy.
- Play the level straight from the editor; export and import it as a JSON file in the same
  format as the built-in levels.
- Typing in a text field no longer triggers game keys.

## M8 (part 6) — World 9: THE SUMMIT and the finale

- New hazard `slide`: an avalanche that follows the road, buries the trucks it reaches and can
  change speed at set points.
- Six mountain levels: Foothills, Ridge Wind, First Slide, Cornice, Thin Air and the finale,
  The Avalanche: three stages with one avalanche behind you all the way, finished in under a
  minute.
- Lightning can be limited to a stretch of a level.
- An ending on the result screen after the last level.
- The campaign is complete: 9 worlds, 54 levels, each completed without abilities by a
  scripted player.

## M8 (part 5) — World 8: SKYLINE

- Six rooftop levels: Rooftops, Long Jump, Runaway Gate, Crane Line, Leapfrog, Last Roof, with
  their own palette and music loop. Blast plates throw the convoy across the gaps between
  buildings; a line of crane-carried trucks takes over where the roofs end.
- The goal can move: a gate with `speed` travels away along the road.
- Every level is completed without abilities.

## M8 (part 4) — World 7: FOUNDRY

- New hazards: `belt` (a boost belt: trucks speed up and keep the ground gained), `press`
  (comes down on one lane and flattens the truck under it) and `melt` (the floor floods on a
  countdown).
- Six foundry levels: Fast Lane, Stamping Line, Meltdown, Hot Press, Overflow, Furnace Line,
  with their own palette and music loop.
- Trucks can `surge`: a speed-up that moves their place in the formation forward.
- Scripted players change lane for presses and wait out stretched gaps; every level is
  completed without abilities.

## M8 (part 3) — World 6: STORMFRONT

- New hazards: `wind` (a crosswind, steady or in gusts, that carries jumps sideways) and
  `strike` (lightning that marks the truck you are on, then destroys it).
- Six storm levels: Crosswind, Gusts, Lightning, Squall, Thunderhead, Eye of the Storm, with
  their own palette and music loop.
- The HUD warning bar now also counts down to a lightning strike.
- Scripted players steer into the wind and leave marked trucks; every level is completed
  without abilities.

## M8 (part 2) — World 5: QUARRY

- New hazards: `pendulum` (a swinging wrecking weight, lethal to the player), `plate` (a blast
  plate that throws every truck that crosses it) and `boulder` (rolls after the convoy and
  wrecks what it reaches).
- Six quarry levels: Blast Plate, Kerb Jump, Swing, Rockfall, Quarry Run, Deep Cut, with their
  own palette and music loop. Rockfall and Deep Cut are the first levels that cannot be
  finished by standing still.
- A chase gauge on the HUD shows how far behind the boulder is, with camera shake when it is
  close.
- Scripted players dodge the weights with the same maths as the game; every level is completed
  without abilities.

## M8 (part 1) — World 4: NIGHT FREIGHT

- New hazard `beam`: light beams that are fixed, sweeping, spinning or blinking, lethal to
  the player only, drawn as glowing bars.
- Six night levels: Tripwire, High Beams, Sweep, Shutter, Turnstile, Night Shift, with their
  own palette and music loop.
- Scripted players for beams (jump, change lane, ride on the cab) that share the game's beam
  timing; every level is completed without abilities.

## Smaller download: physics WebAssembly as its own file

- Switched from `@dimforge/rapier3d-compat` (WebAssembly embedded in the JavaScript as text)
  to `@dimforge/rapier3d` (same engine and version, WebAssembly as a separate file), with
  `vite-plugin-wasm` as a build-time plugin.
- Download size: 5.03 MB to 4.06 MB, and about 1.85 MB to 1.40 MB gzipped. Load to menu on a
  local server: 342-439 ms before, 218-266 ms after.
- No gameplay change: all 153 tests pass unchanged.

## M7 — Polish, sound, menus

- Main menu (Play, Levels, Abilities, Best Times, Settings) and a pause menu (Resume, Restart,
  Ghost, Settings, Abilities, Levels, Quit). Play continues the campaign where you left off.
- Settings: field of view, camera shake, speed readout, ghost, quality, mouse sensitivity,
  invert Y, gamepad look speeds and dead zone, three volume sliders, and key rebinding.
  Everything applies at once and is saved (save format version 3).
- Gamepad: left stick move, right stick look with a response curve and dead zone, A jump,
  LB or L3 sprint, RT / LT abilities, Start pause, Y restart.
- Audio engine with master / music / effects volumes; a different music loop per world;
  synthesised effects for jump, landing, explosions, horns, bonuses, fail, win, UI clicks,
  an engine drone and wind that follow speed.
- Ghost of your own best run, recorded at 30 Hz and stored per level; Race Ghost on the win
  screen and a toggle in the pause menu.
- Speed lines, hard-landing shake, a brief slow-down on winning, quality presets, tinted
  carried trucks, a one-line help text for first-time players on 1-1.
- Production build split into game, renderer and physics files; relative paths for static hosting.

## M6 — Worlds 2 and 3

- World 2 OVERPASS (On Ramp, Step Down, Flyover, Sky Hook, Signs, Interchange) and world 3
  WHITEOUT (Black Ice, Rotor, Slide, Ice Shelf, Twin Rotors, Whiteout), each with its own palette.
- New level features: carried (floating) convoys, ice patches, rotors; overhead signs, steps
  and drops are built from scenery.
- Levels unlock in order and worlds unlock when the previous one is finished; locked levels
  are shown as locked in the level list. Next on the win screen continues into the next world.
- `tests/worlds.test.ts` plays all twelve new levels with scripted no-ability players and
  writes `worlds-report.txt`; `tests/levelBots.ts` holds the shared scripted players.
- `scripts/level-kit.mjs` shared by the three level builders.

## M5 (part 2) — Abilities and shop

- Twelve original abilities in `src/abilities/` (one file each) behind a common base class
  and a manager: one movement (left mouse or jump) and one utility (right mouse) at a time.
- Shop screen with two columns, Buy / Equip, and the bank at the top; choices are saved and
  apply immediately.
- HUD energy bars in the bottom corners; tow line, thrown markers, flare, letterbox and
  slow-motion tint.
- Time scaling in the game loop (mouse look stays real-time).
- `?abilities=all` and `?equip=a,b` for testing.

## M5 (part 1) — Points and save

- Event-driven scoring (`src/score/score.ts`): FINISH, ACE, SPEED, AIR TIME, ROW SKIP,
  AIRBORNE HOP, CLOSE CALL, WORLD CLEAR. Each bonus pops up the moment it is earned.
- Points are banked only on finishing; failing loses them. The win screen shows the breakdown
  and the bank balance.
- Save format version 2: points, owned and equipped abilities, best times, cleared worlds,
  with an upgrade path from version 1 and tolerance for damaged data.

## M4 (part 2) — World 1: DOCKYARD

- Six levels in `src/level/data/dockyard/`: First Shift, Stacks, Paper Wall, Rush Hour,
  Drawbridge, Crane Day. Container port at dawn; the quays stand in water.
- `tests/dockyard.test.ts` plays every level with a scripted no-ability player on six seeds
  and writes `dockyard-report.txt`.
- `scripts/build-dockyard.mjs`: authoring helper that places things along a path.
- Truck behaviour tuned for multi-lane fairness (see TUNING.md).

## M4 (part 1) — Level data, loader, hazards, level select

- Levels are JSON files in `src/level/data/`; `src/level/schema.ts` validates them and lists
  every problem with its field path. Broken files show up in the level list with the reasons.
- Loader support for palettes, rotated scenery (ramps), levels without flat ground (gaps),
  hidden path ribbons, and hazards.
- Hazards with a common interface: breakable wall, spinning pusher. Static blockers are
  scenery boxes; oncoming traffic is a reversed convoy.
- Level select stub, `?level=<id>`, Next / Retry / Levels on the win screen, level name in the HUD.
- Switching level frees the old physics world and meshes.
- Trucks brake for wrecks and obstacles; fixed a spot where the player could hang forever at
  a roof edge.

## M3 — Win, lose, instant restart

- Goal gate (`src/level/goal.ts`): passing through in any state wins; visible from far away.
- Lethal ground and scenery with a slightly smaller test capsule and a short grace; kill height.
- Attempt states (playing / won / failed) in the simulation, attempt timer, attempt counter.
- App state machine: start, playing, paused, failed, won. FAILED overlay restarts on any key;
  FINISHED overlay shows time and best time with a Retry button (R or Enter also work).
- Instant restart: pooled bodies reset in place; restart time shown in the F3 overlay.
- Best times saved in localStorage under one versioned key (`src/core/save.ts`).
- Placeholder music loop that starts once and is never restarted; `M` mutes.
- HUD timer at the top centre.

## M2 — Convoy and truck physics

- Spline paths with lanes (`src/trucks/path.ts`); trucks steer toward a look-ahead point on
  their lane and keep driving straight past the end of a path.
- Formation spawning from level data (rows x lanes, reverse and delayed convoys supported),
  with all trucks pooled and reset in place between attempts.
- Driver noise: steering wobble and wandering speed (calmer at the front), follow-the-leader
  spacing, panic swerves at obstacles and wrecks. New seed every attempt unless `?seed=` is set.
- Truck-truck collisions, tipping, explosions (heavy impact, tipped for 2 s) with radial
  blast on trucks and player, wrecks that stay solid for 4 s, despawning.
- Player: side and back clinging (hold jump to climb and ride, tap to kick off), explosion
  push, handling of despawned trucks.
- Rendering: instanced trucks, road ribbon with lane dashes and posts along the path,
  explosion particles, camera shake.
- Test levels: `?level=convoy` (default), `?level=block`, `?level=single`.

## M1 — First-person controller on one truck

- Project scaffold: Vite + TypeScript + Three.js + Rapier, Vitest, ESLint, Prettier.
- `src/config/tuning.ts` holds every gameplay number; the title lives in `src/config/meta.ts`.
- Fixed 60 Hz simulation with accumulator (max 4 sub-steps), render interpolation, clean pause.
- One truck (single dynamic body, trailer + cab box colliders) driven along a straight lane by
  the drive model: forward force to cruise speed, lateral grip, steering toward a look-ahead point.
- Kinematic player capsule: velocity relative to the truck while grounded, inherited on leaving,
  un-normalised diagonal input, sprint, Quake-style air control, variable jump, coyote time,
  jump buffer, collide-and-slide and depenetration against trucks only.
- First-person camera: pointer lock with raw deltas, pitch clamp, sprint FOV kick, landing dip,
  strafe roll, no head bob.
- Endless flat test road, click-to-play / pause overlay, F3 debug overlay.
- URL parameters: `?seed=`, `?god=1`, `?debug=1`, `?autostart=1`.
- Falling off puts you back on the truck (real fail state arrives in M3).
