// Tuning harness — NOT a pass/fail test. Simulates a full run for each tier and
// prints the metrics that matter for game feel, so we can DERIVE good config numbers
// (density, gap headroom, reachability) by reading a table instead of replaying the
// game by hand. Run with: npm run test:sim
//
// What to look for:
//   plats/100m   — platform density. Easy should be HIGHER than Hard (more options).
//   gap %max     — how much of the reachable gap the path uses. Headroom = 100% - this.
//                  Easy should sit lower (comfy); Hard can push toward ~90% (committed).
//   reach branch — % of branch platforms actually within a jump of the path. Should be
//                  high on every tier (low = the "unreachable scattered items" bug).

import { planStep, planScatter } from "../src/gen/planPath.js";
import { CONFIG } from "../src/config.js";
import { TIERS, makeCtx, freshState, seededRng, speedAt } from "./helpers.js";

const DISTANCE = 6000; // metres per run
const SEEDS = [11, 22, 33, 44, 55];

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (x) => `${(x * 100).toFixed(0)}%`;

function runTier(profile) {
  const m = {
    paths: 0, scatter: 0, obstacles: 0, movers: 0, splines: 0, tunnels: 0, yaws: 0, ramps: 0,
    gapRatios: [], riseRatios: [], latRatios: [], reachable: 0, branchTotal: 0,
    minY: 0, maxY: 0, minX: 0, maxX: 0, dist: 0,
  };
  for (const seed of SEEDS) {
    const rng = seededRng(seed);
    const state = freshState();
    while (state.cursor.z < DISTANCE) {
      const z = state.cursor.z;
      const ctx = makeCtx(profile, z, speedAt(z, profile), rng);
      const plan = planStep(state, ctx);
      const b = ctx.budgets;
      if (plan.kind === "path") m.paths++;
      if (plan.kind === "spline") m.splines++;
      if (plan.kind === "tunnel") m.tunnels++;
      if (plan.obstacle) m.obstacles++;
      if (plan.mover) m.movers++;
      if (plan.yaw) m.yaws++;
      if (plan.slopeZ) m.ramps++;
      if (b.maxGap > 0) m.gapRatios.push(plan.gap / b.maxGap);
      if (plan.kind === "path") {
        if (b.maxRise > 0) m.riseRatios.push(plan.rise / b.maxRise);
        if (b.maxLateral > 0) m.latRatios.push(Math.abs(plan.lateral) / b.maxLateral);
        for (const br of planScatter(plan, state, ctx)) {
          m.scatter++;
          m.branchTotal++;
          const horiz = Math.abs(br.x - plan.x);
          const vert = Math.abs(br.y - plan.exitY);
          if (horiz <= b.maxLateral && vert <= b.maxRise) m.reachable++;
        }
      }
      m.minY = Math.min(m.minY, state.cursor.y); m.maxY = Math.max(m.maxY, state.cursor.y);
      m.minX = Math.min(m.minX, state.cursor.x); m.maxX = Math.max(m.maxX, state.cursor.x);
      m.dist = state.cursor.z;
    }
  }
  return m;
}

console.log(`\nG-Roller generation sim — ${DISTANCE}m × ${SEEDS.length} seeds per tier\n`);
const cols = ["tier", "plats/100m", "gap %max(avg/med/max)", "rise %max", "lat %max", "reach branch", "obst/100m", "mover/100m", "spline/100m", "yaw/100m", "Y range", "X range"];
console.log(cols.join(" | "));
console.log(cols.map((c) => "-".repeat(c.length)).join("-|-"));

for (const profile of TIERS) {
  const m = runTier(profile);
  const totalDist = m.dist * SEEDS.length;
  const per100 = (n) => (n / totalDist * 100).toFixed(1);
  const total = m.paths + m.scatter + m.splines + m.tunnels;
  const row = [
    profile.name.padEnd(4),
    per100(total).padStart(10),
    `${pct(avg(m.gapRatios))}/${pct(median(m.gapRatios))}/${pct(Math.max(...m.gapRatios))}`.padStart(21),
    pct(avg(m.riseRatios)).padStart(9),
    pct(avg(m.latRatios)).padStart(8),
    pct(m.branchTotal ? m.reachable / m.branchTotal : 1).padStart(12),
    per100(m.obstacles).padStart(9),
    per100(m.movers).padStart(10),
    per100(m.splines).padStart(11),
    per100(m.yaws).padStart(8),
    `${m.minY.toFixed(0)}..${m.maxY.toFixed(0)}`.padStart(7),
    `${m.minX.toFixed(0)}..${m.maxX.toFixed(0)}`.padStart(7),
  ];
  console.log(row.join(" | "));
}
console.log("");
