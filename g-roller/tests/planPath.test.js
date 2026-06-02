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
    it(`${profile.name}: the steps right after a flipper barely veer sideways`, () => {
      const plans = simulate(profile, 7777, 2500);
      let flippers = 0;
      for (let i = 0; i < plans.length; i++) {
        if (plans[i].type !== "flipper") continue;
        flippers++;
        // The next up-to-4 critical-path boards form the landing strip — kept straight
        // so the forward fling finds ground (tunnels/splines in between stay centered).
        let runway = 0;
        for (let j = i + 1; j < plans.length && runway < 4; j++) {
          if (plans[j].kind !== "path") continue;
          runway++;
          expect(Math.abs(plans[j].lateral)).toBeLessThanOrEqual(1.0);
        }
      }
      expect(flippers).toBeGreaterThan(0); // make sure we actually exercised the case
    });
  }
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
      expect(plan.mover).toBeNull();
      expect(plan.slopeZ).toBe(0);
      expect(plan.yaw).toBe(0);
    }
  });
});
