// The two progression ramps that drive the whole generator, plus the helpers that
// turn a config [lo, hi] pair into an actual chance for a given tier.
//
// openness(z) — how much the field has OPENED UP (journey feel). Eased over
//   gen.opennessDistance, and the tier's `openness` knob scales how FAST it opens
//   (Hard opens in less distance). Output is always 0..1.
// danger(z)   — how DANGEROUS it's become (hazards). Eased over gen.dangerDistance,
//   and the tier's `danger` knob scales how FAST it ramps in (Hard reaches a given
//   hazard level in less distance). The `hazard` knob then scales the resulting
//   CHANCES on top — so Hard gets busy SOONER (danger) *and* BUSIER (hazard). Two
//   levers because "smooth sailing for the first 2km" was the danger ramp barely
//   moving (dangerDistance is long), not the magnitude. Output is 0..1.

import { CONFIG, ramp, smoothstep } from "../config.js";

export { ramp, smoothstep };

export function openness(z, profile) {
  return smoothstep((z * profile.openness) / CONFIG.gen.opennessDistance);
}

export function danger(z, profile) {
  // profile.danger defaults to 1 (Medium) if a tier omits it.
  const dScale = profile && profile.danger != null ? profile.danger : 1;
  return smoothstep((z * dScale) / CONFIG.gen.dangerDistance);
}

// A hazard's spawn chance: ramp the pair by the danger value, scale by the tier's
// `hazard` knob, then cap so even Hard never reaches a certain-death 100%.
export function hazardChance(pair, d, profile) {
  return Math.min(ramp(pair, d) * profile.hazard, CONFIG.gen.hazardCeil);
}

// A drama element's chance (spline/ramp/curve/yaw/tunnel): ramp by whichever value
// drives it, scaled by the tier's `drama` knob, capped at `cap` (default 1).
export function dramaChance(pair, t, profile, cap = 1) {
  return Math.min(ramp(pair, t) * profile.drama, cap);
}
