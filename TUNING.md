# Tuning log

All gameplay numbers live in `src/config/tuning.ts`. This file records every value that
differs from the design document, every value the document did not specify, and every
interpretation that affects feel.

## M1

**Values changed from the design document:** none. Every number in sections 3.2, 3.3 and
4.2 is at its starting value.

**Values the document did not give (added, all estimates):**

| Key                                                  | Value         | Why                                                                               |
| ---------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `player.skin`                                        | 0.02 m        | Gap kept between capsule and trucks so casts never start touching.                |
| `player.groundSnap`                                  | 0.3 m         | How far down a grounded player sticks to a truck (bumps, tilting).                |
| `player.groundProbe`                                 | 0.05 m        | Landing detection reach while airborne.                                           |
| `player.maxLandingRise`                              | 0.5 m/s       | Still counts as landing while rising this slowly relative to the truck.           |
| `truck.lateralGrip`                                  | 0.9           | Share of sideways slide cancelled per step while driving.                         |
| `truck.steerGain` / `steerResponse` / `maxSteerRate` | 3 / 0.3 / 1.2 | Path-following steering. Only matters once paths curve (M2).                      |
| `truck.friction`                                     | 0             | Trucks have no wheels; the drive model supplies grip instead of contact friction. |
| `truck.trailerMassShare`                             | 0.7           | Mass split between the two colliders (total stays 800).                           |
| `truck.restitution`                                  | 0.1           |                                                                                   |
| `physics.gravity`                                    | 22            | Rigid bodies use the same gravity as the player.                                  |
| `camera.mouseRadPerPixel`                            | 0.0022        | Base mouse sensitivity at slider value 1.                                         |
| `camera.landingDipFullSpeed`                         | 12 m/s        | Landing speed that gives the full 0.08 m dip.                                     |

**Interpretations:**

- **Air control is measured relative to the frame you jumped from.** The document says air
  acceleration "only adds speed along the wish direction up to the sprint cap; never reduces
  inherited speed". On a truck doing 18 m/s you are already past the cap in world space, so a
  world-space rule would give no forward air control at all. Air control is therefore applied
  to velocity relative to the truck you left; the inherited truck velocity is never touched.
- **Truck colliders reach the ground.** There is no wheel simulation, so the two boxes rest
  directly on the road. The visible body starts 0.6 m up with decorative wheels underneath.
- **The player rides the truck's exact transform** rather than integrating its velocity, which
  removes all drift (measured: < 1 cm over 30 s, vertical jitter < 2 mm).

## M2

**Values changed from the design document:** none.

**Values the document did not give (added, all estimates):**

| Key                                                       | Value                 | Why                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `truck.explodeDeltaV`                                     | 9 m/s                 | The "impact impulse threshold": a truck explodes when one physics step changes its velocity by more than this. Covers wall hits, head-ons (closing speed 25+) and hard landings. |
| `truck.tippedDot`                                         | 0.2                   | Lying on a side or the roof for `explodeUpsideDownTime` (2 s) triggers the timed explosion.                                                                                      |
| `truck.blastSpeed` / `blastUp` / `blastSpin` / `wreckPop` | 9 / 0.7 / 2.5 / 5     | How hard an explosion throws nearby trucks and hops the wreck itself.                                                                                                            |
| `player.blastSpeed` / `blastUp`                           | 14 / 0.6              | Explosion push on the player (never lethal).                                                                                                                                     |
| `truck.debrisFriction`                                    | 0.6                   | Friction once a truck is no longer driving, so wrecks do not slide forever.                                                                                                      |
| `truck.senseInterval` / `senseHeight`                     | 6 steps / 1.5 m       | Forward look-ahead ray used for following and panic.                                                                                                                             |
| `truck.followDistance`                                    | 4 m                   | Closer than this to a driving truck ahead: match its speed instead of ramming it.                                                                                                |
| `truck.panicTime` / `panicSwerve`                         | 1.2 s / 3.4 m         | Length and size of a panic swerve.                                                                                                                                               |
| `truck.leadRowCalm`                                       | 0.4                   | Driver noise multiplier for the front row (rear row is 1.0).                                                                                                                     |
| `truck.speedWanderHzMin/Max`                              | 0.08 / 0.2 Hz         | How fast each driver's speed wanders.                                                                                                                                            |
| `truck.slotGain` / `slotCatchUp`                          | 0.5 / 2               | Pull back toward the truck's formation slot, and its limit.                                                                                                                      |
| `truck.maxAngularSpeed`                                   | 8 rad/s               | Spin clamp.                                                                                                                                                                      |
| `player.clingReach` / `sideNormalMaxY`                    | 0.15 m / 0.5          | What counts as touching a truck side.                                                                                                                                            |
| `player.clingCatchAccel`                                  | 70 m/s^2              | Upward acceleration while still falling against a side.                                                                                                                          |
| `player.clingGrip`                                        | 20 m/s^2              | Clinging with no direction held fades your speed relative to that truck.                                                                                                         |
| `camera.shake*`                                           | 2.5 deg, 0.45 s, 45 m | Explosion shake.                                                                                                                                                                 |
| `fx.*`                                                    |                       | Explosion particle counts and speeds.                                                                                                                                            |

**Interpretations and deviations (please review):**

- **Speed variance wanders instead of being a fixed per-truck offset.** A permanent +/-10 %
  offset made rows drift apart by metres per second, so after a few seconds the next row was
  out of jumping range. Each driver's speed now wanders within +/-10 % and is gently pulled
  back to its slot in the formation. Rows still bunch up and spread out.
- **Only wrecks and tumbling trucks despawn 60 m behind the player.** The document says all
  trucks more than 60 m behind despawn, but M2 also requires running the convoy front to back,
  which is impossible if the rear rows vanish. Driving trucks are kept.
- **Cling catches a fall.** With only the documented 30 m/s^2 (net +8) a player falling at
  13 m/s past a truck side could not be stopped before the ground. While still falling the
  catch acceleration is used; once rising, the documented 30 / max 6 m/s apply.
- **Clinging does not teleport you to the truck's speed.** Your world velocity is kept when you
  grab on; you then ride along with that truck.
- **Panic side is a fixed hash, not seeded noise** (minor).
- **Air control vanishes above sprint speed while holding forward.** This follows from the
  documented Quake-style rule (speed is only added along the wish direction up to the cap):
  at 18+ m/s relative, holding W gives no steering. Letting go of W and strafing still works.
  Worth a feel check; if it is confusing, air control can be made direction-only above the cap.

## What to adjust if it feels wrong

| Feels like                                    | Change                                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Running is too slow / too fast                | `player.sprintSpeed`, `player.walkSpeed`                             |
| Starts and stops feel sluggish / twitchy      | `player.groundAccel`, `player.groundDecel`                           |
| Jump too floaty / too heavy                   | `player.gravity` (and `jumpVelocity` to keep the height)             |
| Jump too short to reach the next truck        | `player.jumpVelocity`                                                |
| Tapping jump is not low enough                | `player.jumpCutMultiplier`                                           |
| Jumps at edges get eaten                      | `player.coyoteTime`, `player.jumpBuffer`                             |
| Too little / too much steering in the air     | `player.airAccel`                                                    |
| Strafing too weak                             | `player.strafeMultiplier`                                            |
| Mouse too fast / slow                         | `camera.sensitivityDefault`                                          |
| View too narrow / fish-eyed                   | `camera.fovDefault`, `camera.sprintFovKick`                          |
| Truck too slow / fast                         | `truck.cruiseSpeed`                                                  |
| Convoy too tidy / too chaotic                 | `truck.wobbleAmplitude`, `truck.speedVariance`, `truck.leadRowCalm`  |
| Rows too far apart to jump                    | `truck.rowSpacing`, `truck.slotGain`                                 |
| Trucks explode too easily / not enough        | `truck.explodeDeltaV`                                                |
| Explosions throw things too hard / too little | `truck.blastSpeed`, `player.blastSpeed`                              |
| Climbing a truck side too slow / too easy     | `player.clingAccel`, `player.clingMaxRise`, `player.clingCatchAccel` |
| Side kick-off too weak                        | `player.clingTapUp`, `player.clingTapAway`                           |
| Camera shake too strong                       | `camera.shakeMaxAngle`                                               |
