# Changelog

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
