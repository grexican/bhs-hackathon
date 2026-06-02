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

const G = () => CONFIG.gen; // shorthand; re-read each call so config edits take effect

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

// Which obstacle to hang on a board. Overhead bars need a long grounded runway to
// be fair, so they only appear on long boards.
function pickObstacleKind(len, rng) {
  const r = rng.next();
  if (r < 0.34) return "spikes";
  if (r < 0.6) return "barrier";
  if (r < 0.8) return "pillars";
  return len > 22 ? "overhead" : "barrier";
}

// A sliding/lifting board's motion. Mostly pure horizontal or vertical, sometimes a
// diagonal. Slide distance grows with danger. baseX/baseY are filled in by the
// renderer (they're the board's spawn position).
function makeMover(ctx, big) {
  const { D, rng } = ctx;
  const base = ramp(G().hazard.moveAmp, D);
  const amp = big ? base * 1.3 : rng.rand(base * 0.6, base);
  const roll = rng.next();
  let dirX, dirY;
  if (roll < 0.42) { dirX = 1; dirY = 0; }
  else if (roll < 0.74) { dirX = 0; dirY = 1; }
  else { dirX = 0.707 * (rng.chance(0.5) ? 1 : -1); dirY = 0.707 * (rng.chance(0.5) ? 1 : -1); }
  return { dirX, dirY, amp, speed: rng.rand(0.7, 1.5), phase: rng.rand(0, Math.PI * 2) };
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

  // Occasionally the next stretch is a structure (tunnel / spline ribbon), gated +
  // cooled-down so they never cluster. Frequency rides danger × the tier's drama.
  if (!safe && state.stepsSinceTunnel >= g.tunnel.cooldown && chance(dramaChance(g.tunnel.chance, ctx.D, profile))) {
    return planTunnel(state, ctx);
  }
  state.stepsSinceTunnel++;
  if (!safe && state.stepsSinceSpline >= g.spline.cooldown && chance(dramaChance(g.spline.chance, ctx.D, profile))) {
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

  // Launch runway: a flipper flings you STRAIGHT forward at up to plates.flipper.maxSpeed.
  // For the next few steps we keep the path straight + flat so that fling always has
  // ground to come down on — without this, a wide-sprawl/sparse Hard route can veer off
  // sideways while you sail straight ahead into empty space. Consumed one step at a time.
  const onRunway = !safe && state.launchRunway > 0;
  if (onRunway) state.launchRunway--;

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

  // Plate type: rare flipper or accel plate.
  let type = "normal";
  if (!safe) {
    if (chance(g.items.flipperChance)) type = "flipper";
    else if (chance(g.items.boostChance)) type = "boost";
  }
  let texRole = type === "boost" ? "boost" : type === "flipper" ? "flipper" : "ground";
  if (type === "flipper") {
    len = rand(9, 14); // small launch panels — a full-length flipper looks wrong
    state.launchRunway = 4; // the next few boards form a straight, flat landing strip for the fling
  }

  // Board-tilt properties (display + physics): any board can yaw / slope / curve /
  // lean. Frequency & magnitude ride openness × the tier's drama. Flippers stay flat.
  // Yaw is rolled FIRST and EXCLUSIVE: a yawed board stays a clean turned plank.
  let slopeZ = 0, curve = 0, leanX = 0, yaw = 0;
  if (!safe && type !== "flipper") {
    if (!round && chance(dramaChance(g.yaw.chance, o, profile))) {
      yaw = (chance(0.5) ? 1 : -1) * rand(g.yaw.amount[0], ramp(g.yaw.amount, o));
      len *= g.yaw.lenBoost;
    } else {
      if (chance(dramaChance(g.ramp.chance, o, profile))) {
        slopeZ = (chance(0.5) ? 1 : -1) * rand(g.ramp.slope[0], g.ramp.slope[1]);
        if (!round) len *= ramp(g.ramp.lenBoost, o);
      }
      if (!round && chance(dramaChance(g.curve.chance, o, profile))) {
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

  // Decorations: movers, obstacles, gems, powerups. None on safe boards, yawed
  // runways (too chaotic), or tilted/curved boards (a hazard you can't dodge mid-
  // climb is unfair).
  let mover = null, obstacle = null;
  const gems = [], powerups = [];
  if (!safe) {
    if (!yaw && chance(hazardChance(g.hazard.movingChance, d, profile))) mover = makeMover(ctx, false);
    if (type === "normal" && !slopeZ && !curve && !yaw && len > 12 && chance(hazardChance(g.hazard.obstacleChance, d, profile))) {
      obstacle = { kind: pickObstacleKind(len, rng) };
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
  state.stepIndex++;

  return board("path", {
    safe, x, y: yCenter, z, w, len, hy, geoType, type, texRole,
    slopeZ, curve, leanX, yaw, mover, obstacle, gems, powerups, exitY, band,
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
  // COUNT rides density (forgiveness). SPREAD (radius) rides openness × a GENTLED
  // sprawl: the route sweeps the full sprawl, but the decor cloud widens only ~half as
  // much, so branch pickups stay mostly within reach instead of being flung off to the
  // backdrop (the old radius-110 "unreachable items" trap). Wide route, reachable cloud.
  const sFactor = 1 + (profile.sprawl - 1) * 0.5;
  const count = Math.max(0, Math.round(ramp(g.scatter.count, O) * profile.density));
  const rx = ramp(g.scatter.radiusX, O) * sFactor;
  const ry = ramp(g.scatter.radiusY, O) * sFactor;
  const bandMax = (g.path.bandX[1] * profile.sprawl) + (g.scatter.radiusX[1] * sFactor) + 12;
  const cx = pathPlan.x, cy = pathPlan.exitY, cz = pathPlan.z;
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = rng.clamp(cx + rng.rand(-rx, rx), -bandMax, bandMax);
    const y = rng.clamp(cy + rng.rand(-ry, ry), g.path.bandY[0] * profile.sprawl, g.path.bandY[1] * profile.sprawl);
    const z = cz + rng.rand(-g.scatter.zSpread * 0.55, g.scatter.zSpread);
    const geo = randGeo(0, rng); // scatter never uses round geo (matches original)
    const round = geo.geoType !== "box";
    const w = rng.rand(ramp(g.pad.widthLo, ctx.D) * 0.7, ramp(g.pad.widthHi, ctx.D));
    let len = rng.rand(8, ramp(g.pad.lenHi, ctx.D));
    if (round) len = Math.min(len, rng.rand(8, 14));

    const bouncy = rng.chance(g.scatter.bouncyChance);
    const hy = bouncy ? 0.5 : geo.hy;
    // Items carry their FINAL surface height (top = board center y + hy), the same
    // convention as path gems, so the renderer never has to special-case scatter.
    const gems = [], powerups = [];
    const im = ctx.itemMultiplier || 1;
    for (let m = 0; m < im; m++) {
      const ox = (m - (im - 1) / 2) * 2.5;
      if (rng.chance(g.scatter.gemChance)) gems.push({ x: x + ox, top: y + hy, z });
      if (rng.chance(g.scatter.powerupChance)) powerups.push({ x: x + ox, top: y + hy, z });
    }
    out.push(board("scatter", {
      x, y, z, w, len, hy,
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
    x: 0, y: 0, z: 0, w: 0, len: 0, hy: 0.5,
    geoType: "box", type: "normal", texRole: "ground",
    slopeZ: 0, curve: 0, leanX: 0, yaw: 0,
    spline: null, mover: null, obstacle: null,
    gems: [], powerups: [],
    exitY: fields.y ?? 0, band: 0, gap: 0, rise: 0, lateral: 0, tunnel: false,
    ...fields,
  };
}
