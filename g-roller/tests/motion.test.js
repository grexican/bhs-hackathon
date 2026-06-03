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
  it("the early-mid game already has moving parts, scaling Easy < Med < Hard ('more, earlier')", () => {
    // Robust measure of "more moving parts, EARLIER": the FRACTION of path boards that move in the
    // early-mid band (300–2500m), averaged over seeds. Every tier must clear a floor (alive early);
    // easier tiers move LESS (the ordering). Less seed-sensitive than the first-occurrence z.
    const frac = {};
    for (const profile of TIERS) {
      let path = 0, moving = 0;
      for (const seed of [1, 2, 3, 7, 11, 42, 99, 123]) {
        for (const { plan } of walk(profile, seed, 1200)) {
          if (plan.kind === "path" && plan.z >= 300 && plan.z <= 5000) { path++; if (plan.motion) moving++; }
        }
      }
      frac[profile.name] = moving / Math.max(1, path);
    }
    expect(frac.Easy).toBeGreaterThan(0.04);    // calm but ALIVE — never sleepy
    expect(frac.Medium).toBeGreaterThan(frac.Easy);
    expect(frac.Hard).toBeGreaterThan(frac.Medium); // Hard moves the most
    expect(frac.Hard).toBeGreaterThan(0.15);
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

describe("motion period is bounded (a catch window recurs within an airtime)", () => {
  it("every motion period sits inside the configured tier range", () => {
    for (const profile of TIERS) {
      const [a, b] = profile.motionPeriod;
      const lo = Math.min(a, b) - EPS, hi = Math.max(a, b) + EPS;
      for (const { plan } of walk(profile, 808, 2000)) {
        if (plan.motion) { expect(plan.motion.period).toBeGreaterThanOrEqual(lo); expect(plan.motion.period).toBeLessThanOrEqual(hi); }
      }
    }
  });
});
