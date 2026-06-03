// eyes-flipper — measure the REAL flipper landing distance vs the runway the generator builds.
//
// The flipper bug ("run straight for 1000m") was the runway sized off flipper.maxSpeed (a
// per-frame velocity CAP) instead of the realistic integrated arc. This script replays the
// ACTUAL game speed model (game.js _onLanded launch + _effectiveSpeed easing + accel decay)
// across the launch airtime and integrates forward distance, so we can size the runway from
// data. It prints, per tier & launch speed, the true landing distance, the runway the generator
// now reserves, and whether the runway safely covers the landing (incl. a surge speed-up case).
//
// Run: node scripts/eyes-flipper.mjs

import { CONFIG } from "../src/config.js";

const P = CONFIG.player, fp = CONFIG.plates.flipper, ac = CONFIG.plates.accel, ef = CONFIG.effects;

// Analytic airtime of the flipper launch (rise on weak gravity, fall on full).
function airtime() {
  const vy = P.jumpSpeed * fp.vertical;
  return vy / P.riseGravity + vy / Math.sqrt(P.riseGravity * P.gravity);
}

// The runway the generator reserves (mirrors planPath.flipperFlightDistance + the clamp).
const CLAMP_LO = 150, CLAMP_HI = 540;
function runwayLen(genSpeed) {
  const t = airtime();
  const avgBoost = Math.min(ac.max, fp.forward) * 0.75;
  const raw = (genSpeed + avgBoost) * t + 60;
  return Math.max(CLAMP_LO, Math.min(CLAMP_HI, raw));
}

// Simulate the forward distance actually travelled during the airtime, replaying game.js:
//   launch: _speed += forward (cap maxSpeed); accelBonus += forward (cap accel.max); accelHold set
//   frame: target = genSpeed + accelBonus (+surge); _speed eases toward target (tau 0.33);
//          accelHold counts down, then accelBonus decays linearly; distance += _speed*dt
function simLanding(genSpeed, { surge = false } = {}) {
  const T = airtime();
  const dt = 1 / 120;
  let speed = Math.min(fp.maxSpeed, genSpeed + fp.forward);
  let accelBonus = Math.min(ac.max, fp.forward);
  let accelHold = ac.hold;
  let dist = 0;
  for (let t = 0; t < T; t += dt) {
    let target = genSpeed + accelBonus;
    if (surge) target += ef.surgeAmount; // worst case: a surge powerdown fires mid-flight
    target = Math.min(fp.maxSpeed, target);
    speed += (target - speed) * (1 - Math.exp(-dt / 0.33));
    if (accelHold > 0) accelHold -= dt;
    else accelBonus = Math.max(0, accelBonus - ac.decay * dt);
    dist += speed * dt;
  }
  return dist;
}

console.log(`\nFlipper flight measurement — vertical=${fp.vertical} forward=${fp.forward} launchSpeed=${fp.launchSpeed} maxSpeed=${fp.maxSpeed}`);
console.log(`airtime=${airtime().toFixed(2)}s  peakHeight=${((P.jumpSpeed*fp.vertical)**2/(2*P.riseGravity)).toFixed(0)}u  keepAhead=${CONFIG.world.keepAheadDistance}m\n`);
const cols = ["genSpeed", "landing(m)", "landing+surge(m)", "runway(m)", "covers?", "covers+surge?"];
console.log(cols.join(" | "));
console.log(cols.map((c) => "-".repeat(c.length)).join("-|-"));

// genSpeed ranges across tiers: base(24)..max(63) × pace(0.92..1.15) ≈ 22..72
for (const gs of [22, 30, 40, 50, 60, 72]) {
  const land = simLanding(gs);
  const landS = simLanding(gs, { surge: true });
  const rw = runwayLen(gs);
  const ok = rw >= land ? "YES" : `NO (-${(land - rw).toFixed(0)})`;
  const okS = rw >= landS ? "YES" : `NO (-${(landS - rw).toFixed(0)})`;
  console.log([
    String(gs).padStart(8), land.toFixed(0).padStart(10), landS.toFixed(0).padStart(16),
    rw.toFixed(0).padStart(9), ok.padStart(7), okS.padStart(13),
  ].join(" | "));
}
console.log(`\nrunway must always be >= keepAhead? max runway=${runwayLen(72).toFixed(0)} <= ${CONFIG.world.keepAheadDistance} : ${runwayLen(72) <= CONFIG.world.keepAheadDistance ? "OK" : "FAIL"}\n`);
