import { useState } from "react";

import { api, type Level, type MetaInfo } from "../api";
import { Card, ErrorBox, Loading, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";

// The "show your work" page. Grades only mean something if you can see the
// ruler behind them — so this page renders the actual benchmark table the
// engine uses, for every metric and every level. It directly answers the
// project's hard question: what's good, and good *for which level*?
export function Methodology() {
  const { data, loading, error } = useApi<MetaInfo>("/api/meta");
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const fmt = (val: number, format: string) =>
    format === "pct" ? val.toFixed(3).replace(/^0/, "") : format === "rating" ? val.toFixed(2) : val.toFixed(1);

  async function resetDemo() {
    setResetMsg("Resetting…");
    try {
      await api.post("/api/admin/reset", {});
      setResetMsg("✓ Demo data reset. Refresh to see the fresh season.");
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Reset failed");
    }
  }

  return (
    <div className="stack">
      <PageHeader title="How Ratings Work" subtitle="Every grade is judged against the player's level. Here's the exact ruler." />

      <Card>
        <h3 className="panel__title">The big idea: good is relative to level</h3>
        <p className="method-lead">
          A <strong>.200 hitting percentage</strong> is a strong night for a high-school varsity hitter — and a quiet
          one for a college hitter. So we never grade a stat in a vacuum. Each metric has four benchmarks{" "}
          <em>per level</em> — worst, below-average, good, and elite — and a value is scored 0–100 by where it lands
          between them. The same number can be an <strong>A at JV</strong> and a <strong>C at college</strong>. That's
          the honest way to rate players across levels.
        </p>
        <div className="tierkey">
          {data.tiers.map((t) => (
            <span key={t.tier} className={`tierkey__item tierkey__item--${t.tier.replace(" ", "-")}`}>
              <strong>{t.tier}</strong> {t.min}+
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="panel__title">"Good" benchmark by level</h3>
        <p className="muted panel__sub">
          Watch the bar rise across the row: what counts as a <em>good</em> result climbs at every level (elite in
          parentheses).
        </p>
        <div className="table-wrap">
          <table className="benchtable">
            <thead>
              <tr>
                <th className="benchtable__metric">Metric</th>
                {data.levels.map((l) => (
                  <th key={l.id}>{l.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.metrics.map((m) => (
                <tr key={m.id}>
                  <td className="benchtable__metric">
                    <strong>{m.label}</strong>
                    <span className="muted benchtable__short">{m.short}</span>
                    {m.lowerBetter && <span className="benchtable__lower">lower is better</span>}
                  </td>
                  {data.levels.map((l) => {
                    const a = m.anchors[l.id as Level];
                    return (
                      <td key={l.id}>
                        <strong>{fmt(a[2], m.format)}</strong>
                        <span className="muted"> ({fmt(a[3], m.format)})</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="panel__title">Position matters too</h3>
        <p className="muted panel__sub">
          A player's overall rating only weighs the stats that matter for their position — a libero is never judged on
          hitting, a setter is judged mostly on assists.
        </p>
        <div className="poscards">
          {data.positions.map((p) => (
            <div key={p.id} className="poscard">
              <strong>{p.label}</strong>
              <span className="muted">{p.primary.map((id) => data.metrics.find((m) => m.id === id)?.label ?? id).join(" · ")}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="panel__title">Demo controls</h3>
        <p className="muted panel__sub">All data here is simulated and lives in a real SQLite database. Reset it anytime to the same starting season.</p>
        <button type="button" className="btn btn--ghost" onClick={resetDemo}>
          ♻️ Reset demo data
        </button>
        {resetMsg && <p className="method-reset muted">{resetMsg}</p>}
      </Card>
    </div>
  );
}
