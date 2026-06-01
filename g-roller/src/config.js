// All the gameplay numbers in one place. Built on the original Unity
// GameManager values, tuned so the web version feels good and the main path is
// always reachable with a well-timed jump.

export const CONFIG = {
  // Player movement (units per second)
  sideSpeed: 20,
  forwardSpeed: 24,         // starting auto-run speed (eases up from here) — 5% slower
  maxForwardSpeed: 63,
  jumpSpeed: 50,            // experimenting with a big, floaty jump
  gravity: 39,
  playerRadius: 0.9,

  // Variable jump: releasing jump while rising chops upward speed for a fast drop
  quickDescentDivisor: 1.7,

  // Forgiveness so edge/just-landed jumps always register:
  coyoteTime: 0.1,       // still jump for this long after rolling off a ledge
  jumpBufferTime: 0.5,   // a jump pressed this soon before landing still fires (generous quick-jump grace)

  // Acceleration plates (the green-arrow boards): the longer you ride one, the
  // faster you go — speed builds up smoothly while on it and eases back off when
  // you leave it.
  // The build COMPOUNDS: rate = accelRate + currentBonus * accelGrowth. A quick
  // tap (land + jump straight off) only nudges you; ride the full length and it
  // steepens into a real zoom, capping just under a second of solid riding.
  accelRate: 13,      // initial speed gained per second the instant you touch a plate
  accelGrowth: 2.3,   // how fast the build rate itself ramps up the longer you ride
  accelMax: 42,       // cap on the accumulated bonus — a big top-end on a full ride
  accelHold: 1.4,     // seconds you stay launched at top speed before the decel kicks in
  accelDecay: 9,      // speed lost per second after the hold — a steady, linear glide back
  accelEase: 0.09,    // while ON a boost plate, speed chases its target THIS fast (small = snappy) so all the gain happens before you lift off — no accelerating in mid-air

  // Trampoline boards (the pink ones): launch you up like a boosted jump.
  bounceBoost: 1.7,   // launch velocity = jumpSpeed * this (trimmed — jumpSpeed 50 made 2.05 absurd)
  zenBounce: 2.0,     // Zen mode: a would-be-fatal fall instead power-bounces you up at jumpSpeed * this (~200% jump)
  zenCatchDepth: 32,  // Zen mode: how far BELOW the lowest nearby board you fall before the bounce catches you — high enough that you watch a real fall, not an instant fling
  zenDifficulty: 0.2, // Zen mode: the hazard ramp is PINNED here (no escalation with distance) — a steady, mild-but-interesting Medium level, not Easy-empty and not ramping into panic

  // Flipper plate (orange): a hinged springboard that pivots forward and SENDS you
  // up AND forward — a directed launch. Survive the landing. Reuses the box plate;
  // the "flip" is just an animated hinge kick (no new geometry).
  flipperVertical: 1.2,   // launch v.y = jumpSpeed * this — LOWER than the trampoline (1.7) on purpose: the flipper is a flat FORWARD cannon, the red bouncy is the vertical pop
  flipperForward: 64,     // forward speed BLAST on launch — injected straight into live speed (uncapped) so you fly FAR forward, then eases back. This (not height) is the flipper's identity
  flipperFlipTime: 0.4,   // seconds the hinge-kick animation lasts
  flipperChance: 0.08,    // chance a non-safe main-path board is a flipper (not gated by zen/difficulty — just rare)

  // Manual throttle (Up/Down arrows or the thumbstick Y axis): a slight, eased
  // speed nudge. Kept small so the path stays reachable (gaps have 50% headroom).
  manualSpeed: 8,
  minSpeed: 15,    // speed never eases below this (so you can't stall)

  // Two eased ramps drive everything. SPREAD opens the field up FAST (degrees of
  // freedom — the path starts to wander wide, up and over, through a scattered
  // cloud of branch platforms). HAZARD ramps the danger in SLOWLY (obstacles,
  // movers, shrinking pads, powerdowns). Each [easy, hard] pair interpolates from
  // its ramp's value 0 -> 1. So the world sprawls into a journey early while
  // staying gentle, and only gets genuinely dangerous deep into a run.
  speedRampEvery: 14,   // base auto-run speed nudges up this often (slow ramp — keeps the early game relaxed)
  speedRampAmount: 1.2,
  spreadDistance: 650,      // metres before the field is fully "spread out"
  difficultyDistance: 2800, // metres before hazards peak — long & gentle so a run is a "mood", not a panic

  keepAheadDistance: 185,
  cullBehindDistance: 70,
  pathRiseSafety: 0.62,     // fraction of max jump height a step may rise
  pathGapSafety: 0.5,       // fraction of jump distance a forward gap may span
  pathLateralSafety: 0.44,  // fraction of strafe reach a sideways step may take
  safeStraight: 2,          // just a plank or two to ease in, then it spreads out fast

  // --- Critical path (the guaranteed-reachable chain). Opens up with SPREAD.
  // Like a spline drawn through the city: it winds up, over, down and across in
  // big sweeps, but every step stays within a jump's reach. ---
  gapFracLo: [0.2, 0.52],
  gapFracHi: [0.42, 1.0],
  lateralFrac: [0.4, 1.0],  // how much of the reachable strafe a step may use
  riseFrac: [0.4, 1.0],     // how much of the reachable rise a step may use
  dropDepth: [-4, -10],     // how far a step may drop
  bandX: [26, 120],         // how far the path may wander left/right (sprawls WIDE — each step still clamped to reachable strafe)
  driftEvery: [4, 9],       // steps between picking a new wander target
  driftY: [24, 70],         // vertical reach of wander targets (big up-and-over)

  // --- Scatter cloud: branch platforms strewn around the path for the sprawl. ---
  cloudCount: [1, 5],       // extra platforms per step (grows with spread)
  cloudRadiusX: [18, 94],   // how wide the cloud scatters (a touch wider — reinforces the open feel)
  cloudRadiusY: [12, 40],   // how tall the cloud scatters (parallax layers)
  cloudZSpread: 34,         // depth jitter of cloud platforms around the front

  // --- Pad size: BIG early (long winding jumps, generous landings) and only
  // shrinking modestly with HAZARD difficulty. ---
  padLenLo: [36, 12],
  padLenHi: [54, 18],
  padWidthLo: [16, 7],
  padWidthHi: [23, 10],

  // --- Hazards: a small floor right after the safe intro (so spikes, obstacles
  // and moving platforms show up early), ramping to their peak. ---
  obstacleChance: [0.18, 0.7],    // more obstacles now there are 4 kinds (barrier/spikes/pillars/overhead)
  movingChance: [0.2, 0.7],       // moving boards are a big part of the mix (calmer early floor)
  moveAmp: [4, 12],
  sharpTurnChance: [0.08, 0.38],
  obstacleMoveChance: [0.0, 0.55], // chance a barrier/spike PATROLS (slides on its platform); ramps with difficulty
  obstacleMoveAmp: [2, 6.5],       // patrol half-range in units; grows with difficulty (clamped to fit the board, keeping a gap)

  // Difficulty levels (cycled in the ⚙️ panel, shown in the HUD). `mult` scales the
  // WHOLE hazard ramp — floor AND ceiling — so the tiers stay distinct even deep in
  // a run (not just early), capped by hazardCeil so Hard can't hit 100%. `speedMult`
  // scales the base auto-run speed (gaps are sized to live speed, so this stays
  // reachable). Together they make Easy/Medium/Hard feel like different games.
  difficultyLevels: [
    { name: "Easy", mult: 0.55, speedMult: 0.92 },
    { name: "Medium", mult: 1.0, speedMult: 1.0 },
    { name: "Hard", mult: 1.7, speedMult: 1.15 },
  ],
  hazardCeil: 0.92, // global cap on any hazard chance after the difficulty mult (so Hard stays < 100%)
  defaultDifficulty: 1, // index into difficultyLevels (Medium)
  goodPowerupChance: [0.4, 0.25],  // chance a pickup is GOOD — powerdowns are the majority (they're dodgeable obstacles), more so deeper in
  roundGeoChance: [0.04, 0.4],    // hex/round pads: rare & small early, common later

  // --- Tunnels: a short run of glowing rings you roll through. Kept short so
  // the exit is always visible past it in the third-person camera. ---
  tunnelChance: [0.0, 0.16],
  tunnelCooldown: 6,   // min normal steps between tunnels
  tunnelLength: 34,
  tunnelRings: 7,
  tunnelRadius: 4.5,

  // --- Ramps & curved boards ---
  // Ramps RE-ENABLED with the proper fix: collision now raycasts straight down
  // against the real platform meshes (exact surface for flat/ramp/curved), and
  // the ramp mesh rotation sign was corrected. Starting gentle.
  rampChance: [0.22, 0.32],  // tilted boards you roll up/down (and launch off the top) — common from the start
  rampLenBoost: [1.5, 1.0], // ramps run longer than a normal pad (esp. early) — relaxed climbs, not panic jumps
  rampSlope: [0.22, 0.42],   // rise/run (tan of the ramp angle)
  rampLaunch: 0.7,           // fraction of climb speed kept as a hop off an up-ramp
  curveChance: [0.05, 0.25],  // boards curved across their width
  curveAmount: [0.04, 0.14], // parabola steepness, RANDOM per board: gentle slopes up to dramatic half-pipes
  curveForce: 16,            // sideways "gravity" — multiplied by the (random) curve, so a deep bowl pulls hard, a soft one barely
  leanChance: [0.05, 0.4],   // boards banked left/right (independent of ramp/curve); chance ramps with difficulty — near-zero early, common at peak
  leanAmount: [0.03, 0.22],  // sideways tilt (rise/run across the width), RANDOM per board; the upper bound grows with difficulty so it starts barely-there
  leanForce: 14,             // downhill "gravity" while riding a banked board — multiplied by the (random) lean, so a steep bank drags hard

  // Powerups / powerdowns
  powerupChance: 0.3,     // chance a path platform spawns a pickup (bumped — the wide sprawl has room for more)
  // Rune plates: a board TYPE you trigger by LANDING on (not a dodgeable floater).
  // The chance a board is a rune RAMPS UP with distance [near, far] so deep runs
  // force harder routing. Gated down by how many effects you already have active
  // (see runeLoadFactor) so they ease off while you're juggling powerups.
  runeChance: [0.06, 0.34],
  runeLoadFactor: 0.4,    // each currently-active effect cuts the rune chance by this much (1 - n*factor); ~2 effects = a trickle, 3+ = almost none until they expire
  magnetDuration: 15,
  magnetRadius: 32,       // gems within this distance get sucked in
  magnetPull: 22,         // how hard the magnet yanks gems (higher = they catch up)
  slowDuration: 10,
  slowFactor: 0.72,       // forward speed multiplier while slowed (gentler than before)
  slowEase: 2.4,          // seconds to ease INTO the slow (so it's not sudden)
  reverseDuration: 10,
  surgeDuration: 7,
  surgeAmount: 16,        // extra forward speed while surged (a powerdown)
  invulnTime: 1.2,        // brief mercy window after a shielded hit
  doubleJumpDuration: 16, // grants one mid-air jump
  flightDuration: 12,     // hold jump to soar
  flightLift: 19,         // upward speed while flying
  morphDuration: 20,      // ball deforms and steering goes wobbly
  morphWobble: 12,         // strength of the steering wobble while morphed (cranked — hard to control)
  tripDuration: 20,       // psychedelic powerdown: colors go wild (more of a vibe than a real handicap)
  lowgravDuration: 20,    // floaty moon-gravity — jumps and bounces go huge
  lowgravScale: 0.45,     // gravity multiplier while low-grav is active
  flubberDuration: 20,    // powerdown: every landing auto-bounces you (steer in the air!)
  flubberBounce: 1.3,     // bounce velocity = jumpSpeed * this (a bit higher than a jump)
  blackoutDuration: 18,   // powerdown: the lights cut out — only glowing platform edges and a faint ball remain
  blackoutDim: 0.3,
  rainDuration: 16,       // powerdown: heavy rain on the windshield — streaks, sliding drops, blurred vision (cousin of fog)
  fogDuration: 25,        // powerdown: a wall of grey smoke rolls in so you can't read distant platforms (distinct from blackout)
  fogNear: 80, fogFar: 230,        // normal fog distances (clear & far-seeing)
  fogBlindNear: 42, fogBlindFar: 95, // "fogged" distances — clear close (obstacles still readable ~2s out), grey wall beyond
  fogSmokeColor: 0x494d55, // dark mid-grey the fog tints toward while fogged — under the bloom threshold (no glow), dims the deep field into murk, neutral enough to read as smoke not blue shadow

  // Secret cheat code (half-Contra, no A/B) entered on the start/game-over
  // screen: floods the field with extra items so you can test powerups fast.
  // Durations stay TRUE to each powerup — only the quantity changes.
  cheatCode: ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"],
  cheatItemMultiplier: 5, // how many times as many gems/powerups spawn

  // Score & combo economy. A single Score = distance * multiplier (+ gems and
  // near-miss bonuses). The multiplier climbs as you take risks and decays if you
  // play it safe; a survived mistake (shielded hit) resets it.
  scorePerMeter: 1,
  gemScore: 25,
  nearMissBonus: 50,
  nearMissMargin: 1.2,  // grazing an obstacle within this extra distance = near-miss
  multiplierMax: 12,
  comboDecay: 4,        // seconds without a combo event before the multiplier drops 1

  // Risk/reward: riding out powerdowns cranks your scoring multiplier. Each active
  // powerdown adds this much, and every powerdown beyond the first adds an extra
  // STACK bonus on top — so surviving three at once scores far more than three
  // one-at-a-time. Adds on top of the combo multiplier; lasts only while they're active.
  powerdownMult: 1,        // multiplier added per active powerdown
  powerdownStackBonus: 1,  // extra multiplier per powerdown beyond the first (when several stack)

  // Death: game over only once you fall this far below the LOWEST floor still
  // drawn near you (i.e. there's genuinely nothing left to land on).
  fallMargin: 16,

  // Starter platform
  starterLength: 64,
  starterWidth: 18,

  // --- Audiosurf mode: the world pulses ON the music's beat. The two rhythmic
  // tracks ("Neon Highway" #4 124bpm, "Pulse Runner" #5 134bpm) are the only ones
  // with full drums — the other three are ambient and wouldn't feel synced. We
  // force #5 (the driving one) when the mode turns on.
  audiosurfTrack: 4,        // index into TRACKS — "Pulse Runner" (the most beat-forward)
  audiosurfBloomKick: 0.7,  // bloom/sun flash added on each beat (a touch stronger now)
  audiosurfFovKick: 1.0,    // degrees of FOV punch on each beat — kept SMALL (camera movement was distracting)
  audiosurfLightKick: 0.4,  // fraction the scene lights brighten on each beat — the GROUND flash pump
  audiosurfSkyKick: 0.8,    // how much the skyline windows flash brighter on each beat
  audiosurfDecay: 7,        // how fast the pulse decays per second (higher = punchier/snappier)
  audiosurfReducedScale: 0.4, // soften the whole pulse this much when reduced-motion is on
};

// Themed zones the run passes through. Each retints the fog + sun, restricts the
// platform texture set, AND drives the backdrop mood: a signature window-glow tint
// + a hue the skyline cycle CENTERS on (so each zone reads as its own colour
// family while still gently shifting), plus moon + nebula tints. All in the same
// "neon dusk" system from DESIGN.md — distinct moods, one cohesive world.
//   skylineHue  — 0..1 hue the per-window glow biases toward (skyline stays in this family)
//   skylineSpread — how far around skylineHue the gentle cycle is allowed to wander
//   skyline     — bright window-glow colour (the accent the towers light up)
//   moon        — moon body tint
//   nebula      — nebula/cloud tint
//   bloom       — extra bloom strength while in this zone (a signature flare level)
export const BIOMES = [
  // Neon City — cool blue dusk, teal + magenta window glow (the baseline city).
  { name: "Neon City", until: 600, fog: 0x141a33, sun: 0xfff2d6,
    textures: ["concrete", "brick", "tile"],
    skylineHue: 0.83, skylineSpread: 0.14, skyline: 0xff4bd6, moon: 0xbfe3ff, nebula: 0x6a7bff, bloom: 0.0 },
  // Sunset Dunes — warm rose-amber haze, golden windows, an amber moon.
  { name: "Sunset Dunes", until: 1300, fog: 0x3a1d2a, sun: 0xffb066,
    textures: ["wood", "brick", "pebble"],
    skylineHue: 0.06, skylineSpread: 0.06, skyline: 0xffb04a, moon: 0xffcf9a, nebula: 0xff6a8a, bloom: 0.08 },
  // Ice Caverns — cold cyan + white, frozen window light, a pale-blue moon.
  { name: "Ice Caverns", until: 2200, fog: 0x123244, sun: 0xcfeaff,
    textures: ["marble", "tile", "concrete"],
    skylineHue: 0.52, skylineSpread: 0.08, skyline: 0x9af0ff, moon: 0xeaffff, nebula: 0x6ad6ff, bloom: 0.12 },
  // The Void — deep violet + blue, eerie violet glow, dim flare.
  { name: "The Void", until: Infinity, fog: 0x0a0614, sun: 0xb06bff,
    textures: ["pebble", "marble", "concrete"],
    skylineHue: 0.72, skylineSpread: 0.1, skyline: 0xa05bff, moon: 0xcaa6ff, nebula: 0x7a3bff, bloom: 0.18 },
];

export function biomeAt(z) {
  for (let i = 0; i < BIOMES.length; i++) if (z < BIOMES[i].until) return i;
  return BIOMES.length - 1;
}

// Peak height of a full jump and the air time it grants — used by the platform
// generator to guarantee the next stepping stone is always reachable.
export function jumpReach() {
  const h = (CONFIG.jumpSpeed * CONFIG.jumpSpeed) / (2 * CONFIG.gravity);
  const airTime = (2 * CONFIG.jumpSpeed) / CONFIG.gravity;
  return { height: h, airTime };
}

// Linear interpolate an [easy, hard] config pair by the 0..1 difficulty.
export function ramp(pair, d) {
  return pair[0] + (pair[1] - pair[0]) * d;
}

// Eased difficulty curve: gentle at the start (and near the peak), steeper in
// the middle. Keeps the opening calm so the game eases the player in.
export function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
