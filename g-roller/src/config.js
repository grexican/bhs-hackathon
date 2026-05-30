// All the gameplay numbers in one place. Built on the original Unity
// GameManager values, tuned so the web version feels good and the main path is
// always reachable with a well-timed jump.

export const CONFIG = {
  // Player movement (units per second)
  sideSpeed: 19,
  forwardSpeed: 22,         // starting auto-run speed (eases up from here)
  maxForwardSpeed: 60,
  jumpSpeed: 25,
  gravity: 34,
  playerRadius: 0.9,

  // Variable jump: releasing jump while rising chops upward speed for a fast drop
  quickDescentDivisor: 1.7,

  // Speed boost pads
  boostAmount: 14,
  boostDuration: 1.6,

  // Difficulty ramp. EVERYTHING below is an [easy, hard] pair: it interpolates
  // from EASY (difficulty 0, the very start) to HARD (difficulty 1, reached at
  // difficultyDistance). The curve is eased (smoothstep), so the opening stretch
  // stays calm and the chaos builds in gradually instead of being random from
  // step one.
  speedRampEvery: 7,
  speedRampAmount: 1.2,
  difficultyDistance: 2200, // metres travelled before difficulty hits its peak

  // Platform path generation. The main path is a guaranteed-reachable chain of
  // stepping stones; side platforms are optional bonus routes.
  keepAheadDistance: 155,
  cullBehindDistance: 60,
  pathRiseSafety: 0.6,      // fraction of max jump height a step may rise
  pathGapSafety: 0.5,       // fraction of jump distance a forward gap may span
  pathLateralSafety: 0.42,  // fraction of strafe reach a sideways step may take
  maxBandX: 30,             // keep the path within this horizontal band

  // Pad size: starts long & wide, gets shorter & narrower as you go.
  padLenLo: [24, 8],
  padLenHi: [34, 13],
  padWidthLo: [13, 6],
  padWidthHi: [16, 8.5],

  // Navigation: gaps, sideways steps and height changes all start tiny and grow
  // toward the reachable maximum (fractions of the computed jump reach).
  gapFracLo: [0.15, 0.5],
  gapFracHi: [0.34, 1.0],
  lateralFrac: [0.1, 1.0],
  riseFrac: [0.25, 1.0],
  dropDepth: [-2.5, -8],

  // Hazards: all start at (near) zero and ramp in with difficulty.
  obstacleChance: [0.0, 0.5],    // chance a path platform carries an obstacle
  movingChance: [0.0, 0.4],      // chance a path platform slides around
  moveAmp: [3, 10],              // how far a moving platform slides
  sharpTurnChance: [0.0, 0.34],  // chance of a sudden lateral path change
  forkChance: [0.0, 0.2],        // chance of an alternate branch platform
  goodPowerupChance: [0.9, 0.5], // pickups start almost all good, then sour

  // Powerups / powerdowns
  powerupChance: 0.18,    // chance a path platform floats a power pickup
  magnetDuration: 7,
  slowDuration: 5,
  slowFactor: 0.6,        // forward speed multiplier while slowed
  reverseDuration: 5,
  surgeDuration: 4,
  surgeAmount: 16,        // extra forward speed while surged (a powerdown)
  invulnTime: 1.2,        // brief mercy window after a shielded hit
  doubleJumpDuration: 9,  // grants one mid-air jump
  flightDuration: 5,      // hold jump to soar
  flightLift: 13,         // upward speed while flying
  morphDuration: 6,       // ball deforms and steering goes wobbly
  morphWobble: 7,         // strength of the steering wobble while morphed

  // Death: fall this far below the last platform you touched and it's game over
  fallMargin: 22,

  // Starter platform
  starterLength: 56,
  starterWidth: 16,
  safeSteps: 7, // long, flat, close-together pads with no hazards to start
};

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
