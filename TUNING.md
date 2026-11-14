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

## M6 (worlds 2 and 3)

The world themes are original and were chosen by me (as asked): world 2 **OVERPASS**
(an elevated motorway: overhead signs, steps down, drops to lower roads, carried trucks)
and world 3 **WHITEOUT** (an ice road: ice patches, rotors, a snow wall, a closed road).

**Values changed from the design document:** none.

**Own earlier values changed:**

| Key                    | Old  | New  | Why                                                                                                                                  |
| ---------------------- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `truck.lateralGripIce` | 0.15 | 0.03 | At 0.15 a truck shoved sideways at 6 m/s slid only half a metre: not ice. At 0.03 it slides several metres and drifts wide in bends. |

**Values the document did not give (added):** `hazards.rotorThickness` 0.7 m, `hazards.rotorHub` 1.6 m.

**Interpretations:**

- **Logs and bars became overhead signs.** A sign's beam is 0.8 m above the trailer roofs, so
  a rider must jump it (a jump clears it by about 0.75 m). Signs hang from gantries whose
  posts stand off the road. Ducking by standing on the cab is not used yet.
- **Floating trucks are "carried" trucks** (`"float": true` on a convoy): they follow their
  path exactly at its height, ignore gravity, and cannot be shoved or blown up.
- **Spoked wheels became rotors**: a wheel standing across the road. Its spokes sweep above
  the truck roofs, kill the player, and pass straight through trucks.
- **Levels unlock in order**; finishing the last level of a world opens the next world.
  This is derived from the best times, so there is no separate "unlocked" list in the save.
  `?unlock=1` opens everything; `?level=<id>` always works.
- **Par times** follow the same rule as world 1 (riding takes about 1.45 x par).

## M7 (polish, sound, menus)

**Values changed from the design document:** none. FOV range 50-140, sprint kick, landing
dip, strafe roll and the 0.15 s of 0.5 x time on a win are as written.

**Values the document did not give (added):**

| Key                                      | Value             | Why                                                                                                         |
| ---------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `settings.padLookX` / `padLookY`         | 2.8 / 1.9 rad/s   | Stick look speed at full deflection; separate for each axis.                                                |
| `settings.padCurve`                      | 1.8               | Stick response curve: half deflection gives about a fifth of full speed, so small aim corrections are easy. |
| `settings.padDeadzone`                   | 0.15              | Default dead zone (adjustable 0-50 %).                                                                      |
| `settings.padTrigger`                    | 0.35              | How far a trigger must be pulled to count.                                                                  |
| `ghost.sampleHz`                         | 30                | As specified.                                                                                               |
| `ghost.maxStoredChars`                   | 60,000            | A ghost bigger than this is not stored (a normal run is about 8,000).                                       |
| `quality.lowRenderScale`                 | 0.75              | The low preset renders at 75 % resolution.                                                                  |
| `quality.lowParticles`                   | 0.4               | Share of explosion particles on low.                                                                        |
| `juice.speedLines*`                      | from 24 to 45 m/s | When speed lines fade in.                                                                                   |
| `juice.hardLanding` / `hardLandingShake` | 9 m/s / 0.5       | Landings harder than this shake the camera.                                                                 |
| `juice.hornMin` / `hornMax`              | 3 / 9 s           | Gap between random horn honks.                                                                              |

**Notes:**

- **Quality presets** change render resolution (low 0.75 x at most 1 x pixel ratio, medium up
  to 1.5 x, high up to 2 x), speed lines (off on low) and explosion particles. There are no
  shadows or post-processing on any preset.
- **Music is one loop per world** (150, 162 and 142 BPM); changing world swaps the pattern
  without stopping the beat. Sound effects and music are still synthesised placeholders.
- **Gamepad** plays the game and handles Play / pause / restart / next (A, Start, Y). The
  level list, shop and settings still need the mouse.
- **Horn honks are random**, not tied to panic; there is no separate non-explosive crash sound.
- **Rebinding swaps keys** if the other action would be left with none.
- **The first-level help line** shows only on 1-1 and only until 1-1 has been finished once.

## Tech stack note: physics package

The design document names `@dimforge/rapier3d-compat`. The game now uses `@dimforge/rapier3d`,
the same engine at the same version, because the "compat" package embeds its WebAssembly in
the JavaScript as text, which made the download about a quarter larger. This needed one
build-time plugin (`vite-plugin-wasm`); nothing is fetched from any server at run time and the
build is still a plain static site. No gameplay values changed.

## M8 (part 1: world 4, NIGHT FREIGHT)

M8 is being built one world at a time. The six remaining worlds and the finale are original
(decided by me, as asked): 4 NIGHT FREIGHT (light beams), 5 QUARRY (wrecking weights, blast
plates, a boulder chase), 6 STORMFRONT (wind, tilted roads), 7 FOUNDRY (boost belts, presses,
rising melt), 8 SKYLINE (a magnet crane, see-saws, a moving goal), 9 THE SUMMIT with the
finale THE AVALANCHE (a slide chases you through three stages, under 90 s, on trucks throughout).

**Values changed from the design document:** none.

**Values the document did not give (added):** `hazards.beamThickness` 0.35 m,
`hazards.beamWarning` 0.8 s (a switched-off beam flashes this long before it returns),
`hazards.beamWarningHz` 7.

**Notes on beams:**

- One hazard type, `beam`, covers every kind: lying across the road or standing upright,
  fixed, sliding back and forth (`sweep`), turning (`spin`) and switching on and off (`blink`).
- A beam only affects the player; trucks pass through light.
- Heights used in world 4: a low beam is centred 4.3 m up and must be jumped; a high beam is
  centred 5.25 m up, which hits someone standing on a trailer but passes over someone on a cab.
  This is the first world that uses the lower cab.
- The "visible countdown" for timed barriers is a warning flash instead of numbers.
- Blinking walls in 4-4 and 4-6 are timed so that a rider who does nothing arrives while they
  are off. A player who runs ahead arrives at a different time and has to read the flashes.

## M8 (part 2: world 5, QUARRY)

**Values changed from the design document:** none.

**Values the document did not give (added):** `hazards.plateRearm` 0.8 s, `hazards.plateForward`
0.15 (share of the kick that goes forward), `hazards.plateThickness` 0.12 m. Per-level values
live in the level files: plate `power`, weight `length` / `swing` / `period`, boulder `speed`.

**Measured before building the levels:**

- A blast plate across all three lanes is stable at power 6 to 10 (0 explosions, 60 of 60
  trucks drive on, a rider stays on). Power 12 is not. The levels use 9 and 10.
- A convoy thrown at power 10 clears a rock kerb up to 1.2 m high placed 8.9 m past the plate.
  A 2.5 m wall is too high. The levels use 1.2 m.

**Notes:**

- `pendulum`: a wrecking weight on a cable. It swings across the lanes at roof height: it
  passes over trucks and kills a rider. Each one is timed so it sweeps through the starting
  lane exactly when a rider who never moved arrives, so standing still does not work, but one
  lane change does.
- `plate`: throws every truck that drives over it, once each. Riders are carried along.
- `boulder`: rolls along the road behind the convoy, faster than the trucks, wrecking each one
  it reaches. The only way through is to keep moving up the rows. A rider who stays put dies
  after about 11 s in 5-4; running up the convoy finishes in about 13 s.
- The boulder comes from behind, where the player is not looking, so the HUD shows a gauge
  ("BOULDER 34 m") inside `ui.chaseWarnRange` (80 m). It turns red and the camera starts to
  shake inside `ui.chaseDangerRange` (22 m, shake up to `ui.chaseShake` 0.5). Added values.
- Convoys in this world are shorter (8 to 12 rows) on levels with plates and kerbs. A convoy
  must not start on top of something that acts on trucks; the first version did, and the lead
  rows blew up on the kerb at the start.
- 5-4 and 5-6 are the first levels where riding one truck to the goal is not enough. They
  still need no abilities: the demonstration only runs forward and jumps between rows.

## M8 (part 3: world 6, STORMFRONT)

**Values changed from the design document:** none.

**Changed from my own plan:** world 6 was announced as "wind, tilted roads". Tilted roads are
out and lightning is in. A banked road needs trucks to drive over a tilted edge, which the
truck physics turns into explosions; lightning gives the world a second idea that works with
the trucks instead of against them.

**Values the document did not give (added):** `hazards.windGroundShare` 0.3,
`hazards.windTruckShare` 0.04, `hazards.windHeight` 40 m, `hazards.windWarning` 0.9 s, the
`hazards.windStreak*` drawing values, `hazards.strikeRadius` 1.5 m, `hazards.strikeHeight` 70 m,
`hazards.strikeBoltTime` 0.2 s, `hazards.strikeMark*` and `hazards.strikeFlickerHz`. Per-level
values live in the level files: wind `force` and `gust`, lightning `period` and `warning`.

**Measured:**

- Wind does not move someone standing on a roof (their grip cancels it) and does not move the
  trucks enough to matter. It only matters in the air: one full jump drifts 2.6 m at force 6
  and 4.3 m at force 10 (a lane is 3.4 m). The levels use 6 to 9.
- A scripted player who jumps the power lines without steering wins 2 of 6 runs of 6-1; one
  that steers back toward where it took off wins 6 of 6.

**Notes:**

- `wind`: a zone with a sideways push, steady or in gusts. White streaks show where and which
  way; a few appear 0.9 s before a gust. MAGNET BOOTS ignore it while standing.
- `strike`: lightning. It always picks the truck the player is on (or last stood on), frames it
  with four flickering columns for the warning time, then destroys it. A bar on the HUD counts
  down. The first version picked random trucks near the player and threw the player with the
  blast; trucks hit ahead left wrecks the player's truck then drove into, and nobody survived.
  Now the hit has no blast wave and the wreck is always behind the player.
- The power lines are the `beam` hazard from world 4 at jumping height.
- The scripted lane change now steers onto the middle of the truck it is aiming for and, when
  the lane beside is gone, runs forward to the next row instead.

## M8 (part 4: world 7, FOUNDRY)

**Values changed from the design document:** none.

**Values the document did not give (added):** `hazards.beltStripes` / `beltStripeLength` /
`beltStripeSpeed` / `beltPostHeight` / `beltPostOut` (drawing), `hazards.pressTop` 10 m,
`pressBottom` 0.6 m, `pressBlock` 7 m, `pressSlam` 0.18 s, `pressRise` 1.1 s, `pressWarning`
1.1 s, `pressCrushBelow` 3.6 m, `pressReach` 1.5 m, `hazards.meltTruckHeight` 1.2 m,
`meltTruckClear` 1.6 m, `meltSize`, `meltDepth`, `meltCountdown` 20 s. Per-level values live in
the level files: belt `factor` and `seconds`, press `period` and `down`, melt `rise`.

**Measured:**

- The first belt used the existing truck boost (the one TAILWIND uses). The convoy was no
  faster at the goal (23.3 s against 23.4 s): each truck is pulled back to its place in the
  formation when the boost ends. Belts now use a new `surge`, which moves the truck's place
  forward with it. Two belts at 1.35 x for 3 s take a ride from 23.4 s to 21.3 s.
- Rows cross a belt one after another, so the gap between two rows opens by about 4.5 m for a
  moment. The scripted runner fell into it; it now waits when a gap is more than 2 m longer
  than normal, as a player would.
- A gantry of three presses (period about 6 s, down 1 s) crushes roughly 4 of every 10 trucks
  that pass under it.

**Notes:**

- `belt`: speeds up every truck that crosses it, and they keep the ground gained.
- `press`: a block over one lane. Touching it kills; when it comes down it flattens the truck
  under it, which is removed at once so the next truck does not drive into a wreck. Its lamp
  flashes for 1.1 s first. Gantries bring their presses down one after another, so one lane is
  always open.
- `melt`: the floor floods. When it is 1.2 m deep every truck sinks. The HUD counts down. 7-3,
  7-5 and 7-6 cannot be finished by riding (a ride takes 23 s, the melt allows 15 to 18 s); the
  demonstration runs up the convoy and finishes in about 13 to 17 s.
- Crushed and sunk trucks are destroyed without a blast wave and count as explosions in the
  statistics.

## M8 (part 5: world 8, SKYLINE)

**Values changed from the design document:** none. **Values added:** none in `tuning.ts`; the
goal in a level file can now have `speed` (m/s, at most 16 so the trucks always catch it) and
`travel` (m).

**Changed from my own plan:** world 8 was announced as "a magnet crane, see-saws, a moving
goal". The crane is the line of carried trucks that already exists (world 2 used it once), the
moving goal is in, and see-saws are out: a tilting platform under driving trucks is the same
problem as the banked roads of world 6. Rooftop gaps crossed with blast plates take their place.

**Measured:**

- A blast plate (power 9 or 10) 3 m before the edge throws the whole convoy across a gap
  between two roofs of up to 10 m with no losses (24 of 24 trucks, a rider stays on). 5 m
  before the edge with power 9 fails at 10 m. The levels use power 10, 3 m, gaps of 6 to 9 m.
- 8-3: riding catches the gate after 22.9 s; running up the convoy reaches it in 9.5 s.

**Notes:**

- The world has no ground: the roofs are scenery, the street is 45 m down, and falling is the
  "fell" ending. Roads are not drawn, since the ribbon would hang over the gaps.
- A moving gate travels along the direction it faces. The crossing test compares the player's
  movement with the gate's movement in the same step, so a gate cannot slip past unnoticed.
- 8-4 and 8-6 end on the crane line: the roofs run out and the gate is on the carried trucks.

## M8 (part 6: world 9, THE SUMMIT, and the finale)

**Values changed from the design document:** none.

**Values the document did not give (added):** `hazards.slideHeight` 16 m, `slideDepth` 14 m,
`slideReach` 3 m, `slideChunks` 14, `slideChunkReach` 9 m. Per-level values live in the level
files: the avalanche's `speed`, `startAt` and `stages`; lightning can be limited to a stretch
of a level with `between`.

**The finale, 9-6 THE AVALANCHE** (my own design, as agreed: no vehicle-giant boss). One
avalanche comes down the road behind the convoy for the whole level, 980 m, on trucks
throughout:

| Stage         | Road (z)    | Avalanche | What is in the way                             |
| ------------- | ----------- | --------- | ---------------------------------------------- |
| 1, tree line  | up to 330   | 19.5 m/s  | two swinging cableway weights                  |
| 2, the ridge  | 330 to 660  | 20.5 m/s  | gusting crosswind, two kerbs to be thrown over |
| 3, the summit | 660 to goal | 22 m/s    | lightning on the truck you stand on            |

The convoy drives 18 m/s, so the avalanche gains all the time and faster in each stage. It
starts 70 m behind the rear row.

**Measured on the finale:**

- A rider who never moves is caught by a weight after 7 s. Nobody finishes by standing still.
- The scripted player that dodges and only moves up the convoy when the avalanche is within
  90 m wins 5 of 6 runs in 46 s. One that sprints to the front row wins 3 of 6 in 38.8 s: the
  front row has no row ahead to escape to when lightning marks it. Both are well under the 90 s
  the design asks for. Par is 42 s.
- Lightning in the finale first struck at 4 s, in stage 1, because it had no notion of place.
  It is now limited to stage 3.

**Notes:**

- `slide`: a 44 m wide wall of snow following the road. It buries (removes) every truck it
  reaches and is lethal to touch. The HUD gauge shows the distance, as for the boulder.
- The finale has 24 rows (72 trucks), the largest convoy in the game. Frame rate with that
  many trucks has not been measured on a real graphics card.
- After the last level the result screen reads SUMMIT REACHED and Next is greyed out.

## M9 (level editor)

M9 is not in the design document, which ends at M8. I took it to be the one thing the
document left open: the optional level editor of section 7.4 ("a simple in-browser editor that
edits the same JSON, with export/import as file").

**Values changed from the design document:** none. No gameplay values were added; the editor
has three of its own in `src/ui/editorScreen.ts` (snap 0.5 m, 2.6 pixels per metre when a level
is opened, 60 undo steps).

**Decisions:**

- The map is 2D and seen from above, not a 3D view: placing things on a road is a 2D job, and
  it needs no second renderer.
- The editor has no format of its own. It holds a level file's JSON and runs `validateLevel`
  on it after every change, so what it exports is what the game loads.
- A level from the editor always has the id `custom`. It earns no points and saves no best
  time or ghost: otherwise a one-truck level with the goal in front of it would be a points
  machine.
- Heights are typed in the panel (the middle number of `pos`); the map only moves things
  sideways and along the road.

## What to adjust if it feels wrong

| Feels like                                    | Change                                                                |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Running is too slow / too fast                | `player.sprintSpeed`, `player.walkSpeed`                              |
| Starts and stops feel sluggish / twitchy      | `player.groundAccel`, `player.groundDecel`                            |
| Jump too floaty / too heavy                   | `player.gravity` (and `jumpVelocity` to keep the height)              |
| Jump too short to reach the next truck        | `player.jumpVelocity`                                                 |
| Tapping jump is not low enough                | `player.jumpCutMultiplier`                                            |
| Jumps at edges get eaten                      | `player.coyoteTime`, `player.jumpBuffer`                              |
| Too little / too much steering in the air     | `player.airAccel`                                                     |
| Strafing too weak                             | `player.strafeMultiplier`                                             |
| Mouse too fast / slow                         | `camera.sensitivityDefault`                                           |
| View too narrow / fish-eyed                   | `camera.fovDefault`, `camera.sprintFovKick`                           |
| Truck too slow / fast                         | `truck.cruiseSpeed`                                                   |
| Convoy too tidy / too chaotic                 | `truck.wobbleAmplitude`, `truck.speedVariance`, `truck.leadRowCalm`   |
| Rows too far apart to jump                    | `truck.rowSpacing`, `truck.slotGain`                                  |
| Trucks explode too easily / not enough        | `truck.explodeDeltaV`                                                 |
| Explosions throw things too hard / too little | `truck.blastSpeed`, `player.blastSpeed`                               |
| Climbing a truck side too slow / too easy     | `player.clingAccel`, `player.clingMaxRise`, `player.clingCatchAccel`  |
| Side kick-off too weak                        | `player.clingTapUp`, `player.clingTapAway`                            |
| Camera shake too strong                       | `camera.shakeMaxAngle`                                                |
| Wall bricks fly too wildly / too little       | `hazards.wallFling`, `hazards.wallScatter`                            |
| Bricks shove you too hard                     | `hazards.debrisKnock`                                                 |
| Pile-ups spread too far back                  | `truck.brakeAccel`, `truck.panicDistance`                             |
| Points come too fast / too slowly             | `score.*` (each bonus has its own value)                              |
| An ability is too strong / weak               | `abilities.<name>.*`                                                  |
| Prices                                        | `src/config/abilities.ts`                                             |
| Ice too slippery / not slippery enough        | `truck.lateralGripIce`                                                |
| Blast plates throw trucks too high / too low  | `power` on the plate in the level file (stable range 6 to 10)         |
| Wrecking weights too fast / too slow          | `period` on the pendulum in the level file                            |
| Boulder catches up too fast / too slowly      | `speed` and `startAt` on the boulder in the level file                |
| Wind too strong / too weak                    | `force` on the wind in the level file (a jump drifts 0.43 m per unit) |
| Lightning leaves too little time              | `warning` and `period` on the strike in the level file                |
| Belts give too little / too much              | `factor` and `seconds` on the belt in the level file                  |
| Presses too fast / too slow                   | `period` and `down` on the press in the level file                    |
| Melt leaves too little time                   | `rise` on the melt in the level file (deadline = 1.2 / rise seconds)  |
| Trucks fall short of / overshoot a roof gap   | `power` on the plate before it (and its distance from the edge)       |
| The moving gate is too hard to catch          | `speed` on the goal in the level file                                 |
| Avalanche too fast / too slow                 | `speed` and `stages` on the slide in the level file                   |
