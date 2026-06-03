import { describe, it, expect } from "vitest";
import { jumpReach, budgets } from "../src/gen/reach.js";
import { CONFIG, sideSpeedAt } from "../src/config.js";

describe("jumpReach", () => {
  it("returns a positive peak height and air time", () => {
    const r = jumpReach();
    expect(r.height).toBeGreaterThan(0);
    expect(r.airTime).toBeGreaterThan(0);
  });

  it("the floaty (weak rise gravity) jump is taller than a symmetric one would be", () => {
    // With riseGravity < gravity, the ascent floats higher than gravity alone implies.
    const v = CONFIG.player.jumpSpeed;
    const symmetric = (v * v) / (2 * CONFIG.player.gravity);
    expect(jumpReach().height).toBeGreaterThan(symmetric);
  });
});

describe("budgets", () => {
  it("forward gap scales linearly with speed; rise does not", () => {
    const slow = budgets(20);
    const fast = budgets(40);
    expect(fast.maxGap).toBeCloseTo(slow.maxGap * 2, 5);
    expect(fast.maxRise).toBeCloseTo(slow.maxRise, 5); // rise is set by jump height, not speed
  });

  it("applies the configured safety fractions", () => {
    const b = budgets(30);
    const r = jumpReach();
    expect(b.maxRise).toBeCloseTo(r.height * CONFIG.gen.reach.rise, 5);
    expect(b.maxGap).toBeCloseTo(30 * r.airTime * CONFIG.gen.reach.gap, 5);
    expect(b.maxLateral).toBeCloseTo(sideSpeedAt(30) * r.airTime * CONFIG.gen.reach.lateral, 5);
  });
});
