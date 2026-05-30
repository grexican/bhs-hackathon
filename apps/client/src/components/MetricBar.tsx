import type { MetricGrade } from "../api";
import { LEVEL_LABELS, scoreColor } from "../lib/ui";
import { GradeBadge } from "./GradeBadge";

// One graded skill, shown as a labeled bar. Because every benchmark anchor
// maps to a fixed score (good = 78, elite = 92), we can draw the "good" and
// "elite" lines at the same spot for everyone and just move the player's
// marker. The caption is the honest level-correlation: how far up the levels
// this exact number would still hold up.
export function MetricBar({ metric }: { metric: MetricGrade }) {
  const color = scoreColor(metric.score);
  const hasData = metric.value !== null;

  const correlation = hasData
    ? metric.solidUpTo
      ? `Solid through ${LEVEL_LABELS[metric.solidUpTo]}${metric.eliteUpTo ? ` · elite at ${LEVEL_LABELS[metric.eliteUpTo]}` : ""}`
      : "Below average for this level"
    : "No data yet";

  return (
    <div className="metric-bar">
      <div className="metric-bar__head">
        <span className="metric-bar__label" title={metric.short}>
          {metric.label}
        </span>
        <span className="metric-bar__value">{metric.display}</span>
        <GradeBadge grade={metric.grade} tier={metric.tier} />
      </div>

      <div className="metric-bar__track">
        {/* Benchmark guide lines for this player's level. */}
        <span className="metric-bar__tick" style={{ left: "60%" }} title="At-level average" />
        <span className="metric-bar__tick metric-bar__tick--good" style={{ left: "78%" }} title="Good for the level" />
        <span className="metric-bar__tick metric-bar__tick--elite" style={{ left: "92%" }} title="Elite for the level" />
        {hasData && <span className="metric-bar__fill" style={{ width: `${metric.score}%`, background: color }} />}
        {hasData && (
          <span className="metric-bar__marker" style={{ left: `${metric.score}%`, borderColor: color }} />
        )}
      </div>

      <div className="metric-bar__foot">
        <span className="metric-bar__correlation">{correlation}</span>
      </div>
    </div>
  );
}
