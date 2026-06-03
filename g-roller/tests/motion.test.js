import { describe, it, expect } from "vitest";
import { planStep, planScatter } from "../src/gen/planPath.js";
import { CONFIG } from "../src/config.js";
import { TIERS, makeCtx, freshState, seededRng, speedAt } from "./helpers.js";

const EPS = 1e-6;
const CRITICAL_OK = new Set(["lift", "slide", "spin"]);

// Walk a run, yielding each path plan with the budgets it was generated under.
function* walk(profile, seed, steps = 3000) {
  const rng = seededRng(seed);
  const state = freshState();
  for (let i = 0; i < steps; i++) {
    const z = state.cursor.z;
    const ctx = makeCtx(profile, z, speedAt(z, profile), rng);
    const plan = planStep(state, ctx);
    yield { plan, ctx, state };
  }
}

describe("critical-path motion is restricted to the engine-safe types", () => {
  for (const profile of TIERS) {
    it(`${profile.name}: every MOVING critical board is lift/slide/spin (never wag/orbit)`, () => {
      let moving = 0;
      for (const { plan } of walk(profile, 4242)) {
        if (plan.kind === "path" && plan.motion) {
          moving++;
          expect(CRITICAL_OK.has(plan.motion.type)).toBe(true);
        }
      }
      expect(moving).toBeGreaterThan(0); // we actually exercised moving critical boards
    });
  }
});

describe("a critical spin board is always a ROUND pad (landing spot stays put)", () => {
  it("spin never appears on a box critical board", () => {
    for (const profile of TIERS) {
      for (const { plan } of walk(profile, 777)) {
        if (plan.kind === "path" && plan.motion && plan.motion.type === "spin") {
          expect(plan.geoType).not.toBe("box");
        }
      }
    }
  });
});

describe("moving critical boards stay REACHABLE at every phase (amp reserved from reach headroom)", () => {
  for (const profile of TIERS) {
    it(`${profile.name}: a lift's highest top and a slide's farthest x never leave jump reach`, () => {
      for (const { plan, ctx } of walk(profile, 31337)) {
        if (plan.kind !== "path" || !plan.motion) continue;
        const b = ctx.budgets, m = plan.motion;
        if (m.type === "lift") {
          // highest landing-surface rise from the previous board = rise + hy + amp, must clear a jump.
          expect(plan.rise + plan.hy + m.amp).toBeLessThanOrEqual(b.maxRise + EPS);
        } else if (m.type === "slide") {
          expect(Math.abs(plan.lateral) + m.amp).toBeLessThanOrEqual(b.maxLateral + EPS);
        }
      }
    });
  }
});

describe("no obstacle ever rides a moving board (the hitbox would desync from the visual)", () => {
  it("a board never carries BOTH motion and an obstacle", () => {
    for (const profile of TIERS) {
      for (const { plan } of walk(profile, 9001)) {
        if (plan.motion) expect(plan.obstacle).toBeNull();
      }
    }
  });
});

describe("motion appears EARLY (the floor) but never in the onboarding grace", () => {
  it("no moving board within the safe intro or the first few non-safe steps", () => {
    const rng = seededRng(5);
    const state = freshState();
    const grace = CONFIG.gen.safeStraight + CONFIG.gen.motion.firstNonSafeQuiet;
    for (let i = 0; i < grace; i++) {
      const plan = planStep(state, makeCtx(TIERS[1], state.cursor.z, speedAt(state.cursor.z, TIERS[1]), rng));
      expect(plan.motion).toBeNull();
    }
  });
  it("every tier is alive early, and harder tiers' movers are more INTENSE (faster/bigger)", () => {
    // The model: motion FREQUENCY is similar across tiers early (an ambient floor keeps the world
    // alive; frequency ramps slowly on danger so no tier is over-busy early). The tier DIFFERENCE is
    // the mover INTENSITY — peak velocity (amp·2π/period) — which rides danger, so Hard's danger
    // ramping faster makes its movers noticeably faster/bigger over a run.
    const frac = {}, intensity = {};
    for (const profile of TIERS) {
      let path = 0, moving = 0, velSum = 0, velN = 0;
      for (const seed of [1, 2, 3, 7, 11, 42, 99, 123]) {
        for (const { plan } of walk(profile, seed, 1200)) {
          if (plan.kind !== "path" || plan.z < 300 || plan.z > 5000) continue;
          path++;
          if (plan.motion) {
            moving++;
            if (plan.motion.amp && plan.motion.period) { velSum += plan.motion.amp * 2 * Math.PI / plan.motion.period; velN++; }
          }
        }
      }
      frac[profile.name] = moving / Math.max(1, path);
      intensity[profile.name] = velN ? velSum / velN : 0;
    }
    for (const t of TIERS) expect(frac[t.name]).toBeGreaterThan(0.04); // alive on every tier
    expect(intensity.Hard).toBeGreaterThan(intensity.Easy);            // harder tier = more intense motion
  });
});

describe("branch (optional) routes MAY use the richer motions", () => {
  it("wag/orbit appear on branches (they're banned only from the critical path)", () => {
    let richBranch = 0;
    for (const { plan, state, ctx } of walk(TIERS[2], 2468, 4000)) {
      if (plan.kind !== "path") continue;
      for (const b of planScatter(plan, state, ctx)) {
        if (b.motion && (b.motion.type === "wag" || b.motion.type === "orbit")) richBranch++;
      }
    }
    expect(richBranch).toBeGreaterThan(0);
  });
});

describe("motion period is bounded AND jittered (not a static, formulaic rate)", () => {
  it("every period is in a sane catch-window range (2–8s)", () => {
    for (const profile of TIERS) {
      for (const { plan } of walk(profile, 808, 2000)) {
        if (plan.motion) { expect(plan.motion.period).toBeGreaterThanOrEqual(2.0); expect(plan.motion.period).toBeLessThanOrEqual(8.0); }
      }
    }
  });
  it("periods VARY board-to-board at a similar distance (so movers aren't all synced to one rate)", () => {
    // A static `ramp(period,D)` would make every mover in a band identical (formulaic). The per-board
    // jitter must produce real spread. Sample a mid-run window across seeds for enough movers.
    const periods = [];
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      for (const { plan } of walk(TIERS[1], seed, 900)) {
        if (plan.motion && plan.z > 1500 && plan.z < 4000) periods.push(plan.motion.period);
      }
    }
    expect(periods.length).toBeGreaterThan(10);
    const min = Math.min(...periods), max = Math.max(...periods);
    expect(max - min).toBeGreaterThan(0.5); // genuine variety, not one repeated value
  });
});
