import { describe, it, expect } from "vitest";
import { planStep, planScatter } from "../src/gen/planPath.js";
import { CONFIG } from "../src/config.js";
import { TIERS, makeCtx, freshState, seededRng, speedAt, assertFinitePlan } from "./helpers.js";

const EPS = 1e-6;

// Walk a full run for one tier/seed, calling the generator the way the game does.
function simulate(profile, seed, steps = 800) {
  const rng = seededRng(seed);
  const state = freshState();
  const plans = [];
  for (let i = 0; i < steps; i++) {
    const z = state.cursor.z;
    const ctx = makeCtx(profile, z, speedAt(z, profile), rng);
    const plan = planStep(state, ctx);
    plan._ctx = ctx; // stash the budgets used, so the assertions know the ceiling
    plans.push(plan);
  }
  return plans;
}

describe("reachability invariant — the path is always solvable", () => {
  for (const profile of TIERS) {
    for (const seed of [1, 7, 42, 1337, 99999]) {
      it(`${profile.name} seed=${seed}: every step stays within jump reach`, () => {
        for (const p of simulate(profile, seed)) {
          assertFinitePlan(p);
          const b = p._ctx.budgets;
          // Forward gap never exceeds the reachable max (and is sane, >= the floor).
          expect(p.gap).toBeLessThanOrEqual(b.maxGap + EPS);
          expect(p.gap).toBeGreaterThanOrEqual(0);
          if (p.kind === "path") {
            // Rise and strafe per step stay inside their reach budgets.
            expect(p.rise).toBeLessThanOrEqual(b.maxRise + EPS);
            expect(Math.abs(p.lateral)).toBeLessThanOrEqual(b.maxLateral + EPS);
          }
        }
      });
    }
  }
});

describe("structure cooldowns are respected", () => {
  for (const profile of TIERS) {
    it(`${profile.name}: tunnels & splines never violate their cooldown`, () => {
      const plans = simulate(profile, 2024, 1500);
      let lastTunnel = -Infinity, lastSpline = -Infinity, idx = 0;
      for (const p of plans) {
        if (p.kind === "tunnel") {
          expect(idx - lastTunnel).toBeGreaterThanOrEqual(CONFIG.gen.tunnel.cooldown);
          lastTunnel = idx;
        }
        if (p.kind === "spline") {
          expect(idx - lastSpline).toBeGreaterThanOrEqual(CONFIG.gen.spline.cooldown);
          lastSpline = idx;
        }
        idx++;
      }
    });
  }
});

describe("launch runway — a flipper always has straight ground to land on", () => {
  for (const profile of TIERS) {
    it(`${profile.name}: every runway board stays straight, and flippers spawn runways`, () => {
      const plans = simulate(profile, 7777, 2500);
      let flippers = 0, runwayBoards = 0;
      for (const p of plans) {
        if (p.type === "flipper") flippers++;
        // The accurate invariant: the runway keeps boards straight up to WHERE THE BALL LANDS
        // (the onRunway flag), not a fixed count — a correctly-sized runway covers fewer boards
        // than the old (buggy) 906m one but still spans the whole flight.
        if (p.onRunway) {
          runwayBoards++;
          expect(Math.abs(p.lateral)).toBeLessThanOrEqual(1.0);
        }
      }
      expect(flippers).toBeGreaterThan(0);   // we actually exercised the case
      expect(runwayBoards).toBeGreaterThan(0); // flippers really do lay runway boards
    });
  }
});

describe("launch runway is BOUNDED — the flipper-straight-1000m bug is fixed", () => {
  it("the post-flipper runway never exceeds the generation horizon (was 907m > 800m)", () => {
    // The latent root cause: flipperFlightDistance sized off maxSpeed gave ~907m, which doesn't
    // even fit keepAheadDistance(800) — so a flipper locked a straight strip longer than the world
    // ever generates. Now it's sized off realistic flight and hard-clamped to <= 540.
    const plans = simulate(TIERS[2], 7777, 2500); // Hard = fastest = longest runway
    let maxRunwaySpan = 0, spanStart = null;
    for (const p of plans) {
      if (p.onRunway && spanStart === null) spanStart = p.z - p.len / 2;
      if (!p.onRunway && spanStart !== null) { /* runway ended on the previous board */ spanStart = null; }
    }
    // Re-walk measuring each contiguous runway's z-span.
    let curStart = null, curEnd = null;
    for (const p of plans) {
      if (p.onRunway) { if (curStart === null) curStart = p.z - p.len / 2; curEnd = p.z + p.len / 2; }
      else if (curStart !== null) { maxRunwaySpan = Math.max(maxRunwaySpan, curEnd - curStart); curStart = null; }
    }
    expect(maxRunwaySpan).toBeGreaterThan(0);
    expect(maxRunwaySpan).toBeLessThanOrEqual(660); // clamp 540 + the boundary board's far-edge slack (~one board len)
    expect(maxRunwaySpan).toBeLessThan(CONFIG.world.keepAheadDistance); // the old bug: 907 > 800
  });
});

describe("the safe intro is straight and undecorated", () => {
  it("first gen.safeStraight steps carry no hazards/tilt", () => {
    const rng = seededRng(5);
    const state = freshState();
    for (let i = 0; i < CONFIG.gen.safeStraight; i++) {
      const z = state.cursor.z;
      const plan = planStep(state, makeCtx(TIERS[1], z, speedAt(z, TIERS[1]), rng));
      expect(plan.safe).toBe(true);
      expect(plan.obstacle).toBeNull();
      expect(plan.motion).toBeNull();
      expect(plan.slopeZ).toBe(0);
      expect(plan.yaw).toBe(0);
    }
  });
});
