# Changelog

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
