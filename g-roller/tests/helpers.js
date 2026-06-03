// Shared scaffolding for the generation tests. Lets a test say "give me Hard at
// 3000m with this seed" and get back the exact ctx/state the real generator uses.

import { CONFIG } from "../src/config.js";
import { mulberry32, makeRng } from "../src/gen/rng.js";
import { openness, danger } from "../src/gen/progression.js";
import { budgets } from "../src/gen/reach.js";

export const TIERS = CONFIG.gen.tiers;
export const tier = (name) => CONFIG.gen.tiers.find((t) => t.name === name);

// A seeded random source — same seed → same world, every run.
export const seededRng = (seed) => makeRng(mulberry32(seed));

// The per-step context the planners read. `z` is how far into the run we are;
// `forwardSpeed` sets the jump-reach budgets (faster = bigger reachable gaps).
export function makeCtx(profile, z, forwardSpeed, rng, itemMultiplier = 1, bias = undefined) {
  return {
    profile,
    O: openness(z, profile),
    D: danger(z, profile),
    budgets: budgets(forwardSpeed),
    genSpeed: forwardSpeed, // sustainable auto-run speed — sizes the flipper runway
    rng,
    itemMultiplier,
    bias, // per-biome drama weighting; undefined → generator uses its neutral default
  };
}

// A fresh walking state at the origin (matches PlatformField.reset()).
export function freshState() {
  return {
    cursor: { x: 0, y: 0, z: 0 },
    stepIndex: 0,
    stepsSinceTunnel: 0,
    stepsSinceSpline: 0,
    drift: { x: 0, y: 0 },
    driftSteps: CONFIG.gen.safeStraight,
    launchRunwayUntilZ: 0,
  };
}

// Rough model of the live auto-run speed at distance z for a tier, mirroring the
// game's speed ramp (game.js): base * pace, nudged up speedRampAmount every
// speedRampEvery metres, capped at maxForwardSpeed. Used so the sim/tests size
// reach budgets the way the real run does.
export function speedAt(z, profile) {
  const p = CONFIG.player;
  const nudges = Math.floor(z / CONFIG.world.speedRampEvery) * CONFIG.world.speedRampAmount;
  return Math.min((p.forwardSpeed + nudges) * profile.pace, p.maxForwardSpeed * profile.pace);
}

// Every numeric field on a plan must be finite (catch NaN/undefined regressions).
export function assertFinitePlan(plan) {
  for (const k of ["x", "y", "z", "w", "len", "hy", "slopeZ", "curve", "leanX", "yaw", "gap"]) {
    if (!Number.isFinite(plan[k])) throw new Error(`plan.${k} is not finite: ${plan[k]} (kind=${plan.kind})`);
  }
}
