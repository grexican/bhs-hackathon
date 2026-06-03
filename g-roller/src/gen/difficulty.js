// The DIFFICULTY RATING + BUDGET — pure, no THREE. Two jobs, kept deliberately simple (one scalar
// + one cap reusing the existing danger ramp), per the Council-of-7 verdict that the full
// rating×budget×sawtooth system was over-engineered and risked double-counting the danger/openness
// ramps the generator already runs.
//
//   boardDifficulty(plan) → 0..1   DESCRIPTIVE. How hard a single board reads, from its OWN
//     properties (pad size, obstacle, motion, tilt). Drives the HUD/branch-reward and the cap guard.
//   criticalCap(profile, z) → 0..~1  PRESCRIPTIVE. The most difficulty the MANDATORY path is allowed
//     at distance z on this tier. The generator rolls a board's features in cost order and STOPS
//     adding once boardDifficulty(so-far) ≥ cap — so Easy/early stays calm, Hard/late gets spicier.
//
// PRECEDENCE (load-bearing): reachability ALWAYS wins. The generator clamps geometry (gap/rise/
// lateral) to jump reach FIRST (safety); the difficulty cap only STRIPS decoration (balance); the
// rating just REPORTS what survived. The cap must NEVER relax a reachability budget.

import { CONFIG } from "../config.js";
import { danger } from "./progression.js";
import { pieceFor, obstacleDifficulty } from "./pieces.js";

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Read-difficulty order from the moving-platform research (linear < spin < wag < slide < orbit).
// Period (speed) is the master multiplier — a fast mover is much harder than a slow one.
export const MOTION_BASE = { lift: 0.25, spin: 0.35, wag: 0.45, slide: 0.6, orbit: 0.9 };

// A board's pad is "generous" up to this area (the biggest early pad: lenHi[0] × widthHi[0]).
// Smaller than that reads progressively harder to land on.
const PAD_REF_AREA = CONFIG.gen.pad.lenHi[0] * CONFIG.gen.pad.widthHi[0];

// How hard a motion is to deal with. Eli's model: DISTANCE + TIME = the movement difficulty — i.e.
// the SPEED the player must react to. For POSITIONAL motions (lift/slide/orbit) that's the peak
// board velocity ≈ amplitude·2π/period (a wide, fast sweep is much harder than a small slow one).
// Rotational motions (spin/wag) don't move the landing spot, so only their cycle speed matters.
// Falls back to the cycle-speed term when amplitude isn't known (bare descriptors / unit tests).
export function motionDifficulty(motion) {
  if (!motion || !motion.type) return 0;
  const base = MOTION_BASE[motion.type] ?? 0.3;
  const period = Math.max(0.5, motion.period || 3);
  const positional = motion.type === "lift" || motion.type === "slide" || motion.type === "orbit";
  let factor;
  if (positional && motion.amp != null) {
    factor = 0.4 + Math.min(1.1, (motion.amp * 2 * Math.PI / period) / 30); // peak velocity (~30 u/s = peak)
  } else {
    factor = 2.5 / period; // cycle speed only (shorter period = harder)
  }
  return Math.min(1, base * factor);
}

// 0..1 difficulty of one board from its own (generator-decided) properties.
export function boardDifficulty(plan) {
  const area = Math.max(1, plan.w * plan.len);
  const padTerm = clamp01(1 - area / PAD_REF_AREA);

  // Obstacle difficulty (incl. the patrol surcharge) comes from the self-describing OBSTACLE_DEFS.
  const obstacleTerm = obstacleDifficulty(plan.obstacle);

  const motionTerm = motionDifficulty(plan.motion);

  let tiltTerm = 0;
  if (plan.slopeZ) tiltTerm += 0.1;
  if (plan.curve) tiltTerm += 0.1;
  if (plan.leanX) tiltTerm += 0.1;
  if (plan.yaw) tiltTerm += 0.1;
  if (plan.spline) tiltTerm += 0.15;

  // Each piece carries a small intrinsic difficulty (a flipper/round pad reads a touch harder than
  // a plain slab before any decoration) — declared in the self-describing piece registry.
  const base = pieceFor(plan.type, plan.geoType).baseDifficulty;
  return clamp01(base + 0.4 * padTerm + 0.35 * obstacleTerm + 0.5 * motionTerm + 0.15 * tiltTerm);
}

// The critical-path difficulty ceiling at distance z for a tier. Reuses the existing danger(z) ramp
// (NOT a third progression curve) so it can never contradict the tier-ordering the danger ramp
// already enforces. A periodic rest beat dips the cap so the mandatory path breathes (sawtooth
// pacing — the single most-repeated finding across the difficulty-budget research).
export function criticalCap(profile, z, stepIndex = 0) {
  const floor = profile.diffFloor ?? 0.25;
  const span = profile.diffSpan ?? 0.5;
  let cap = floor + danger(z, profile) * span;
  // Rest beat: every Nth non-safe segment, pull the cap right down for one board (a breather).
  if (stepIndex > 0 && stepIndex % CONFIG.gen.restBeatEvery === 0) cap *= CONFIG.gen.restBeatScale;
  return cap;
}

// Branch (optional route) difficulty LICENSE: the more alternate routes co-exist in a stretch, the
// harder an individual optional branch is allowed to be — because the player can always take a safe
// one. This is the risk/reward lever (a dense field = many options = a piece CAN be very hard & rare
// and carry a kickass powerup more often). Returns the multiplier applied to criticalCap for branches.
export function branchLicense(altRoutes) {
  return 1 + CONFIG.gen.branchLicensePerRoute * Math.min(altRoutes, CONFIG.gen.branchLicenseMaxRoutes);
}
