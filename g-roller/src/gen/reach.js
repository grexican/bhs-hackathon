// "Can the ball actually get there?" — the reachability budgets every path step is
// clamped to. This is the contract that keeps the critical path solvable on every
// difficulty: a step may never ask for more gap/rise/strafe than a well-timed jump
// at the current speed can deliver (times the safety fractions in gen.reach).

import { CONFIG, jumpReach, sideSpeedAt } from "../config.js";

export { jumpReach };

// The most a single step may gap forward, rise up, or move sideways — given how
// fast the ball is currently moving. maxGap/maxLateral grow with speed (faster =
// you cover more ground mid-jump); maxRise is fixed (it's set by jump height).
export function budgets(forwardSpeed) {
  const reach = jumpReach();
  const r = CONFIG.gen.reach;
  return {
    height: reach.height,
    airTime: reach.airTime,
    maxRise: reach.height * r.rise,
    maxGap: forwardSpeed * reach.airTime * r.gap,
    maxLateral: sideSpeedAt(forwardSpeed) * reach.airTime * r.lateral, // strafe scales with speed too
  };
}
