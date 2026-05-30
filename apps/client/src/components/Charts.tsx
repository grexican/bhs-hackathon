// Hand-built charts — plain SVG + CSS, no charting library. Each takes a list
// of segments/bars and draws them. Small enough to read and tweak.

export type Segment = { label: string; value: number; color: string };

// A donut chart with a big number in the middle. We draw one <circle> per
// segment and use stroke-dasharray to show only that slice of the ring, then
// rotate each slice into place with stroke-dashoffset.
export function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: Segment[];
  centerValue: number;
  centerLabel: string;
}) {
  const size = 168;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let offset = 0; // running start position for the next slice

  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* rotate so slices start at the top instead of 3 o'clock */}
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {/* faint background ring so an empty/partial donut still looks intentional */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#eee"
            strokeWidth={stroke}
          />
          {segments.map((s) => {
            const len = total > 0 ? (s.value / total) * circumference : 0;
            const slice = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return slice;
          })}
        </g>
        <text x="50%" y="47%" textAnchor="middle" className="donut__num">
          {centerValue}
        </text>
        <text x="50%" y="62%" textAnchor="middle" className="donut__label">
          {centerLabel}
        </text>
      </svg>

      <ul className="donut__legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="donut__swatch" style={{ background: s.color }} />
            {s.label}
            <span className="donut__count">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A horizontal bar chart. Each bar's width is its share of the largest value,
// so the busiest source fills the row and the rest scale against it.
export function BarChart({ bars }: { bars: Segment[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <ul className="barchart">
      {bars.map((b) => (
        <li key={b.label} className="barchart__row">
          <span className="barchart__label">{b.label}</span>
          <span className="barchart__track">
            <span
              className="barchart__fill"
              style={{ width: `${(b.value / max) * 100}%`, background: b.color }}
            />
          </span>
          <span className="barchart__value">{b.value}</span>
        </li>
      ))}
    </ul>
  );
}
