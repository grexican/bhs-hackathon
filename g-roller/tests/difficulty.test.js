import { describe, it, expect } from "vitest";
import { boardDifficulty, criticalCap, motionDifficulty, branchLicense, MOTION_BASE } from "../src/gen/difficulty.js";
import { CONFIG } from "../src/config.js";
import { tier } from "./helpers.js";

const EASY = tier("Easy"), MED = tier("Medium"), HARD = tier("Hard");
// A plain, generous, featureless board (near-zero difficulty baseline).
const base = () => ({ w: 23, len: 70, slopeZ: 0, curve: 0, leanX: 0, yaw: 0, spline: null, obstacle: null, motion: null });

describe("boardDifficulty is monotonic in each factor", () => {
  it("a generous featureless pad is near-zero; a tiny one is higher", () => {
    expect(boardDifficulty(base())).toBeLessThan(0.05);
    const small = { ...base(), w: 8, len: 14 };
    expect(boardDifficulty(small)).toBeGreaterThan(boardDifficulty(base()));
  });
  it("adding an obstacle raises difficulty; a patrolling one raises it more", () => {
    const stat = { ...base(), obstacle: { kind: "barrier" } };
    const patrol = { ...base(), obstacle: { kind: "barrier", move: true } };
    expect(boardDifficulty(stat)).toBeGreaterThan(boardDifficulty(base()));
    expect(boardDifficulty(patrol)).toBeGreaterThan(boardDifficulty(stat));
  });
  it("a harder obstacle kind rates higher (overhead > spikes)", () => {
    const spikes = { ...base(), obstacle: { kind: "spikes" } };
    const overhead = { ...base(), obstacle: { kind: "overhead" } };
    expect(boardDifficulty(overhead)).toBeGreaterThan(boardDifficulty(spikes));
  });
  it("adding motion raises difficulty; a faster motion (shorter period) raises it more", () => {
    const slow = { ...base(), motion: { type: "lift", period: 4 } };
    const fast = { ...base(), motion: { type: "lift", period: 2 } };
    expect(boardDifficulty(slow)).toBeGreaterThan(boardDifficulty(base()));
    expect(boardDifficulty(fast)).toBeGreaterThan(boardDifficulty(slow));
  });
  it("tilt/curve/lean/yaw/spline each add", () => {
    for (const f of [{ slopeZ: 0.3 }, { curve: 0.1 }, { leanX: 0.1 }, { yaw: 0.2 }, { spline: {} }]) {
      expect(boardDifficulty({ ...base(), ...f })).toBeGreaterThan(boardDifficulty(base()));
    }
  });
  it("stays within [0,1] even when everything is stacked", () => {
    const max = { w: 7, len: 8, slopeZ: 0.4, curve: 0.14, leanX: 0.2, yaw: 0.28, spline: {}, obstacle: { kind: "overhead", move: true }, motion: { type: "orbit", period: 1.5 } };
    const d = boardDifficulty(max);
    expect(d).toBeGreaterThan(0.6);
    expect(d).toBeLessThanOrEqual(1);
  });
});

describe("motionDifficulty orders the motion types (read-difficulty)", () => {
  it("lift < spin < wag < slide < orbit at equal period", () => {
    const at = (type) => motionDifficulty({ type, period: 3 });
    expect(at("lift")).toBeLessThan(at("spin"));
    expect(at("spin")).toBeLessThan(at("wag"));
    expect(at("wag")).toBeLessThan(at("slide"));
    expect(at("slide")).toBeLessThan(at("orbit"));
  });
});

describe("criticalCap: Easy < Medium < Hard, and rises with distance", () => {
  // Use a stepIndex that is NOT a rest-beat multiple so we compare the trend, not a dip.
  const STEP = 1;
  it("cap ordering holds across the whole distance domain (not just the plateau)", () => {
    for (const z of [0, 200, 1000, 3000, 8000]) {
      const e = criticalCap(EASY, z, STEP), m = criticalCap(MED, z, STEP), h = criticalCap(HARD, z, STEP);
      expect(e).toBeLessThan(m);
      expect(m).toBeLessThan(h);
    }
  });
  it("the cap rises with distance on every tier", () => {
    for (const t of [EASY, MED, HARD]) {
      expect(criticalCap(t, 4000, STEP)).toBeGreaterThan(criticalCap(t, 100, STEP));
    }
  });
  it("the rest beat dips the cap below its neighbours", () => {
    const z = 3000;
    const restStep = CONFIG.gen.restBeatEvery; // a multiple → rest beat fires
    expect(criticalCap(MED, z, restStep)).toBeLessThan(criticalCap(MED, z, restStep + 1));
  });
});

describe("branchLicense rewards more escape routes (risk/reward)", () => {
  it("more routes ⇒ a higher allowed branch difficulty, capped", () => {
    expect(branchLicense(0)).toBe(1);
    expect(branchLicense(1)).toBeGreaterThan(branchLicense(0));
    expect(branchLicense(3)).toBeGreaterThan(branchLicense(1));
    expect(branchLicense(99)).toBeCloseTo(branchLicense(CONFIG.gen.branchLicenseMaxRoutes)); // capped
  });
});
