import type { Tier } from "../api";
import { tierColor } from "../lib/ui";

// A small colored pill showing a letter grade. The color comes from the tier
// (elite = purple, strong = green, …) so you can read the roster at a glance.
export function GradeBadge({ grade, tier, label }: { grade: string; tier: Tier; label?: boolean }) {
  const color = tierColor(tier);
  return (
    <span className="grade-badge" style={{ background: `${color}1a`, color, borderColor: `${color}55` }}>
      <strong>{grade}</strong>
      {label && <span className="grade-badge__tier">{tier}</span>}
    </span>
  );
}
