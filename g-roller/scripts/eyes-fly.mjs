// ⚠️ APPROXIMATE PLAYTESTER — not authoritative. A faithful full-game auto-pilot is brittle (the
// floaty variable-height jump + x-aim is hard to drive perfectly), so falls here are usually
// AUTO-PILOT misjudgements, NOT generator reachability bugs. The AUTHORITATIVE reachability check is
// the per-step geometric one in tests/planPath.test.js + scripts/eyes-run.mjs (every consecutive
// path step is within jump reach by construction). Use this only as a rough "does a decent player
// get far" smell test. Per-mechanic real-gravity checks live in scripts/eyes-physics.mjs.
//
// eyes-fly — a HEADLESS AUTO-PLAYER that "plays with real gravity".
//
// It generates a run with the pure generator (src/gen/*), then flies the ball through it with the
// REAL player kinematics (the floaty asymmetric-gravity jump, sideSpeed strafe, terminalVelocity)
// and a down-"raycast" surface query against the generated boards — the same model player.js uses,
// minus THREE. An auto-pilot that can ONLY steer X (like a real player) follows the critical path,
// jumping to clear gaps/rises. If a perfect-ish auto-pilot FALLS, that flags a reachability bug the
// geometry-only tests can't see (the Council's "green tests != fair game"). Reports, per tier:
// completion rate, avg distance reached, where it falls, longest dead-straight stretch, max airborne.
//
// This is the behavioural reachability net for the motion + flipper redesign work.
// Run: node scripts/eyes-fly.mjs            (optionally: node scripts/eyes-fly.mjs --verbose)

import { CONFIG, jumpReach } from "../src/config.js";
import { planStep, planScatter } from "../src/gen/planPath.js";
import { makeRng, mulberry32 } from "../src/gen/rng.js";
import { openness, danger } from "../src/gen/progression.js";
import { budgets } from "../src/gen/reach.js";

const P = CONFIG.player;
const VERBOSE = process.argv.includes("--verbose");
const TARGET = 5000;        // metres to attempt per run
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];

// Mirror game.js speed ramp so reach budgets match the real run.
function speedAt(z, profile) {
  const nudges = Math.floor(z / CONFIG.world.speedRampEvery) * CONFIG.world.speedRampAmount;
  return Math.min((P.forwardSpeed + nudges) * profile.pace, P.maxForwardSpeed * profile.pace);
}

// Walk the generator and collect every board with a pure surface-height function. The auto-pilot
// follows the CRITICAL path (kind path/tunnel/spline, in order); scatter boards are extra footing.
function buildRun(profile, seed) {
  const rng = makeRng(mulberry32(seed));
  const state = { cursor: { x: 0, y: 0, z: 0 }, stepIndex: 0, stepsSinceTunnel: 0, stepsSinceSpline: 0, drift: { x: 0, y: 0 }, driftSteps: CONFIG.gen.safeStraight, launchRunwayUntilZ: 0 };
  const boards = [], path = [];
  // starter board (matches PlatformField.reset)
  boards.push(flatBoard(0, 0, CONFIG.world.starterLength / 2 - 4, CONFIG.world.starterWidth, CONFIG.world.starterLength, 0.5));
  while (state.cursor.z < TARGET) {
    const z = state.cursor.z;
    const ctx = { profile, O: openness(z, profile), D: danger(z, profile), budgets: budgets(speedAt(z, profile)), genSpeed: speedAt(z, profile), rng, itemMultiplier: 1, bias: undefined };
    const plan = planStep(state, ctx);
    const b = boardFromPlan(plan);
    boards.push(b);
    if (plan.kind === "path" || plan.kind === "tunnel" || plan.kind === "spline") path.push(b);
    for (const s of planScatter(plan, state, ctx)) boards.push(boardFromPlan(s));
  }
  return { boards, path };
}

function flatBoard(x, y, z, w, len, hy) {
  return { x, y, z, w, len, hy, kind: "path", type: "normal", surf: () => y + hy };
}

// Build a board with a pure surface-height function surf(lx, lz) (local offsets from center).
function boardFromPlan(p) {
  const yc = p.y, hy = p.hy;
  let surf;
  if (p.spline) {
    surf = (lx, lz) => yc + p.spline.sampler.heightAt(lz); // meander shifts X; height is the landable surface
  } else if (p.slopeZ) {
    surf = (lx, lz) => yc + p.slopeZ * lz;
  } else if (p.curve) {
    surf = (lx, lz) => yc + p.curve * lx * lx;
  } else if (p.leanX) {
    surf = (lx, lz) => yc + p.leanX * lx;
  } else {
    surf = () => yc + hy;
  }
  return { x: p.x, y: yc, z: p.z, w: p.w, len: p.len, hy, kind: p.kind, type: p.type, slopeZ: p.slopeZ, spline: p.spline, surf };
}

// Footprint test (axis-aligned; yaw approximated as its bounding box — fine for a reachability net).
function onFootprint(b, x, z) {
  const hx = b.spline ? b.w / 2 + 6 : b.w / 2;
  return Math.abs(x - b.x) <= hx + 0.45 && Math.abs(z - b.z) <= b.len / 2 + 0.05;
}
function topAt(b, x, z) { return b.surf(x - b.x, z - b.z); }

// The highest landable surface the feet cross onto this frame (mirrors player._floorBelow:
// land only if we crossed down through it, or stick to the board we're already riding).
function floorBelow(boards, x, z, prevBottom, newBottom, ride) {
  let best = null;
  for (const b of boards) {
    if (!onFootprint(b, x, z)) continue;
    const top = topAt(b, x, z);
    if (b === ride) { if (newBottom <= top + 0.7) cand(top, b); continue; }
    if (prevBottom >= top - 0.6 && newBottom <= top + 0.05) cand(top, b);
  }
  function cand(top, b) { if (!best || top > best.y) best = { y: top, b }; }
  return best;
}

// Lowest landable top near z (death is measured against this). Matches game.lowestTopNear EXACTLY:
// filters by z ONLY (NOT x) — so you never die while any tile you could have reached is on screen.
function lowestTopNear(boards, z) {
  let min = Infinity;
  for (const b of boards) {
    if (b.z < z - 25 || b.z > z + 190) continue;
    const t = b.spline ? b.y + b.spline.sampler.minOffset : b.y + (b.surf(0, 0) - b.y);
    if (t < min) min = t;
  }
  return min === Infinity ? -Infinity : min;
}

// Predict the forward z where the ball, at (y, vy) now, falls back down to height yLand — using the
// real asymmetric gravity (rise weak, fall strong). Returns extra z travelled at the given speed.
function landingZAhead(y, vy, yLand, speed) {
  // time to apex (if rising), apex height, then fall to yLand under full gravity.
  let t = 0, peak = y;
  if (vy > 0) { t += vy / P.riseGravity; peak = y + (vy * vy) / (2 * P.riseGravity); }
  const drop = Math.max(0, peak - yLand);
  t += Math.sqrt((2 * drop) / P.gravity);
  return speed * t;
}

// Simulate one run with an X-only auto-pilot following the critical path. It predicts where it will
// LAND and aims x at the board there, and modulates hop height (the real release-to-drop chop) by
// the gap size so small gaps get small hops, not max floats that overshoot.
function fly(profile, seed) {
  const { boards, path } = buildRun(profile, seed);
  const r = P.playerRadius;
  let p = { x: 0, y: r, z: 0 }, v = { x: 0, y: 0, z: 0 };
  let grounded = false, ride = null, coyote = 0, jumpBuffer = 0, holdFrames = 0, chopped = false;
  let ti = 0, airMeters = 0, maxAir = 0;
  const dt = 1 / 120;
  let guard = 0;
  // find the path board whose footprint contains a given z (the board we'll land on)
  const boardAtZ = (z) => {
    let best = path[path.length - 1];
    for (let i = Math.max(0, ti - 1); i < path.length; i++) { if (z <= path[i].z + path[i].len / 2) { best = path[i]; break; } }
    return best;
  };
  while (p.z < TARGET && guard++ < 600000) {
    const speed = speedAt(p.z, profile);
    while (ti < path.length - 1 && path[ti].z + path[ti].len / 2 < p.z - 0.5) ti++;
    const cur = path[ti], nxt = path[Math.min(ti + 1, path.length - 1)];
    const curFar = cur.z + cur.len / 2;
    const nearZ = nxt.z - nxt.len / 2;
    const gap = nearZ - curFar;
    const rise = nxt.surf(0, -nxt.len / 2) - p.y;

    // Decide to jump near the current board's far edge when a real gap/rise separates us from next.
    const jumpLead = Math.min(speed * 0.18 + 2, 8);
    if ((grounded || coyote > 0) && (gap > 1.5 || rise > 2.2) && p.z > curFar - jumpLead) {
      jumpBuffer = P.jumpBufferTime;
      // Hold long enough to clear the gap+rise but not wildly overshoot: scale hold by how far we
      // must carry. A full hold (~0.5s) clears the biggest reachable gap; tiny gaps need a blip.
      const need = Math.max(gap + nxt.len * 0.35, rise * 3);
      holdFrames = Math.round(Math.min(1, need / (speed * jumpReach().airTime * 0.7)) * 0.5 / dt);
    }
    if (jumpBuffer > 0 && (grounded || coyote > 0)) { v.y = P.jumpSpeed; grounded = false; coyote = 0; jumpBuffer = 0; chopped = false; }
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    // Release-to-drop: once the hold is up, chop the rise (the real quickDescentDivisor) for a short hop.
    if (holdFrames > 0) holdFrames--;
    else if (!chopped && v.y > 0 && !grounded) { v.y /= P.quickDescentDivisor; chopped = true; }

    // Aim x at the board we will actually LAND on (predict landing z), not the nearest one.
    const landZ = p.z + (grounded ? speed * 0.2 : landingZAhead(p.y, v.y, p.y - 2, speed));
    const land = boardAtZ(Math.max(landZ, p.z + 1));
    const aimX = land.x + (land.spline ? land.spline.sampler.meanderAt(0) : 0);
    v.x = Math.max(-1, Math.min(1, (aimX - p.x) / 1.5)) * P.sideSpeed;

    const g = v.y > 0 ? P.riseGravity : P.gravity;
    v.y -= g * dt;
    if (v.y < -P.terminalVelocity) v.y = -P.terminalVelocity;
    v.z = speed;
    const prevBottom = p.y - r;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    if (!grounded) airMeters += speed * dt;

    const prevRide = ride; grounded = false; ride = null;
    if (v.y <= 0) {
      const f = floorBelow(boards, p.x, p.z, prevBottom, p.y - r, prevRide);
      if (f) {
        if (f.b.type === "bouncy") v.y = P.jumpSpeed * CONFIG.plates.bounce.boost;
        else if (f.b.type === "flipper") v.y = P.jumpSpeed * CONFIG.plates.flipper.vertical;
        else { p.y = f.y + r; v.y = 0; grounded = true; ride = f.b; }
      }
    }
    coyote = grounded ? CONFIG.player.coyoteTime : Math.max(0, coyote - dt);
    const low = lowestTopNear(boards, p.z);
    if (low !== -Infinity) maxAir = Math.max(maxAir, p.y - low);
    if (!grounded && low !== -Infinity && p.y < low - CONFIG.world.fallMargin) {
      return { dist: p.z, completed: false, fellAt: p.z, airMeters, maxAir };
    }
  }
  return { dist: p.z, completed: p.z >= TARGET, fellAt: null, airMeters, maxAir };
}

console.log(`\neyes-fly — headless auto-player, real gravity. Target ${TARGET}m × ${SEEDS.length} seeds/tier.`);
console.log(`(auto-pilot steers X only, like a real player; a fall = a possible reachability gap)\n`);
const cols = ["tier", "complete", "avgDist(m)", "falls", "fell@(m)", "airborne%", "maxAir(u)"];
console.log(cols.join(" | "));
console.log(cols.map((c) => "-".repeat(c.length)).join("-|-"));
for (const profile of CONFIG.gen.tiers) {
  let complete = 0, sumDist = 0, falls = [], airPct = [], maxAir = 0;
  for (const seed of SEEDS) {
    const res = fly(profile, seed);
    if (res.completed) complete++; else falls.push(Math.round(res.fellAt));
    sumDist += res.dist;
    airPct.push(res.airMeters / res.dist);
    maxAir = Math.max(maxAir, res.maxAir);
    if (VERBOSE) console.log(`  ${profile.name} seed ${seed}: ${res.completed ? "DONE" : "fell@" + Math.round(res.fellAt)} dist=${Math.round(res.dist)} air=${(100 * res.airMeters / res.dist).toFixed(0)}%`);
  }
  const avgAir = airPct.reduce((a, b) => a + b, 0) / airPct.length;
  console.log([
    profile.name.padEnd(4),
    `${complete}/${SEEDS.length}`.padStart(8),
    (sumDist / SEEDS.length).toFixed(0).padStart(10),
    String(falls.length).padStart(5),
    (falls.length ? falls.join(",") : "—").padStart(8),
    `${(avgAir * 100).toFixed(0)}%`.padStart(9),
    maxAir.toFixed(0).padStart(9),
  ].join(" | "));
}
console.log("");
