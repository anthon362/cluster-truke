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

## M3

**Values changed from the design document:** none.

**Values the document did not give (added):**

| Key                 | Value                | Why                                                                                                                                                    |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `goal.margin`       | 0.4 m                | The gate counts as crossed this far outside its frame (the player's radius).                                                                           |
| `ui.failInputDelay` | 0.15 s               | Fresh key presses are ignored this long after failing, so a jump pressed as you die does not skip the FAILED screen. Restart is still far under 0.3 s. |
| `music.*`           | 150 BPM, volume 0.14 | Placeholder loop.                                                                                                                                      |

**Interpretations (please review):**

- **"Truck contact always wins" applies to the ground only.** While you stand on or hold on to
  a truck, touching the ground does not kill (for example on a low wreck). Lethal scenery and
  hazards always kill, otherwise riding a truck would make you immune to every obstacle.
- **After failing the player freezes but the world keeps running** behind the FAILED screen.
  After winning the player keeps moving and can no longer fail.
- **The 0.05 s grace applies to every lethal touch**, not only when sliding off a wreck.

## M4 (engine part; the six levels follow after the theme is approved)

**Values changed from the design document:** none.

**Own earlier values changed:**

| Key                     | Old | New | Why                                                                                                                                                                                                                |
| ----------------------- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `player.sideNormalMaxY` | 0.5 | 0.8 | Bug fix. Hanging at the top edge of a truck's back, the grip switched on and off every other step and the player hovered there forever. Contacts now count as a side until the surface is flat enough to stand on. |

**Values the document did not give (added):**

| Key                                                     | Value                     | Why                                                                                                                                  |
| ------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `truck.brakeAccel`                                      | 20 m/s^2                  | Trucks brake hard when a wreck or obstacle is ahead. Without it one wreck set off a chain of explosions back through the whole lane. |
| `hazards.brick*`                                        | 1.5 x 1.25 x 0.6 m, 18 kg | Breakable wall bricks. Light, so trucks plough through.                                                                              |
| `hazards.wallTrigger`                                   | 1.2 m                     | A wall shatters just before a truck touches it, so the truck never hits a solid wall.                                                |
| `hazards.wallFling` / `wallScatter` / `wallFlingRadius` | 0.7 / 5 / 3               | How bricks fly.                                                                                                                      |
| `hazards.debrisLife`                                    | 5 s                       | Bricks disappear after this.                                                                                                         |
| `hazards.debrisKnock*`                                  | 3 m/s, 0.35, 0.9 m        | Flying bricks nudge the player (never lethal).                                                                                       |
| `hazards.spinnerThickness` / `spinnerHub`               | 1 / 1.4 m                 | Spinning pusher size.                                                                                                                |

**Interpretations:**

- **Pushers shove, they do not detonate.** A truck hit by a spinning arm is pushed around
  rather than exploding from the impact itself. It can still explode from what happens next
  (other trucks, tipping over).
- **An intact breakable wall is lethal to the player; the flying bricks are not.**
- **Ramps and gaps are built from rotated boxes** plus `"ground": "none"`, rather than a
  special hazard type.

## M4 (levels)

Building real levels showed three truck behaviours that made neighbouring lanes unreliable,
so these own earlier values and rules changed. None of them are design-document numbers.

| Key                                | Old   | New           | Why                                                                                                                                                                                                                                                        |
| ---------------------------------- | ----- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `truck.explodeDeltaV`              | 9     | 13            | At 9 a truck running into a stopped truck exploded, and the jolt travelled through a bumper-to-bumper queue so the whole queue blew up in the same instant. At 13 rear-end hits shove; hitting scenery, a wedged wreck or oncoming traffic still explodes. |
| `truck.panicSwerve`                | 3.4 m | 1.3 m         | A full-lane swerve was a lane change straight into the neighbours. Now a panicking driver jostles them instead.                                                                                                                                            |
| `truck.senseLaneHalfWidth`         | -     | 1.6 m         | On bends the look-ahead ray swept across other lanes. Trucks now only react to things in their own lane.                                                                                                                                                   |
| `truck.senseSide`                  | -     | 0.9 m         | The ray alternates left and right of centre so partly overlapping trucks are noticed.                                                                                                                                                                      |
| `truck.followGain` / `brakeMargin` | -     | 1.5 / 4       | Following distance shrinks with the gap; hard braking only for a much slower truck ahead.                                                                                                                                                                  |
| `truck.stuckTime` / `stuckSpeed`   | -     | 3 s / 1.5 m/s | A truck pinned against something while trying to drive gives up and explodes, so a blocked lane always clears.                                                                                                                                             |

- **Trucks no longer brake for wrecks** (the M4 part 1 change is reverted). Braking made a
  blocked lane queue up, squeeze sideways into the next lane, and grind for half a minute.
  Now they plough in, as the design document describes (swerve only).
- **Par times** are set from measurement: riding one truck takes about 1.45 x par, and a
  scripted fast run beats par (1-1: 13.1 s against par 16; 1-3: 14.8 s against par 16).
  They are lower than the numbers in the theme proposal (which were guesses).
- **1-2 "Stacks" was redesigned.** With container stacks standing in a lane, the wrecks
  bounced into the middle lane and wiped it out. Now the quay narrows: the outer lanes run
  out of ground and their trucks drive into the water. Stacks mark where each lane ends.
- **1-5 "Drawbridge" uses a height change, not a jump over a gap.** With gravity 22 a truck
  at 18 m/s only flies about 5 m off a ramp, so a truck-jumping gap is not possible without
  changing documented values. Instead the upper deck ends at a raised bridge leaf and you
  drop to a second convoy on the lower quay.
- **Slabs count as scenery, not ground.** On these levels the quay is built from boxes, so
  the "standing on a truck forgives touching the ground" rule does not apply to it.

## M5 (part 1: points and save)

**Values changed from the design document:** none. All bonus values in section 7.1 are used
as written (`score.*`).

**Interpretations:**

- **First try (ACE) is once per level per session**, however the level is reached. Restarting
  or re-entering the level later in the same session does not give it again.
- **ROW SKIP counts rows within one convoy.** Landing on a different convoy pays nothing.
- **CLOSE CALL** is measured with a capsule 1 m larger than the player, against lethal things
  only (ground, scenery, hazards), and is paid when you next land on a truck.
- **AIRBORNE HOP** needs an actual jump (not walking off) from a truck with no corner near the ground.
- **AIR TIME is capped at 3,000 per attempt**, as specified; the other bonuses are not capped.

## M5 (part 2: abilities and shop)

The ability set, prices and timings are original to this game (decided by me, as asked):
twelve abilities, six per slot, 322,000 points in total. The design document's list of
fourteen is not used. All values are in `abilities.*` in `tuning.ts`; prices are in
`src/config/abilities.ts`.

| Ability      | Slot     | Price  | Key values                                         |
| ------------ | -------- | ------ | -------------------------------------------------- |
| SECOND WIND  | movement | 12,000 | air jump 8 m/s                                     |
| LUNGE        | movement | 18,000 | +18 m/s over 0.15 s, cooldown 4 s                  |
| KICK OFF     | movement | 22,000 | player +3 m/s, truck -4 m/s                        |
| HANG TIME    | movement | 26,000 | 1.8 s hover, 6 s to refill                         |
| SLIPSTREAM   | movement | 30,000 | up to +6 m/s after 2 s standing                    |
| TOW LINE     | movement | 38,000 | range 28 m, reel speed 30 m/s, cooldown 5 s        |
| SLOW LANE    | utility  | 15,000 | 0.4 x time for 3 s, refill after 2 s               |
| ROAD FLARE   | utility  | 20,000 | trucks within 16 m swerve for 3 s, cooldown 9 s    |
| MAGNET BOOTS | utility  | 28,000 | 4 s lock, refill after 3 s                         |
| SPARE RIG    | utility  | 32,000 | cooldown 7 s, two spare trucks per level           |
| TAILWIND     | utility  | 36,000 | trucks within 25 m at 1.3 x for 3 s, cooldown 12 s |
| SHOWTIME     | utility  | 45,000 | 0.6 x time for 4 s, points x 2, cooldown 14 s      |

**Notes:**

- **Why twelve and not fourteen:** two more would have been filler or near-copies of the
  reference game's remaining abilities (teleport, freeze all trucks, time-moves-when-you-move).
- **Ability timers run in real seconds**, so slow motion does not stretch a cooldown or make
  an energy meter last longer.
- **`player.maxSpeed` 60 m/s** is a new hard clamp on the player's own speed, checked every
  step, so no combination of abilities can exceed it.
- **SPARE RIG tests the spot before the truck exists**: the truck-sized box is raised in
  0.5 m steps until it overlaps nothing, then the truck is created there and drops.
- **A boosted truck (TAILWIND) ignores its following distance** and leans on the truck
  ahead; otherwise the unboosted trucks in front cancelled the effect.
- **`?abilities=all`** unlocks every ability for the session without saving anything;
  `?equip=towLine,slowLane` equips at start.

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
| Wall bricks fly too wildly / too little       | `hazards.wallFling`, `hazards.wallScatter`                           |
| Bricks shove you too hard                     | `hazards.debrisKnock`                                                |
| Pile-ups spread too far back                  | `truck.brakeAccel`, `truck.panicDistance`                            |
| Points come too fast / too slowly             | `score.*` (each bonus has its own value)                             |
| An ability is too strong / weak               | `abilities.<name>.*`                                                 |
| Prices                                        | `src/config/abilities.ts`                                            |
