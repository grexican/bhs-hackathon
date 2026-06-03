// eyes-run — the CORE METRICS DASHBOARD. Generates 0–10000m for Easy/Med/Hard and prints, per
// distance band, the things the redesign is about: REACHABILITY (every step within jump reach — a
// violation prints "IMPOSSIBLE!"), VARIETY (board + motion mix, options), and the DIFFICULTY FACTOR
// (a 0..1 aggregate from the actual knobs that reads "this is easy / hard"). Use it to confirm the
// final maths produce the expected outcomes: factor should rise with distance, Easy < Med < Hard,
// and reachability must NEVER be violated.
//
// Run: node scripts/eyes-run.mjs

import { planStep, planScatter } from "../src/gen/planPath.js";
import { boardDifficulty, criticalCap } from "../src/gen/difficulty.js";
import { CONFIG } from "../src/config.js";
import { TIERS, makeCtx, freshState, seededRng, speedAt } from "../tests/helpers.js";

const BANDS = [[0, 1000], [1000, 2000], [2000, 3000], [3000, 5000], [5000, 10000]];
const SEEDS = [11, 22, 33, 44, 55, 66];
const bandOf = (z) => BANDS.findIndex(([a, b]) => z >= a && z < b);

function run(profile) {
  const bands = BANDS.map(() => ({
    n: 0, diff: 0, cap: 0, moving: 0, obst: 0, tilt: 0, spline: 0,
    gapMax: 0, riseMax: 0, latMax: 0, impossible: 0, motion: {}, scatter: 0, scatterAbsX: 0, scatterN: 0,
  }));
  for (const seed of SEEDS) {
    const rng = seededRng(seed);
    const state = freshState();
    while (state.cursor.z < 10000) {
      const z = state.cursor.z;
      const ctx = makeCtx(profile, z, speedAt(z, profile), rng);
      const plan = planStep(state, ctx);
      const bi = bandOf(z);
      if (bi < 0) continue;
      const m = bands[bi], b = ctx.budgets;
      m.n++;
      m.diff += boardDifficulty(plan);
      m.cap += criticalCap(profile, z, plan === plan ? state.stepIndex : 0);
      if (plan.motion) { m.moving++; m.motion[plan.motion.type] = (m.motion[plan.motion.type] || 0) + 1; }
      if (plan.obstacle) m.obst++;
      if (plan.slopeZ || plan.curve || plan.leanX || plan.yaw) m.tilt++;
      if (plan.kind === "spline") m.spline++;
      if (b.maxGap > 0) m.gapMax = Math.max(m.gapMax, plan.gap / b.maxGap);
      if (plan.kind === "path") {
        if (b.maxRise > 0) m.riseMax = Math.max(m.riseMax, plan.rise / b.maxRise);
        if (b.maxLateral > 0) m.latMax = Math.max(m.latMax, Math.abs(plan.lateral) / b.maxLateral);
        // IMPOSSIBLE = a step that asks for more than a jump can deliver.
        if (plan.gap > b.maxGap + 1e-6 || plan.rise > b.maxRise + 1e-6 || Math.abs(plan.lateral) > b.maxLateral + 1e-6) m.impossible++;
        for (const s of planScatter(plan, state, ctx)) { m.scatter++; m.scatterN++; m.scatterAbsX += Math.abs(s.x - plan.x); }
      }
    }
  }
  return bands;
}

function fmtMotion(mot) {
  const keys = Object.keys(mot).sort((a, b) => mot[b] - mot[a]);
  return keys.length ? keys.map((k) => `${k[0]}${k[1]}:${mot[k]}`).join(" ") : "—";
}

console.log(`\neyes-run — core metrics, 0–10000m × ${SEEDS.length} seeds/tier`);
console.log(`DIFFICULTY FACTOR = avg boardDifficulty(0..1). Expect: rises with distance, Easy<Med<Hard, 0 IMPOSSIBLE.\n`);
for (const profile of TIERS) {
  console.log(`── ${profile.name} ${"─".repeat(72)}`);
  const cols = ["band(m)", "diff", "AGG ", "%mov", "%obst", "%tilt", "gap%", "lat%", "REACH", "motionMix", "scat/path"];
  console.log(cols.join(" | "));
  const bands = run(profile);
  bands.forEach((m, i) => {
    const pct = (x) => `${Math.round(100 * x / Math.max(1, m.n))}%`;
    const verdict = m.impossible ? `IMPOSSIBLE!(${m.impossible})` : "ok";
    const pathN = Math.max(1, m.n - m.spline);
    const avgDiff = m.diff / Math.max(1, m.n);
    const scatPerPath = m.scatterN / pathN;
    // Holistic AGGREGATE difficulty FACTOR — combines the per-board feature difficulty with the
    // structural levers that actually make a tier harder: SPEED (faster = less reaction time) and
    // OPTION SCARCITY (fewer branches = commit to the one path). This is the "easy vs hard" number.
    const midZ = (BANDS[i][0] + BANDS[i][1]) / 2;
    const speedNorm = speedAt(midZ, profile) / CONFIG.player.forwardSpeed;       // 0.9 .. ~2.6
    const optionFactor = 1 + 0.35 * Math.max(0, 2 - scatPerPath);                 // few options = harder
    const agg = avgDiff * speedNorm * optionFactor;
    console.log([
      `${BANDS[i][0]}-${BANDS[i][1]}`.padEnd(7),
      avgDiff.toFixed(2).padStart(4),
      agg.toFixed(2).padStart(4),
      pct(m.moving).padStart(4),
      pct(m.obst).padStart(5),
      pct(m.tilt).padStart(5),
      `${(m.gapMax * 100).toFixed(0)}`.padStart(4),
      `${(m.latMax * 100).toFixed(0)}`.padStart(4),
      verdict.padStart(5),
      fmtMotion(m.motion).padEnd(18),
      `${scatPerPath.toFixed(1)} @${(m.scatterAbsX / Math.max(1, m.scatterN)).toFixed(0)}u`,
    ].join(" | "));
  });
  console.log("");
}
