/**
 * Every gameplay number lives here. Systems code must not contain magic numbers.
 * Values marked (estimate) are starting points; changes are logged in TUNING.md.
 */

const DEG = Math.PI / 180;

export const TUNING = {
  loop: {
    fixedStep: 1 / 60,
    maxSubSteps: 4,
    /** Longest real frame time fed to the accumulator (tab switch protection). */
    maxFrameTime: 0.25,
    /** Debug overlay warns when one physics step takes longer than this (ms). */
    stepBudgetMs: 6,
  },

  physics: {
    /** Gravity for trucks and other rigid bodies (m/s^2). */
    gravity: 22,
    /** Hard clamp on any truck's speed (m/s). */
    maxTruckSpeed: 60,
    /** Hard clamp on velocity a truck may hand over to the player (m/s). */
    maxTransferSpeed: 40,
    /** Half extent of the flat test ground used until levels exist (m). */
    testGroundHalfSize: 20000,
  },

  player: {
    radius: 0.4,
    height: 1.8,
    eyeHeight: 1.65,
    walkSpeed: 9,
    sprintSpeed: 14,
    /** Strafe and backward speed as a fraction of the forward value. */
    strafeMultiplier: 0.55,
    groundAccel: 60,
    groundDecel: 40,
    /** Slow-down rate on the ground while faster than the input cap. */
    overspeedBleed: 8,
    airAccel: 14,
    airDrag: 0,
    gravity: 22,
    jumpVelocity: 10,
    /** Upward velocity multiplier when jump is released while rising. */
    jumpCutMultiplier: 0.5,
    coyoteTime: 0.15,
    jumpBuffer: 0.12,
    /** Side-of-truck climbing (M2). */
    clingAccel: 30,
    clingMaxRise: 6,
    /** Stronger upward acceleration while still falling, so grabbing a side catches you. */
    clingCatchAccel: 70,
    clingTapUp: 10,
    clingTapAway: 3,
    /** While clinging with no direction held, speed relative to the truck fades at this rate. */
    clingGrip: 20,
    /** Surfaces steeper than this are not standable; the player slides. */
    slideAngle: 35 * DEG,
    /** Gap kept between the capsule and trucks. */
    skin: 0.02,
    /** How far below the feet a grounded player keeps sticking to a truck. */
    groundSnap: 0.3,
    /** How far below the feet an airborne player looks for a landing. */
    groundProbe: 0.05,
    /** Landing is accepted while moving up relative to the truck slower than this. */
    maxLandingRise: 0.5,
    slideIterations: 4,
    depenetrationIterations: 3,
    /** Lethal test capsule is this fraction of the collision capsule (M3). */
    /** A truck face this close counts as touched for side clinging. */
    clingReach: 0.15,
    /** Contact normals flatter than this (|y|) count as a truck side. */
    sideNormalMaxY: 0.8,
    /** Speed an explosion at point-blank range adds to the player. */
    blastSpeed: 14,
    /** Upward share added to the blast direction. */
    blastUp: 0.6,
    /** Hard clamp on the player's own speed, whatever abilities do (m/s). */
    maxSpeed: 60,
    lethalCapsuleScale: 0.9,
    /** Grace before a lethal overlap counts while sliding off a wreck (M3). */
    lethalGrace: 0.05,
  },

  camera: {
    fovDefault: 90,
    fovMin: 50,
    fovMax: 140,
    sprintFovKick: 8,
    sprintFovTime: 0.2,
    landingDip: 0.08,
    landingDipTime: 0.1,
    /** Landing speed (m/s) that produces the full dip. */
    landingDipFullSpeed: 12,
    strafeRoll: 2 * DEG,
    strafeRollTime: 0.15,
    pitchLimit: 89 * DEG,
    /** Camera shake from explosions: peak angle, fade time, audible radius. */
    shakeMaxAngle: 2.5 * DEG,
    shakeTime: 0.45,
    shakeRadius: 45,
    shakeHz: 28,
    /** Radians of rotation per pixel of mouse movement at sensitivity 1. */
    mouseRadPerPixel: 0.0022,
    sensitivityDefault: 1,
    near: 0.05,
    far: 900,
  },

  truck: {
    length: 10,
    width: 2.6,
    trailerLength: 7.2,
    trailerRoof: 3.8,
    cabLength: 2.4,
    cabRoof: 2.9,
    cabGap: 0.4,
    mass: 800,
    /** Share of the mass carried by the trailer collider. */
    trailerMassShare: 0.7,
    cruiseSpeed: 18,
    cruiseSpeedMin: 8,
    cruiseSpeedMax: 35,
    accel: 8,
    /** Fraction of sideways velocity cancelled per step while driving. */
    lateralGrip: 0.9,
    /** Same on ice (M6). */
    lateralGripIce: 0.03,
    lookAhead: 8,
    /** Yaw rate requested per radian of heading error (1/s). */
    steerGain: 3,
    /** Fraction of the yaw-rate error corrected per step. */
    steerResponse: 0.3,
    maxSteerRate: 1.2,
    uprightLimit: 40 * DEG,
    groundRayLength: 0.3,
    /** Rays start this far above the truck's base. */
    groundRayLift: 0.5,
    /** Contact friction while the drive model is in control (it supplies grip itself). */
    friction: 0,
    /** Contact friction once a truck is tumbling debris. */
    debrisFriction: 0.6,
    restitution: 0.1,
    /** Trucks look ahead for trouble every this many steps (staggered). */
    senseInterval: 6,
    /** Height of the forward sensing ray above the truck base. */
    senseHeight: 1.5,
    /** Things further than this from the lane centre are not "in my lane" (m). */
    senseLaneHalfWidth: 1.6,
    /** Closer than this to a driving truck ahead: match its speed. */
    followDistance: 4,
    /** Deceleration when the truck ahead is much slower (m/s^2). */
    brakeAccel: 20,
    /** Extra speed allowed per metre of gap beyond `followDistance` (1/s). */
    followGain: 1.5,
    /** Brake hard once this much faster than the following speed (m/s). */
    brakeMargin: 4,
    /** The sensing ray alternates between this far left and right of centre (m). */
    senseSide: 0.9,
    panicTime: 1.2,
    /** Sideways dodge when panicking (m). Kept inside the lane's neighbourhood so a
     *  panicking driver jostles neighbours rather than changing lane into them. */
    panicSwerve: 1.3,
    /** Driver noise multiplier for the front row (rear row is always 1). */
    leadRowCalm: 0.4,
    /** Velocity change within one step that blows a truck up (m/s). */
    explodeDeltaV: 13,
    /** Up-vector Y below this counts as tipped for the timed explosion. */
    tippedDot: 0.2,
    /** Speed an explosion adds to a truck at point-blank range. */
    blastSpeed: 9,
    blastUp: 0.7,
    blastSpin: 2.5,
    /** Upward hop of the exploding truck itself. */
    wreckPop: 5,
    maxAngularSpeed: 8,
    laneSpacing: 3.4,
    rowSpacing: 13,
    convoyRowsMin: 8,
    convoyRowsMax: 20,
    maxActive: 80,
    wobbleAmplitude: 0.12,
    wobbleHzMin: 0.2,
    wobbleHzMax: 0.5,
    speedVariance: 0.1,
    /** How fast each driver's speed wanders within the variance (Hz). */
    speedWanderHzMin: 0.08,
    speedWanderHzMax: 0.2,
    /** Speed correction per metre a truck is away from its formation slot (1/s). */
    slotGain: 0.5,
    /** Slot catch-up is limited to this multiple of the speed variance. */
    slotCatchUp: 2,
    panicDistance: 15,
    explodeClosingSpeed: 25,
    explodeUpsideDownTime: 2,
    /** A truck that wants to drive but has been pinned below `stuckSpeed` this long gives up (explodes),
     *  so a blocked lane always clears. Trucks queueing behind another truck are exempt. */
    stuckTime: 3,
    stuckSpeed: 1.5,
    explosionRadius: 8,
    wreckLifetime: 4,
    despawnBehind: 60,
  },

  fx: {
    explosionParticles: 28,
    maxParticles: 320,
    particleLife: 1.1,
    particleSpeed: 13,
    particleSize: 0.45,
    particleGravity: 18,
  },

  abilities: {
    secondWind: { jumpVelocity: 8 },
    lunge: { speed: 18, duration: 0.15, cooldown: 4 },
    hangTime: { duration: 1.8, recharge: 6, damping: 40 },
    towLine: {
      range: 28,
      pullAccel: 55,
      maxPullSpeed: 30,
      releaseDistance: 2.5,
      cooldown: 5,
      eyeHeight: 0.75,
    },
    slipstream: { chargeTime: 2, boost: 6 },
    kickOff: { playerBoost: 3, truckKick: 4, truckSpin: 1.5 },
    slowLane: { timeScale: 0.4, duration: 3, refillDelay: 2, refillTime: 3 },
    spareRig: {
      cooldown: 7,
      throwSpeed: 22,
      pool: 2,
      nudgeStep: 0.5,
      nudgeTries: 14,
      dropHeight: 0.3,
    },
    roadFlare: { cooldown: 9, throwSpeed: 22, radius: 16, duration: 3, swerve: 3.4 },
    magnetBoots: { duration: 4, refillDelay: 3, refillTime: 4 },
    tailwind: { radius: 25, boost: 1.3, duration: 3, cooldown: 12 },
    showtime: { timeScale: 0.6, duration: 4, cooldown: 14, multiplier: 2 },
    /** Thrown markers: gravity and lifetime. */
    throwGravity: 22,
    throwLife: 4,
  },

  hazards: {
    /** Breakable wall bricks (m) and mass. */
    brickWidth: 1.5,
    brickHeight: 1.25,
    brickDepth: 0.6,
    brickMass: 18,
    /** A truck this close to a wall (beyond its own half length) shatters it. */
    wallTrigger: 1.2,
    /** Share of the truck's velocity given to bricks in its way. */
    wallFling: 0.7,
    wallScatter: 5,
    /** How wide around the truck bricks get flung (m). */
    wallFlingRadius: 3,
    debrisLife: 5,
    /** Debris moving faster than this relative to the player knocks them. */
    debrisKnockSpeed: 3,
    debrisKnock: 0.35,
    debrisReach: 0.9,
    /** Spinning pusher arm cross-section and hub size (m). */
    spinnerThickness: 1,
    spinnerHub: 1.4,
    /** Rotor (vertical spoked wheel) spoke cross-section and hub size (m). */
    rotorThickness: 0.7,
    rotorHub: 1.6,
    /** Blast plate: how long it glows before it can fire again, and the forward share of its kick. */
    plateRearm: 0.8,
    plateForward: 0.15,
    plateThickness: 0.12,
    /** Light beams: default thickness, and how long before switching on a beam flashes a warning (s). */
    beamThickness: 0.35,
    beamWarning: 0.8,
    beamWarningHz: 7,
  },

  goal: {
    /** The gate counts as crossed this far outside its frame (player radius). */
    margin: 0.4,
    pillarWidth: 1.2,
  },

  settings: {
    sensitivityMin: 0.2,
    sensitivityMax: 3,
    /** Gamepad look speed at full stick deflection (rad/s) at sensitivity 1. */
    padLookX: 2.8,
    padLookY: 1.9,
    padSensitivityMin: 0.3,
    padSensitivityMax: 2.5,
    padDeadzone: 0.15,
    /** Stick response: output = input ^ curve (above the dead zone). Higher = gentler near the centre. */
    padCurve: 1.8,
    /** Analog triggers count as pressed above this. */
    padTrigger: 0.35,
  },

  ghost: {
    sampleHz: 30,
    /** A ghost larger than this (characters, after encoding) is not stored. */
    maxStoredChars: 60000,
  },

  quality: {
    /** Render resolution on the low preset, as a share of native. */
    lowRenderScale: 0.75,
    /** Share of explosion particles on the low preset. */
    lowParticles: 0.4,
  },

  juice: {
    /** After a win the world runs at this speed for this long (real seconds). */
    winSlowScale: 0.5,
    winSlowTime: 0.15,
    /** Speed lines appear above this player speed and are full at the second value (m/s). */
    speedLinesFrom: 24,
    speedLinesFull: 45,
    speedLineCount: 36,
    /** Landing speed that starts to shake the camera (m/s) and the strongest shake it gives (0..1). */
    hardLanding: 9,
    hardLandingShake: 0.5,
    /** Seconds between random horn honks (min, max). */
    hornMin: 3,
    hornMax: 9,
  },

  ui: {
    /** Fresh key presses are ignored this long after failing, so a late jump press does not skip the overlay. */
    failInputDelay: 0.15,
    /** A chasing hazard is shown on the HUD inside this distance (m), and in red inside the danger distance. */
    chaseWarnRange: 80,
    chaseDangerRange: 22,
    /** Camera shake (0 to 1) when the chaser is touching distance; it fades to none at the danger distance. */
    chaseShake: 0.5,
  },

  music: {
    bpm: 150,
    volume: 0.14,
    /** Scheduler look-ahead (s) and tick (ms). */
    lookAhead: 0.2,
    tickMs: 50,
  },

  score: {
    finish: 500,
    ace: 1000,
    speedMax: 1500,
    speedZeroAtPar: 2,
    speedMaxAtPar: 0.6,
    airTimePerSecond: 150,
    airTimeThreshold: 1,
    airTimeCap: 3000,
    rowSkip: 100,
    airborneHop: 300,
    closeCall: 250,
    closeCallDistance: 1,
    worldClear: 5000,
  },
} as const;

export type Tuning = typeof TUNING;
