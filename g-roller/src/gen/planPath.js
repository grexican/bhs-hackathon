// The procedural generator's BRAIN — pure decision logic, no THREE.js.
//
// Each function takes the current `state` (a walking cursor + a few counters) and a
// `ctx` (the tier profile, the two ramp values, the reachability budgets, and a
// random source) and returns a plain PLAN object describing one piece of the world:
// where it sits, how big, what type, how it's tilted, and what to decorate it with.
// platforms.js turns these plans into meshes. Because there's no rendering here, the
// whole generator is unit-testable: feed it a seeded rng and assert that every gap
// is reachable, that Easy spawns more branches than Hard, etc.
//
// `state` (mutated as the cursor walks forward — create a fresh one per run):
//   cursor {x,y,z}     — far edge of the last piece (where the next gap starts)
//   stepIndex          — how many pieces placed (drives the safe-intro + ramps)
//   stepsSinceTunnel / stepsSinceSpline — cooldown counters
//   drift {x,y}        — the roaming target the path currently heads toward
//   driftSteps         — steps left before picking a new drift target
//
// `ctx`:
//   profile            — the tier {name,pace,hazard,openness,density,drama}
//   O                  — openness(playerZ, profile), 0..1
//   D                  — danger(playerZ), 0..1 (or zen's fixedDanger)
//   budgets            — budgets(forwardSpeed) → {maxGap,maxRise,maxLateral,...}
//   rng                — makeRng(...) instance
//   itemMultiplier     — gem/powerup count multiplier (cheat code; normally 1)
//
// A PLAN object (fields a board may carry; unused ones are null/0/[]):
//   kind               — "path" | "scatter" | "tunnel" | "spline"
//   safe               — true during the straight-ahead intro (no decoration)
//   x,y,z,w,len,hy     — geometry (center position + half-thickness)
//   geoType            — "box" | "cyl" | "hex"
//   type               — "normal" | "boost" | "flipper" | "bouncy"
//   texRole            — "ground" | "boost" | "flipper" | "rubber"
//   slopeZ,curve,leanX,yaw — board-tilt properties
//   spline             — {opts,sampler,hxPad,surfaceMinOffset} for ribbon boards, else null
//   obstacle           — {kind} or null
//   mover              — {dirX,dirY,amp,speed,phase} or null
//   gems / powerups    — arrays of absolute {x,top,z} spots
//   gap,rise,lateral   — the step deltas (exposed for reachability tests)

import { CONFIG, ramp } from "../config.js";
import { hazardChance, dramaChance } from "./progression.js";
import { makeSplineSampler } from "./spline.js";
import { boardDifficulty, criticalCap, branchLicense, MOTION_BASE } from "./difficulty.js";
import { pieceFor, OBSTACLE_DEFS } from "./pieces.js";

const G = () => CONFIG.gen; // shorthand; re-read each call so config edits take effect

// Neutral per-biome drama weighting (all 1×) — used when ctx carries no `bias`, e.g.
// the reachability tests, which exercise the pure tier system without a biome.
const EMPTY_BIAS = { tunnel: 1, ramp: 1, curve: 1, yaw: 1 };

// How far the flipper "cannon" throws you (units of z), so the straight landing runway can
// span at least that far (fly off the end = fall into a gap = unfair death). The forward blast
// (launchSpeed) decays back toward the SUSTAINABLE auto-run speed (genSpeed) over the airtime,
// so the realistic average is ~their mean — NOT maxSpeed (a per-frame velocity CAP the ball
// never holds; sizing off it gave a ~900m strip that didn't even fit the 800m gen horizon, the
// root cause of "I run straight for 1000m"). `scripts/eyes-flipper.mjs` measures the true
// landing distance against the real speed-decay model; this formula tracks it with a safety
// margin (the +80 covers a surge/down-ramp speed-up applied AFTER launch).
function flipperFlightDistance(genSpeed) {
  const P = CONFIG.player, fp = CONFIG.plates.flipper, ac = CONFIG.plates.accel;
  const vy = P.jumpSpeed * fp.vertical;
  const airtime = vy / P.riseGravity + vy / Math.sqrt(P.riseGravity * P.gravity); // rise + fall
  // Mean speed over the flight = sustainable genSpeed + the accel-bonus the launch injects, which
  // holds then decays over the airtime (mean ≈ 0.75 of its capped peak — measured against the real
  // game model in scripts/eyes-flipper.mjs). +50 covers the launch overshoot + a partial surge.
  const avgBoost = Math.min(ac.max, fp.forward) * 0.75;
  return (genSpeed + avgBoost) * airtime + 60; // +60 covers the launch overshoot AND a surge held the whole flight
}

// --- small pure pickers ------------------------------------------------------

// Pad shape: hex/round pads are rare early and common later; otherwise a box with
// varied thickness. roundChance 0 (scatter) → never round.
function randGeo(roundChance, rng) {
  if (rng.next() < roundChance) {
    return rng.chance(0.5)
      ? { geoType: "cyl", hy: rng.rand(0.5, 1.0) }
      : { geoType: "hex", hy: rng.rand(0.5, 1.0) };
  }
  const roll = rng.next();
  if (roll < 0.6) return { geoType: "box", hy: 0.6 };
  if (roll < 0.82) return { geoType: "box", hy: rng.rand(1.3, 2.4) }; // thick block
  return { geoType: "box", hy: 0.28 }; // thin slab
}

// Which obstacle to hang on a board. The size gate (overhead needs a long grounded runway) comes
// from the obstacle registry's minBoardLen, so the rule lives with the obstacle, not here.
function pickObstacleKind(len, rng) {
  const r = rng.next();
  if (r < 0.34) return "spikes";
  if (r < 0.6) return "barrier";
  if (r < 0.8) return "pillars";
  return len >= OBSTACLE_DEFS.overhead.minBoardLen ? "overhead" : "barrier";
}

// Which motion types may ride the CRITICAL (mandatory) path — the ones that keep the LANDING SPOT
// reachable at every phase (Y-lift is auto-carried; turntable-spin doesn't move the landing point;
// a bounded slide is steerable). wag/orbit move the landing spot in ways the engine can't carry a
// rider through, so they're BRANCH-only. See config.gen.motion.
const CRITICAL_MOTIONS = new Set(["lift", "spin", "slide"]);

// Pick at most ONE motion descriptor for a board, or null. `allowed` is the piece's supported motion
// list (from PIECE_DEFS), already filtered by the caller for the critical-safe set + flat/round. This
// fn applies the per-distance type UNLOCK and computes the reach-safe amplitude. riseLeft/latLeft are
// the REMAINING reach headroom; a lift/slide reserves a fraction so its swept top never leaves jump
// reach. amp for spin/wag is angular; for orbit (branch) positional.
function pickMotion(ctx, opts) {
  const { profile, D, rng } = ctx;
  const m = G().motion;
  const { allowed, riseLeft, latLeft, cursorZ } = opts;
  const rank = profile.rank ?? 1;
  const avail = allowed.filter((type) => cursorZ >= m.unlock[type][rank]); // gate by the type's unlock distance
  if (!avail.length) return null;
  const type = weightedMotionPick(avail, rng);           // easy types dominate; hard ones occasional
  // The motion's INTENSITY (its sweep DISTANCE + cycle SPEED — Eli: distance+time = the difficulty)
  // ramps on the DANGER curve, NOT openness. Openness saturates by ~650m, which made motion full-
  // speed AND full-amplitude by ~500m ("virtually flying at 1000m"). Danger ramps over the whole run
  // AND drives the difficulty cap, so a fast/wide motion now rates HIGH and is gated to later. Peak
  // board velocity ≈ amp·2π/period, so amplitude is the dominant lever — it eases in via `intensity`.
  // Per-board PERIOD jitter (×0.9..1.4) so movers aren't all synced to ONE rate at a given distance —
  // a static period reads formulaic. The ramp sets the trend (slow early → faster deep, gentler on
  // easier tiers); the jitter gives each board its own character and biases slightly slower.
  const period = ramp(profile.motionPeriod, D) * rng.rand(0.9, 1.4);
  const intensity = 0.35 + 0.65 * D;                     // sweep distance eases in (gentle early, full late)
  const phase = rng.rand(0, Math.PI * 2);
  const velCap = m.maxVel * period / (2 * Math.PI); // amplitude that keeps peak velocity ≤ maxVel
  if (type === "lift") {
    // CLAMP to velCap so a rising board never outruns the down-ray collision (the ball was clipping
    // THROUGH fast lifts as they rose into it). Lift is vertical, so this is the critical case.
    const amp = Math.min(Math.max(0, riseLeft) * m.liftAmpFrac * intensity, velCap);
    return amp < m.minAmp ? null : { type, period, phase, amp, dirX: 0, dirY: 1 };
  }
  if (type === "slide") {
    const amp = Math.max(0, latLeft) * m.slideAmpFrac * intensity; // horizontal — no vertical clip risk
    return amp < m.minAmp ? null : { type, period, phase, amp, dirX: 1, dirY: 0 };
  }
  if (type === "spin") return { type, period, phase, amp: ramp(m.spinAmp, D), dirX: 0, dirY: 0 };
  if (type === "wag")  return { type, period, phase, amp: ramp(m.spinAmp, D) + 0.4, hinge: 0.5 };
  // orbit (branch): a circle on a plane tilted flat→vertical. Its vertical component can clip too, so
  // cap its peak velocity (branches may run a touch faster than the critical-path lift).
  return { type, period, phase, amp: Math.min(ramp(m.branchAmp, D), velCap * 1.5), axisTilt: rng.rand(0, Math.PI / 2) };
}

// Weighted pick favouring EASIER motion types (weight ∝ 1/(1+base·3)), so harder ones stay rare.
function weightedMotionPick(types, rng) {
  let total = 0;
  const w = types.map((t) => { const x = 1 / (1 + (MOTION_BASE[t] ?? 0.3) * 3); total += x; return x; });
  let r = rng.next() * total;
  for (let i = 0; i < types.length; i++) { r -= w[i]; if (r <= 0) return types[i]; }
  return types[types.length - 1];
}

// --- the three "structure" pieces (return early, no scatter cloud) -----------

// A short glowing ring tunnel: a flat landable floor with a line of reward gems.
export function planTunnel(state, ctx) {
  const { budgets, rng, O } = ctx;
  const g = G();
  const gap = rng.clamp(rng.rand(4, budgets.maxGap * 0.4), 3, budgets.maxGap);
  const len = g.tunnel.length;
  const w = 11;
  const band = ramp(g.path.bandX, O) * ctx.profile.sprawl;
  const x = rng.clamp(state.cursor.x, -band, band);
  const y = state.cursor.y; // flat all the way through
  const z = state.cursor.z + gap + len / 2;

  const gems = [];
  for (let k = 0; k < 4; k++) gems.push({ x, top: y + 0.6, z: z - len / 2 + (k + 0.7) * (len / 5) });

  state.cursor = { x, y, z: z + len / 2 };
  state.stepsSinceTunnel = 0;
  state.stepIndex++;
  return board("tunnel", { x, y, z, w, len, hy: 0.5, geoType: "box", type: "normal", texRole: "ground", gems, gap, tunnel: true });
}

// A long undulating ribbon you roll ALONG. Builds the wave sampler ONCE (shared with
// the renderer + gem trail via gen/spline.js) so geometry, gems and death-checks all
// agree. Gems follow the displaced surface so they sit in the roll lane.
export function planSpline(state, ctx) {
  const { budgets, rng, O } = ctx;
  const g = G();
  const gap = rng.clamp(rng.rand(4, budgets.maxGap * 0.4), 3, budgets.maxGap);
  const len = ramp(g.spline.length, O);
  const w = ramp(g.spline.width, O);
  const opts = {
    ampY: ramp(g.spline.ampY, O),
    wavesY: ramp(g.spline.wavesY, O),
    meanderX: ramp(g.spline.meanderX, O),
    wavesX: ramp(g.spline.wavesX, O),
    maxSlope: g.spline.maxSlope,
  };
  const band = ramp(g.path.bandX, O) * ctx.profile.sprawl;
  const x = rng.clamp(state.cursor.x, -band, band);
  const y = state.cursor.y;
  const z = state.cursor.z + gap + len / 2;

  const sampler = makeSplineSampler(opts, len);
  const gems = [];
  const n = 6;
  for (let k = 0; k < n; k++) {
    const lz = -len / 2 + ((k + 0.5) / n) * len;
    gems.push({ x: x + sampler.meanderAt(lz), top: y + sampler.heightAt(lz) + 0.2, z: z + lz });
  }

  state.cursor = { x, y, z: z + len / 2 };
  state.stepsSinceSpline = 0;
  state.stepIndex++;
  return board("spline", {
    x, y, z, w, len, hy: 0.5, geoType: "box", type: "normal", texRole: "ground", gems, gap,
    spline: { opts, sampler, hxPad: w / 2 + opts.meanderX + 1, surfaceMinOffset: sampler.minOffset - 1 },
  });
}

// --- the main critical-path step ---------------------------------------------

export function planStep(state, ctx) {
  const { profile, rng, budgets } = ctx;
  const g = G();
  const { rand, randInt, chance, clamp } = rng;
  const safe = state.stepIndex < g.safeStraight;
  // Launch runway: every board laid until the cursor passes the cannon's landing zone
  // stays straight + flat (computed below). Tunnels/splines are suppressed here too, so
  // nothing interrupts the flight path and jumps the cursor past the runway.
  const onRunway = !safe && state.cursor.z < state.launchRunwayUntilZ;

  // Occasionally the next stretch is a structure (tunnel / spline ribbon), gated +
  // cooled-down so they never cluster, and never mid-launch-runway.
  const bias = ctx.bias || EMPTY_BIAS; // per-biome signature-element weighting (default = neutral)
  if (!safe && !onRunway && state.stepsSinceTunnel >= g.tunnel.cooldown && chance(dramaChance(g.tunnel.chance, ctx.D, profile, 1, bias.tunnel))) {
    return planTunnel(state, ctx);
  }
  state.stepsSinceTunnel++;
  if (!safe && !onRunway && state.stepsSinceSpline >= g.spline.cooldown && chance(dramaChance(g.spline.chance, ctx.D, profile))) {
    return planSpline(state, ctx);
  }
  state.stepsSinceSpline++;

  // During the safe intro the field is pinned closed (o = d = 0). After that, the
  // openness ramp `o` drives the journey (wander/gaps/reach) and the danger ramp `d`
  // drives the threat.
  const o = safe ? 0 : ctx.O;
  const d = safe ? 0 : ctx.D;
  // The wander band rides openness AND the tier's sprawl knob (sprawl keeps widening
  // the sweep even after openness saturates — that's what separates Hard from Medium
  // deep in a run). Per-step deltas below stay clamped to jump reach regardless.
  const band = ramp(g.path.bandX, o) * profile.sprawl;

  // Roaming target: every few steps pick a new far-off (x,y) to head toward — this is
  // what turns a straight line into a sweeping, free-floating journey. Frozen on a
  // launch runway (keep heading straight to the landing).
  if (!safe && !onRunway && --state.driftSteps <= 0) {
    state.driftSteps = randInt(g.path.driftEvery[0], g.path.driftEvery[1]);
    state.drift.x = clamp(rand(-band, band), -band, band);
    const vy = ramp(g.path.driftY, o) * profile.sprawl;
    state.drift.y = clamp(state.cursor.y + rand(-vy * 0.7, vy), g.path.bandY[0] * profile.sprawl, g.path.bandY[1] * profile.sprawl);
  }

  const geo = randGeo(ramp(g.roundGeoChance, o), rng);
  const round = geo.geoType !== "box";

  // Pad size shrinks as DANGER rises (× tier hazard) — the same distance counts as
  // "harder" on Hard. Gaps stay reachable regardless (sized off jumpReach, not pad size).
  const padD = safe ? 0 : Math.min(1, d * profile.hazard);
  const w = rand(ramp(g.pad.widthLo, padD), ramp(g.pad.widthHi, padD));
  let len = rand(ramp(g.pad.lenLo, padD), ramp(g.pad.lenHi, padD));
  if (round) len = Math.min(len, rand(10, 18));

  // Reachable step budgets — every one opens up with openness, none ever exceeds the
  // jump-reach ceiling (that's the solvability contract).
  const gap = clamp(rand(budgets.maxGap * ramp(g.path.gapFracLo, o), budgets.maxGap * ramp(g.path.gapFracHi, o)), 3, budgets.maxGap);
  const lateral = budgets.maxLateral * ramp(g.path.lateralFrac, o);
  const dyUp = budgets.maxRise * ramp(g.path.riseFrac, o);
  const dyDown = ramp(g.path.dropDepth, o);

  // Bias the step toward the roaming target, then add randomness — always clamped to
  // what a jump can clear, so the path stays solvable.
  let dx, dy;
  if (safe || onRunway) {
    // Straight + nearly flat: a findable landing strip (safe intro, or post-launch runway).
    dx = rand(-1, 1) * 0.5;
    dy = onRunway ? rand(dyDown * 0.3, 1.2) : rand(-1.2, 1.2);
  } else {
    const toX = clamp(state.drift.x - state.cursor.x, -lateral, lateral);
    const sharp = chance(hazardChance(g.hazard.sharpTurnChance, d, profile));
    dx = sharp
      ? clamp(toX + (chance(0.5) ? 1 : -1) * rand(lateral * 0.5, lateral), -lateral, lateral)
      : toX * 0.6 + rand(-lateral, lateral) * 0.4;
    const toY = clamp(state.drift.y - state.cursor.y, dyDown, dyUp);
    dy = toY * 0.6 + rand(dyDown, dyUp) * 0.4;
  }

  // Plate type: rare flipper or accel plate. NEVER on a runway — a second flipper would CHAIN
  // its runway onto this one (stacking to 1000m+ straight again), and a boost would speed the ball
  // past the landing zone. The runway must stay clean normal boards so the launch arc lands.
  let type = "normal";
  if (!safe && !onRunway) {
    if (chance(g.items.flipperChance)) type = "flipper";
    else if (chance(g.items.boostChance)) type = "boost";
  }
  let texRole = type === "boost" ? "boost" : type === "flipper" ? "flipper" : "ground";
  if (type === "flipper") len = rand(9, 14); // small launch panels — a full-length flipper looks wrong

  // Board-tilt properties (display + physics): any board can yaw / slope / curve /
  // lean. Frequency & magnitude ride openness × the tier's drama. Flippers stay flat.
  // Yaw is rolled FIRST and EXCLUSIVE: a yawed board stays a clean turned plank.
  let slopeZ = 0, curve = 0, leanX = 0, yaw = 0;
  if (!safe && type !== "flipper") {
    if (!round && chance(dramaChance(g.yaw.chance, o, profile, 1, bias.yaw))) {
      yaw = (chance(0.5) ? 1 : -1) * rand(g.yaw.amount[0], ramp(g.yaw.amount, o));
      len *= g.yaw.lenBoost;
    } else {
      if (chance(dramaChance(g.ramp.chance, o, profile, 1, bias.ramp))) {
        slopeZ = (chance(0.5) ? 1 : -1) * rand(g.ramp.slope[0], g.ramp.slope[1]);
        if (!round) len *= ramp(g.ramp.lenBoost, o);
      }
      if (!round && chance(dramaChance(g.curve.chance, o, profile, 1, bias.curve))) {
        curve = (chance(0.7) ? 1 : -1) * rand(g.curve.amount[0], g.curve.amount[1]);
      }
      // Lean FREQUENCY rides danger (a hazard); its MAGNITUDE upper bound grows with
      // openness so early banks are barely-there.
      if (chance(hazardChance(g.hazard.leanChance, d, profile))) {
        leanX = (chance(0.5) ? 1 : -1) * rand(g.hazard.leanAmount[0], ramp(g.hazard.leanAmount, o));
      }
    }
  }

  // Lay the board's NEAR end at the reachable jump target, then run it along its
  // heading (rotated by yaw). For a normal board (yaw 0) the board runs straight
  // ahead; a yawed board's far end veers off diagonally.
  const nearX = clamp(state.cursor.x + dx, -band - 4, band + 4);
  const nearY = state.cursor.y + dy;
  const nearZ = state.cursor.z + gap;
  const fdx = Math.sin(yaw), fdz = Math.cos(yaw); // board's forward (heading) unit dir
  const x = nearX + fdx * (len / 2); // board CENTER
  const z = nearZ + fdz * (len / 2);
  const yCenter = slopeZ ? nearY + slopeZ * (len / 2) : nearY; // ramp near edge meets the incoming height

  const geoType = type === "boost" || type === "flipper" ? "box" : geo.geoType;
  const hy = type === "boost" || type === "flipper" || slopeZ ? 0.5 : geo.hy;
  const exitY = slopeZ ? yCenter + slopeZ * (len / 2) : yCenter;

  // Decorations: MOTION, obstacle, gems, powerups — gated by the difficulty BUDGET (criticalCap).
  // Precedence: geometry is already reach-clamped (safety); the cap only STRIPS decoration (balance).
  // Tilt (rolled above) and motion are mutually exclusive — a board is tilted-static OR flat-moving.
  const tilted = slopeZ || curve || leanX || yaw;
  let motion = null, obstacle = null;
  const gems = [], powerups = [];
  const piece = pieceFor(type, geoType); // self-describing capabilities (motions, canObstacle, base)
  if (!safe) {
    // AGGREGATE-PATH-DIFFICULTY (M6, the inverse of the branch license): when FEW alternate routes
    // exist here, the critical path is COMMITTED (you can't dodge) → cap its per-board difficulty
    // LOWER so it stays fair. Many routes → the branches carry the spice (branchLicense), so the
    // mandatory path can sit a touch higher. expectedBranches ≈ the scatter count about to spawn.
    const expectedBranches = ramp(g.scatter.count, o) * profile.density;
    const commitFactor = expectedBranches < 2 ? 0.75 + 0.125 * expectedBranches : 1; // 0.75 (forced) .. 1 (lots of options)
    const cap = criticalCap(profile, nearZ, state.stepIndex) * commitFactor;
    const partial = { w, len, type, geoType, slopeZ, curve, leanX, yaw, spline: null, obstacle: null, motion: null };

    // MOTION — only the motions the PIECE supports (registry), filtered to the critical-safe set;
    // spin needs a flat round top. A lifting/sliding RAMP is fine (down-ray tracks the tilt, dy still
    // carries the rider). Frequency rides the OPENNESS ramp (movement EARLY) with an ambient floor.
    const canMove = !onRunway && piece.motions.length > 0 &&
      state.stepIndex >= g.safeStraight + g.motion.firstNonSafeQuiet;
    // NOTE: no outer cap gate here — the AMBIENT lift must fire even on a board already at the cap
    // (that's the "alive" layer). The per-candidate check below gates only the spicier slide/spin.
    if (canMove) {
      // Frequency ramps on DANGER (slow); the floor keeps the world alive early on every tier.
      const moveChance = Math.max(ramp(profile.motionChance, d), g.motion.floor);
      if (chance(moveChance)) {
        const riseLeft = budgets.maxRise - Math.max(0, dy) - hy; // headroom a lift may reserve (reach-safe)
        const latLeft = budgets.maxLateral - Math.abs(dx);
        let allowed = piece.motions.filter((t) => CRITICAL_MOTIONS.has(t));
        if (tilted) allowed = allowed.filter((t) => t !== "spin"); // spin needs a flat top
        let cand = pickMotion(ctx, { allowed, riseLeft, latLeft, cursorZ: nearZ });
        // LIFT is the AMBIENT "alive" layer — gentle + reach-safe, allowed even under a low cap (keeps
        // Easy/early calm-but-NOT-sleepy). A spicier slide/spin must fit the budget; if it DOESN'T,
        // fall back to a lift rather than leaving the board static — the ambient layer always delivers.
        if (cand && cand.type !== "lift" && boardDifficulty({ ...partial, motion: cand }) > cap + 1e-9) {
          cand = allowed.includes("lift") ? pickMotion(ctx, { allowed: ["lift"], riseLeft, latLeft, cursorZ: nearZ }) : null;
        }
        if (cand) motion = cand;
      }
    }
    partial.motion = motion;

    // OBSTACLE — only if the PIECE can host one (registry), flat, not moving, long enough. The PATROL
    // is rolled HERE in the pure layer (not the renderer) so boardDifficulty sees the moving hazard.
    if (piece.canObstacle && !tilted && !motion && len > 12 &&
        boardDifficulty(partial) < cap && chance(hazardChance(g.hazard.obstacleChance, d, profile))) {
      const kind = pickObstacleKind(len, rng);
      const move = !!OBSTACLE_DEFS[kind].patrol && chance(hazardChance(g.hazard.obstacleMoveChance, d, profile));
      const ob = { kind, move };
      if (boardDifficulty({ ...partial, obstacle: ob }) <= cap + 1e-6) obstacle = ob;
    }

    // ANTI-STARVATION: a calm tier can leave the budget unspent for a run of bare boards (the "Easy
    // went DEAD" risk). If that happens, force one floor-level feature (a slow lift) so the world
    // stays alive. Tracked on `state` (lazy init so no freshState churn).
    if (!tilted && !motion && !obstacle && type === "normal" && !onRunway) {
      state.boardsSinceFeature = (state.boardsSinceFeature || 0) + 1;
      if (canMove && state.boardsSinceFeature >= g.minSpiceGap) {
        const riseLeft = budgets.maxRise - Math.max(0, dy) - hy;
        const period = ramp(profile.motionPeriod, d) * rng.rand(0.9, 1.4); // jittered, like pickMotion
        const velCap = g.motion.maxVel * period / (2 * Math.PI);
        const amp = Math.min(Math.max(0, riseLeft) * g.motion.liftAmpFrac * (0.35 + 0.65 * d), velCap); // gentle + clip-safe
        if (amp >= g.motion.minAmp) {
          motion = { type: "lift", period, phase: rng.rand(0, Math.PI * 2), amp, dirX: 0, dirY: 1 };
          state.boardsSinceFeature = 0;
        }
      }
    } else {
      state.boardsSinceFeature = 0;
    }

    const im = ctx.itemMultiplier || 1;
    for (let k = 0; k < im; k++) {
      const ox = (k - (im - 1) / 2) * 3;
      if (chance(g.items.gemChance)) gems.push({ x: x + ox, top: yCenter + hy, z });
      if (chance(CONFIG.effects.powerupChance)) powerups.push({ x: x + ox, top: yCenter + hy, z: z + rand(-len * 0.3, len * 0.3) });
    }
  }

  // Advance the cursor to the board's far end (along its heading) for the next step.
  state.cursor = { x: clamp(nearX + fdx * len, -band - 4, band + 4), y: exitY, z: nearZ + fdz * len };
  // After a flipper, hold a straight + flat runway out to the cannon's landing zone (distance-
  // based, from the just-advanced far edge) so the long arc always lands. Sized off the REALISTIC
  // flight (genSpeed-based, see flipperFlightDistance) and clamped so neither a degenerate slow
  // launch under-runs the landing nor a fast one re-creates a level-tiling straight corridor.
  if (type === "flipper") {
    const flight = flipperFlightDistance(ctx.genSpeed ?? budgets.maxGap / Math.max(1, budgets.airTime * g.reach.gap));
    state.launchRunwayUntilZ = state.cursor.z + clamp(flight, 150, 540);
  }
  state.stepIndex++;

  return board("path", {
    safe, onRunway, x, y: yCenter, z, w, len, hy, geoType, type, texRole,
    slopeZ, curve, leanX, yaw, motion, obstacle, gems, powerups, exitY, band,
    gap, rise: dy, lateral: dx,
  });
}

// Branch/decor platforms strewn around the just-placed path board — the parallax
// sprawl + alternate routes. COUNT rides openness × the tier's `density` (the
// forgiveness lever: Easy denser, Hard sparser). Returns CANDIDATE plans; the
// renderer resolves overlaps (it owns the placed-platform list).
export function planScatter(pathPlan, state, ctx) {
  if (pathPlan.safe || pathPlan.kind !== "path") return [];
  const { profile, O, rng } = ctx;
  const g = G();
  // COUNT rides density (the difficulty lever: Easy many, Hard few). SPREAD is MAXED and
  // nearly tier-INDEPENDENT — a wide "go anywhere" field for everyone — with only a SMALL
  // widening on harder tiers so the extremes get an extra traversal challenge. The
  // easy/hard FEEL is the count filling (or sparsely dotting) that same wide spread, not
  // a tighter cloud. 0.92 base keeps Easy wide; +0.1·(sprawl-1) nudges Hard a touch wider.
  const sFactor = 0.92 + (profile.sprawl - 1) * 0.1;
  const count = Math.max(0, Math.round(ramp(g.scatter.count, O) * profile.density));
  // DENSITY PRODUCES WIDTH (Eli's note): a dense section's MANY pieces fan OUT to keep spacing sane
  // instead of piling into a fixed radius (which made Easy's count read as a tight, overlapping
  // cluster — and _renderScatterPlan then SKIPPED the overlaps, the "3 stacked, can't reach" bug).
  // spreadBoost grows with the count (never below 1, so sparse tiers stay put). Horizontal only —
  // vertical spread stays modest so branches don't fling out of reach.
  const spreadBoost = Math.max(1, Math.sqrt(count / 3));
  const rx = ramp(g.scatter.radiusX, O) * sFactor * spreadBoost;
  const ry = ramp(g.scatter.radiusY, O) * sFactor;
  const bandMax = (g.path.bandX[1] * profile.sprawl) + (g.scatter.radiusX[1] * sFactor * spreadBoost) + 12;
  const cx = pathPlan.x, cy = pathPlan.exitY, cz = pathPlan.z;
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = rng.clamp(cx + rng.rand(-rx, rx), -bandMax, bandMax);
    const y = rng.clamp(cy + rng.rand(-ry, ry), g.path.bandY[0] * profile.sprawl, g.path.bandY[1] * profile.sprawl);
    const z = cz + rng.rand(-g.scatter.zSpread * 0.55, g.scatter.zSpread);
    const geo = randGeo(0, rng); // scatter never uses round geo (matches original)
    const round = geo.geoType !== "box";
    let w = rng.rand(ramp(g.pad.widthLo, ctx.D) * 0.7, ramp(g.pad.widthHi, ctx.D));
    let len = rng.rand(8, ramp(g.pad.lenHi, ctx.D));
    if (round) len = Math.min(len, rng.rand(8, 14));

    // Trampoline chance climbs the DEEPER this branch sits below the path — so the
    // lowest pieces (the "depths") are most likely red bouncers, your bounce back into
    // play if you fall way under everything. depth 0 at path height → 1 at the bottom.
    const depth = ry > 0 ? Math.max(0, Math.min(1, (cy - y) / ry)) : 0;
    const bouncy = rng.chance(g.scatter.bouncyChance + depth * g.scatter.bouncyDepthBoost);
    const hy = bouncy ? 0.5 : geo.hy;
    // Penalty for the rescue: a depth-spawned bouncer is a smaller target the deeper it
    // is (shorter + thinner, with jitter) — the catch takes some aim. Clamped to a
    // landable minimum so it's never impossible to hit.
    if (bouncy && depth > 0.15) {
      const shrink = 1 - depth * g.scatter.bouncyDepthPenalty * rng.rand(0.6, 1);
      w = Math.max(7, w * shrink);
      len = Math.max(8, len * shrink);
    }
    // Branch MOTION — optional routes may move RICHER than the critical path (wag/orbit included),
    // gated only by the type-unlock distance. Off-path, so positional motion is unconstrained:
    // falling off costs the optional reward, not the run. Frequency rides openness.
    let motion = null;
    if (!bouncy) {
      const piece = pieceFor("normal", geo.geoType); // a branch is a plain pad of its geo shape
      const moveChance = Math.max(ramp(profile.motionChance, ctx.D), g.motion.floor) * 1.1;
      // Branches use the piece's FULL motion set (no critical filter) — wag/orbit included, off-path.
      if (rng.chance(moveChance) && piece.motions.length) motion = pickMotion(ctx, { allowed: piece.motions, riseLeft: 1e4, latLeft: 1e4, cursorZ: z });
    }
    // Risk/reward (M6): the more alternate routes exist (count), the harder an individual branch is
    // ALLOWED to be — and a branch harder than the critical cap pays out a better powerup more often
    // (a "dare" piece with a kickass reward). branchLicense scales the allowance with route count.
    const baseCap = criticalCap(profile, z, state.stepIndex);
    const bdiff = boardDifficulty({ w, len, slopeZ: 0, curve: 0, leanX: 0, yaw: 0, spline: null, obstacle: null, motion });
    const spicy = bdiff > baseCap * 1.3 && bdiff <= baseCap * branchLicense(count) + 1e-9;
    const puChance = spicy ? g.scatter.powerupChance * 1.8 : g.scatter.powerupChance;

    // Items carry their FINAL surface height (top = board center y + hy), the same
    // convention as path gems, so the renderer never has to special-case scatter.
    // Off-path (side-quest) gems are CLUSTERS worth multiples — 5×, or 10× on a spicy hard-to-reach
    // branch (risk/reward). One cluster per branch (not a sprinkle), so reaching it is a real payoff.
    const clusterValue = spicy ? CONFIG.scoring.clusterGemSpicy : CONFIG.scoring.clusterGem;
    const gems = [], powerups = [];
    const im = ctx.itemMultiplier || 1;
    for (let k = 0; k < im; k++) {
      const ox = (k - (im - 1) / 2) * 2.5;
      if (rng.chance(g.scatter.gemChance)) gems.push({ x: x + ox, top: y + hy, z, value: clusterValue });
      if (rng.chance(puChance)) powerups.push({ x: x + ox, top: y + hy, z, rare: spicy }); // spicy branch → bias the rare/good pool
    }
    out.push(board("scatter", {
      x, y, z, w, len, hy, motion,
      geoType: bouncy ? "box" : geo.geoType,
      type: bouncy ? "bouncy" : "normal",
      texRole: bouncy ? "rubber" : "ground",
      gems, powerups,
    }));
  }
  return out;
}

// Fill a plan object with defaults so every consumer can read every field safely.
function board(kind, fields) {
  return {
    kind,
    safe: false,
    onRunway: false, // true on the straight+flat boards held after a flipper launch (the landing strip)
    x: 0, y: 0, z: 0, w: 0, len: 0, hy: 0.5,
    geoType: "box", type: "normal", texRole: "ground",
    slopeZ: 0, curve: 0, leanX: 0, yaw: 0,
    spline: null, motion: null, obstacle: null,
    gems: [], powerups: [],
    exitY: fields.y ?? 0, band: 0, gap: 0, rise: 0, lateral: 0, tunnel: false,
    ...fields,
  };
}
