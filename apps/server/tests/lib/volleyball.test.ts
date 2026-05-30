import { describe, expect, it } from "vitest";

import { EMPTY_STATS, buildPlayerReport, computeMetrics, gradeMetric, type RawStats } from "../../src/lib/volleyball.js";

// A sample attacking line: 30 swings, 12 kills, 3 errors over 4 sets.
const sample: RawStats = {
  ...EMPTY_STATS,
  sets_played: 4,
  attack_attempts: 30,
  kills: 12,
  attack_errors: 3,
  serve_attempts: 10,
  aces: 1,
  serve_errors: 1,
};

describe("computeMetrics", () => {
  it("computes hitting percentage as (kills - errors) / attempts", () => {
    const m = computeMetrics(sample);
    expect(m.hitting_pct).toBeCloseTo((12 - 3) / 30, 5); // .300
    expect(m.kills_per_set).toBeCloseTo(3, 5);
  });

  it("returns null when there's no data to divide by", () => {
    const m = computeMetrics(EMPTY_STATS);
    expect(m.hitting_pct).toBeNull();
    expect(m.kills_per_set).toBeNull();
  });
});

describe("gradeMetric — the same number is graded differently per level", () => {
  it("scores a .300 hitting% higher at varsity than at college", () => {
    const varsity = gradeMetric("hitting_pct", 0.3, "varsity");
    const college = gradeMetric("hitting_pct", 0.3, "college");
    expect(varsity.score).toBeGreaterThan(college.score);
    // .300 is good-to-elite at varsity, only average at college.
    expect(varsity.tier === "strong" || varsity.tier === "elite").toBe(true);
  });

  it("reports the honest level correlation (solid/elite up-to)", () => {
    const g = gradeMetric("hitting_pct", 0.3, "varsity");
    expect(g.solidUpTo).not.toBeNull();
    // A .300 hitter is solid at least through varsity.
    expect(["varsity", "club", "college"]).toContain(g.solidUpTo);
  });

  it("handles lower-is-better metrics (serve errors)", () => {
    const clean = gradeMetric("serve_err_pct", 0.04, "varsity"); // very few errors
    const messy = gradeMetric("serve_err_pct", 0.25, "varsity"); // lots of errors
    expect(clean.score).toBeGreaterThan(messy.score);
  });
});

describe("buildPlayerReport", () => {
  it("produces a position-weighted overall rating and a 'plays like' level", () => {
    const report = buildPlayerReport(sample, "OH", "varsity", 1);
    expect(report.overall.score).toBeGreaterThan(0);
    expect(report.overall.score).toBeLessThanOrEqual(100);
    expect(report.metrics.length).toBeGreaterThan(0);
    // The headline metric for an outside hitter should be present.
    expect(report.metrics.some((m) => m.id === "kills_per_set")).toBe(true);
  });
});
