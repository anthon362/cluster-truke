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

## What to adjust if it feels wrong

| Feels like                                | Change                                                   |
| ----------------------------------------- | -------------------------------------------------------- |
| Running is too slow / too fast            | `player.sprintSpeed`, `player.walkSpeed`                 |
| Starts and stops feel sluggish / twitchy  | `player.groundAccel`, `player.groundDecel`               |
| Jump too floaty / too heavy               | `player.gravity` (and `jumpVelocity` to keep the height) |
| Jump too short to reach the next truck    | `player.jumpVelocity`                                    |
| Tapping jump is not low enough            | `player.jumpCutMultiplier`                               |
| Jumps at edges get eaten                  | `player.coyoteTime`, `player.jumpBuffer`                 |
| Too little / too much steering in the air | `player.airAccel`                                        |
| Strafing too weak                         | `player.strafeMultiplier`                                |
| Mouse too fast / slow                     | `camera.sensitivityDefault`                              |
| View too narrow / fish-eyed               | `camera.fovDefault`, `camera.sprintFovKick`              |
| Truck too slow / fast                     | `truck.cruiseSpeed`                                      |
