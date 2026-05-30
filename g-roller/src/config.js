// All the gameplay numbers in one place. Built on the original Unity
// GameManager values, tuned so the web version feels good and the main path is
// always reachable with a well-timed jump.

export const CONFIG = {
  // Player movement (units per second)
  sideSpeed: 20,
  forwardSpeed: 24,         // starting auto-run speed (eases up from here) — 5% slower
  maxForwardSpeed: 63,
  jumpSpeed: 31.5,          // another ~10% jump height
  gravity: 39,
  playerRadius: 0.9,

  // Variable jump: releasing jump while rising chops upward speed for a fast drop
  quickDescentDivisor: 1.7,

  // Forgiveness so edge/just-landed jumps always register:
  coyoteTime: 0.1,       // still jump for this long after rolling off a ledge
  jumpBufferTime: 0.13,  // a jump pressed this soon before landing still fires

  // Speed boost pads
  boostAmount: 14,
  boostDuration: 1.6,

  // Two eased ramps drive everything. SPREAD opens the field up FAST (degrees of
  // freedom — the path starts to wander wide, up and over, through a scattered
  // cloud of branch platforms). HAZARD ramps the danger in SLOWLY (obstacles,
  // movers, shrinking pads, powerdowns). Each [easy, hard] pair interpolates from
  // its ramp's value 0 -> 1. So the world sprawls into a journey early while
  // staying gentle, and only gets genuinely dangerous deep into a run.
  speedRampEvery: 7,
  speedRampAmount: 1.2,
  spreadDistance: 650,      // metres before the field is fully "spread out"
  difficultyDistance: 1500, // metres before hazards hit their peak (ramps in sooner)

  keepAheadDistance: 175,
  cullBehindDistance: 65,
  pathRiseSafety: 0.6,      // fraction of max jump height a step may rise
  pathGapSafety: 0.5,       // fraction of jump distance a forward gap may span
  pathLateralSafety: 0.42,  // fraction of strafe reach a sideways step may take
  safeStraight: 4,          // first few pads run straight ahead, no spread

  // --- Critical path (the guaranteed-reachable chain). Opens up with SPREAD. ---
  gapFracLo: [0.18, 0.5],
  gapFracHi: [0.4, 1.0],
  lateralFrac: [0.3, 1.0],  // how much of the reachable strafe a step may use
  riseFrac: [0.35, 1.0],    // how much of the reachable rise a step may use
  dropDepth: [-3, -9],      // how far a step may drop
  bandX: [18, 64],          // how far the path may wander left/right (grows wide)
  driftEvery: [4, 8],       // steps between picking a new wander target
  driftY: [16, 46],         // vertical reach of wander targets (the up-and-over)

  // --- Scatter cloud: branch platforms strewn around the path for the sprawl. ---
  cloudCount: [1, 4],       // extra platforms per step (grows with spread)
  cloudRadiusX: [12, 50],   // how wide the cloud scatters
  cloudRadiusY: [7, 26],    // how tall the cloud scatters (parallax layers)
  cloudZSpread: 28,         // depth jitter of cloud platforms around the front

  // --- Pad size: starts long & wide, gets shorter & narrower with HAZARD. ---
  padLenLo: [24, 8],
  padLenHi: [34, 13],
  padWidthLo: [13, 6],
  padWidthHi: [16, 8.5],

  // --- Hazards: a small floor right after the safe intro (so spikes, obstacles
  // and moving platforms show up early), ramping to their peak. ---
  obstacleChance: [0.14, 0.6],
  movingChance: [0.22, 0.62],     // moving boards are a big part of the mix now
  moveAmp: [4, 11],
  sharpTurnChance: [0.08, 0.38],
  goodPowerupChance: [0.9, 0.5],

  // --- Tunnels: a short run of glowing rings you roll through. Kept short so
  // the exit is always visible past it in the third-person camera. ---
  tunnelChance: [0.0, 0.16],
  tunnelCooldown: 6,   // min normal steps between tunnels
  tunnelLength: 34,
  tunnelRings: 7,
  tunnelRadius: 4.5,

  // --- Ramps & curved boards ---
  rampChance: [0.0, 0.2],    // tilted boards you roll up/down (and launch off the top)
  rampSlope: [0.24, 0.5],    // rise/run (tan of the ramp angle)
  rampLaunch: 0.8,           // fraction of climb speed kept as a hop off an up-ramp
  curveChance: [0.0, 0.16],  // boards curved across their width
  curveAmount: 0.055,        // parabola steepness (concave funnels in, convex rolls off)
  curveForce: 17,            // how hard a curved board pushes you sideways

  // Powerups / powerdowns
  powerupChance: 0.18,    // chance a path platform floats a power pickup
  magnetDuration: 12,
  magnetRadius: 32,       // gems within this distance get sucked in
  magnetPull: 22,         // how hard the magnet yanks gems (higher = they catch up)
  slowDuration: 9,
  slowFactor: 0.6,        // forward speed multiplier while slowed
  reverseDuration: 8,
  surgeDuration: 7,
  surgeAmount: 16,        // extra forward speed while surged (a powerdown)
  invulnTime: 1.2,        // brief mercy window after a shielded hit
  doubleJumpDuration: 16, // grants one mid-air jump
  flightDuration: 6,      // hold jump to soar (shortened — it was the strongest effect)
  flightLift: 17,         // upward speed while flying
  morphDuration: 11,      // ball deforms and steering goes wobbly
  morphWobble: 7,         // strength of the steering wobble while morphed
  tripDuration: 13,       // psychedelic powerdown: colors go wild, hard to see

  // Secret cheat code (half-Contra, no A/B) entered on the start/game-over
  // screen: spawns extra items and makes every timed power last cheatDuration.
  cheatCode: ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"],
  cheatItemMultiplier: 3, // how many times as many gems/powerups spawn
  cheatDuration: 20,      // seconds every timed powerup/powerdown lasts in cheat mode

  // Score & combo economy. A single Score = distance * multiplier (+ gems and
  // near-miss bonuses). The multiplier climbs as you take risks and decays if you
  // play it safe; a survived mistake (shielded hit) resets it.
  scorePerMeter: 1,
  gemScore: 25,
  nearMissBonus: 50,
  nearMissMargin: 1.2,  // grazing an obstacle within this extra distance = near-miss
  multiplierMax: 12,
  comboDecay: 4,        // seconds without a combo event before the multiplier drops 1

  // Death: game over only once you fall this far below the LOWEST floor still
  // drawn near you (i.e. there's genuinely nothing left to land on).
  fallMargin: 16,

  // Starter platform
  starterLength: 56,
  starterWidth: 16,
};

// Themed zones the run passes through. Each retints the fog + sun and restricts
// the platform texture set, so the world visibly changes as you go deeper.
export const BIOMES = [
  { name: "Neon City",    until: 600,      fog: 0x141a33, sun: 0xfff2d6, textures: ["concrete", "brick", "tile"] },
  { name: "Sunset Dunes", until: 1300,     fog: 0x3a1d2a, sun: 0xffb066, textures: ["wood", "brick", "pebble"] },
  { name: "Ice Caverns",  until: 2200,     fog: 0x123244, sun: 0xcfeaff, textures: ["marble", "tile", "concrete"] },
  { name: "The Void",     until: Infinity, fog: 0x0a0614, sun: 0xb06bff, textures: ["pebble", "marble", "concrete"] },
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
