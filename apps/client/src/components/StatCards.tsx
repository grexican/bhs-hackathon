// The four big-number cards across the top of the dashboard — the "so what"
// summary a student should be able to read in one glance.

export type Stat = {
  label: string;
  value: number;
  accent: string; // colour of the number + top rail
  hint?: string; // small subtext under the number
};

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="stats">
      {stats.map((s) => (
        <div key={s.label} className="stat" style={{ borderTopColor: s.accent }}>
          <span className="stat__value" style={{ color: s.accent }}>
            {s.value}
          </span>
          <span className="stat__label">{s.label}</span>
          {s.hint && <span className="stat__hint">{s.hint}</span>}
        </div>
      ))}
    </div>
  );
}
