import { describe, it, expect } from "vitest";
import { planStep, planScatter } from "../src/gen/planPath.js";
import { hazardChance, dramaChance } from "../src/gen/progression.js";
import { CONFIG } from "../src/config.js";
import { tier, makeCtx, freshState, seededRng, speedAt } from "./helpers.js";

const EASY = tier("Easy"), MED = tier("Medium"), HARD = tier("Hard");

// Average number of branch (scatter) platforms a tier spawns per step, deep enough
// in that all tiers are fully opened up — isolating the `density` axis.
function avgScatterCount(profile, z = 2500, seeds = 60) {
  let total = 0;
  for (let s = 0; s < seeds; s++) {
    const rng = seededRng(1000 + s);
    const state = freshState();
    // advance past the safe intro so scatter actually fires
    let plan;
    for (let i = 0; i <= CONFIG.gen.safeStraight; i++) {
      state.cursor.z = z; // pin distance so openness is constant across the sample
      plan = planStep(state, makeCtx(profile, z, speedAt(z, profile), rng));
    }
    total += planScatter(plan, state, makeCtx(profile, z, speedAt(z, profile), rng)).length;
  }
  return total / seeds;
}

describe("density inverts with difficulty (the paradox fix)", () => {
  it("Easy spawns MORE branch platforms than Medium than Hard", () => {
    const e = avgScatterCount(EASY), m = avgScatterCount(MED), h = avgScatterCount(HARD);
    // More options on Easy = more forgiving; fewer on Hard = commit to the right route.
    expect(e).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(h);
  });
});

// How wide the critical path actually sweeps for a tier — the metric behind "Medium
// felt too tight, Hard's sprawl is the fun one". Measures peak |x| of the route deep
// in a run (past the openness ramp, so it isolates the `sprawl` knob at the plateau).
function pathSpan(profile, seed = 314, steps = 1200) {
  const rng = seededRng(seed);
  const state = freshState();
  let maxAbsX = 0;
  for (let i = 0; i < steps; i++) {
    const z = state.cursor.z;
    planStep(state, makeCtx(profile, z, speedAt(z, profile), rng));
    if (z > 1500) maxAbsX = Math.max(maxAbsX, Math.abs(state.cursor.x)); // sample at the plateau
  }
  return maxAbsX;
}

describe("sprawl widens with difficulty AT THE PLATEAU (not just during ramp-up)", () => {
  it("the route sweeps wider: Easy < Medium < Hard, even deep in a run", () => {
    // This is the fix for "Hard feels like Medium": openness saturates, so without the
    // sprawl knob all tiers had the SAME plateau width. Now they diverge.
    const e = pathSpan(EASY), m = pathSpan(MED), h = pathSpan(HARD);
    expect(m).toBeGreaterThan(e * 1.2);
    expect(h).toBeGreaterThan(m * 1.2);
  });
});

describe("hazard frequency rises with difficulty", () => {
  it("obstacle chance: Easy < Medium < Hard at the same distance", () => {
    const d = 0.3; // mid-run, below the hazardCeil clamp
    const e = hazardChance(CONFIG.gen.hazard.obstacleChance, d, EASY);
    const m = hazardChance(CONFIG.gen.hazard.obstacleChance, d, MED);
    const h = hazardChance(CONFIG.gen.hazard.obstacleChance, d, HARD);
    expect(e).toBeLessThan(m);
    expect(m).toBeLessThan(h);
  });

  it("never exceeds the hazard ceiling, even on Hard deep in a run", () => {
    expect(hazardChance(CONFIG.gen.hazard.obstacleChance, 1, HARD)).toBeLessThanOrEqual(CONFIG.gen.hazardCeil + 1e-9);
  });
});

describe("drama (spectacle) rises with difficulty", () => {
  it("spline chance: Easy < Medium < Hard", () => {
    const d = 0.5;
    expect(dramaChance(CONFIG.gen.spline.chance, d, EASY)).toBeLessThan(dramaChance(CONFIG.gen.spline.chance, d, MED));
    expect(dramaChance(CONFIG.gen.spline.chance, d, MED)).toBeLessThan(dramaChance(CONFIG.gen.spline.chance, d, HARD));
  });
});

describe("trampolines cluster at the depths (the bounce-back-into-play safety net)", () => {
  it("branch pieces below the path are bouncy more often than ones at/above it", () => {
    const rng = seededRng(2025);
    const state = freshState();
    let deepBouncy = 0, deepTotal = 0, highBouncy = 0, highTotal = 0;
    for (let i = 0; i < 3000; i++) {
      const z = state.cursor.z;
      const ctx = makeCtx(EASY, z, speedAt(z, EASY), rng);
      const plan = planStep(state, ctx);
      if (plan.kind !== "path") continue;
      for (const b of planScatter(plan, state, ctx)) {
        if (b.y < plan.exitY) { deepTotal++; if (b.type === "bouncy") deepBouncy++; }
        else { highTotal++; if (b.type === "bouncy") highBouncy++; }
      }
    }
    expect(deepTotal).toBeGreaterThan(50);
    expect(highTotal).toBeGreaterThan(50);
    expect(deepBouncy / deepTotal).toBeGreaterThan(highBouncy / highTotal);
  });
});

describe("pace rises with difficulty", () => {
  it("Easy < Medium < Hard", () => {
    expect(EASY.pace).toBeLessThan(MED.pace);
    expect(MED.pace).toBeLessThan(HARD.pace);
  });
});
