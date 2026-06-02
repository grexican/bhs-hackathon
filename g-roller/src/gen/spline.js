// The spline-ribbon wave math — ONE source of truth.
//
// A spline board is a long flat plane whose vertices are pushed into rolling hills
// (Y) that also meander left/right (X). Three places need the EXACT same math or
// the ball falls through / gems float off the surface:
//   1. building the mesh geometry (every vertex),
//   2. laying the trail of gems along the ribbon,
//   3. the death-check's "deepest point" of the ribbon.
// Previously this formula was copy-pasted into all three and had to be hand-synced.
// Now they all call makeSplineSampler() — change the wave here, everything follows.
//
// It's a pure heightfield: exactly one surface height per (x, z), no overhangs, so
// the game's straight-down collision raycast tracks it perfectly. Both displacements
// are windowed by sin(pi*u) so they START and END at exactly 0 — the near edge meets
// the incoming cursor and the far edge returns to the board's center, keeping the
// generator's gap/height bookkeeping valid.

import { CONFIG } from "../config.js";

// opts: { ampY, wavesY, meanderX, wavesX, maxSlope }; len = ribbon length.
// Returns a sampler bound to that ribbon so you build the slope-scale ONCE and then
// sample height/meander cheaply per vertex/gem:
//   heightAt(z)   — surface rise at local z (-len/2 .. +len/2)
//   meanderAt(z)  — sideways drift of the centerline at local z
//   slopeScale    — the factor the raw height was scaled by to respect maxSlope
//   minOffset     — the deepest (most negative) height anywhere on the ribbon
export function makeSplineSampler(opts, len, segZ = CONFIG.gen.spline.segZ) {
  const { ampY, wavesY, meanderX, wavesX, maxSlope } = opts;
  const half = len / 2;
  const u = (z) => (z + half) / len; // 0 at near edge, 1 at far edge
  const win = (uu) => Math.sin(Math.PI * uu); // 0 at both ends, 1 in the middle

  // Raw height: a primary hill wave plus a softer overtone for variety, windowed to 0.
  const heightRaw = (z) => {
    const uu = u(z);
    const primary = Math.sin(uu * Math.PI * wavesY * 2);
    const overtone = 0.35 * Math.sin(uu * Math.PI * wavesY * 4 + 1.7);
    return win(uu) * ampY * (primary + overtone);
  };

  // Probe the steepest slope across the length, then pick a scale that keeps it under
  // maxSlope — so a tall/short ribbon can never produce a near-vertical face the ball
  // would fall through. (Sampled at the same resolution we tessellate.)
  const stepZ = len / segZ;
  let maxAbsSlope = 0;
  let minOffset = 0;
  for (let z = -half; z <= half; z += stepZ) {
    const here = heightRaw(z);
    if (here < minOffset) minOffset = here;
    const slope = Math.abs((heightRaw(z + stepZ) - here) / stepZ);
    if (slope > maxAbsSlope) maxAbsSlope = slope;
  }
  const slopeScale = maxAbsSlope > maxSlope ? maxSlope / maxAbsSlope : 1;

  return {
    slopeScale,
    minOffset: minOffset * slopeScale,
    heightAt: (z) => heightRaw(z) * slopeScale,
    meanderAt: (z) => win(u(z)) * meanderX * Math.sin(u(z) * Math.PI * wavesX * 2),
  };
}
