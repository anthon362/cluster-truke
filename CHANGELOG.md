# Changelog

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
