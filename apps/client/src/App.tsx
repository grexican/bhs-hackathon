import { useMemo, useState } from "react";

import { BarChart, Donut } from "./components/Charts";
import { FeedView } from "./components/FeedView";
import { StatCards } from "./components/StatCards";
import { isDueSoon, PRIORITY_META, priorityOf, sourceMeta } from "./feedUtils";
import { useFeed } from "./hooks/useFeed";

// The BHS dashboard. One "Scan sources" button pulls every source in, the AI
// reads each item, and the page turns that into stats, charts, and a triaged
// feed — urgent stuff on top, noise hidden at the bottom.
export function App() {
  const { items, loading, scanning, error, scan } = useFeed();

  // Source filter: clicking a chip narrows the feed to that source. Empty = all.
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());

  function toggleSource(source: string) {
    setActiveSources((prev) => {
      const next = new Set(prev);
      next.has(source) ? next.delete(source) : next.add(source);
      return next;
    });
  }

  // All the derived numbers for the stat cards + charts. Recomputed only when
  // the items change, not on every render.
  const stats = useMemo(() => {
    const school = items.filter((i) => i.is_school === 1);
    const counts = { high: 0, medium: 0, low: 0, noise: 0 };
    for (const i of items) counts[priorityOf(i)]++;

    const bySource = new Map<string, number>();
    for (const i of items) bySource.set(i.source, (bySource.get(i.source) ?? 0) + 1);

    const dueSoon = items.filter((i) => isDueSoon(i.deadline)).length;

    return { school, counts, bySource, dueSoon };
  }, [items]);

  // Apply the source filter for the feed (charts/stats still reflect everything).
  const visible = useMemo(
    () => (activeSources.size === 0 ? items : items.filter((i) => activeSources.has(i.source))),
    [items, activeSources],
  );

  const hasData = items.length > 0;

  const prioritySegments = [
    { label: "Needs attention", value: stats.counts.high, color: PRIORITY_META.high.color },
    { label: "Worth knowing", value: stats.counts.medium, color: PRIORITY_META.medium.color },
    { label: "Good to know", value: stats.counts.low, color: PRIORITY_META.low.color },
  ];

  const sourceBars = [...stats.bySource.entries()]
    .map(([source, value]) => ({
      label: sourceMeta(source).label,
      value,
      color: sourceMeta(source).color,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <main className="page page--wide">
      <header className="dash-head">
        <div>
          <h1>BHS Dashboard</h1>
          <p className="muted">
            Everything from your school — email, Classroom, grades, socials — read and ranked by AI.
          </p>
        </div>
        <button type="button" className="scan-btn" onClick={scan} disabled={scanning}>
          {scanning ? "Reading sources…" : hasData ? "Rescan" : "Scan sources"}
        </button>
      </header>

      {error && <div className="error">Error: {error}</div>}

      {loading && !hasData ? (
        <p className="muted">Loading…</p>
      ) : !hasData ? (
        <div className="empty">
          <p>No items yet.</p>
          <p className="muted">Hit "Scan sources" and the AI will read your simulated feeds.</p>
        </div>
      ) : (
        <>
          <StatCards
            stats={[
              {
                label: "Needs your attention",
                value: stats.counts.high,
                accent: PRIORITY_META.high.color,
                hint: "high-importance items",
              },
              {
                label: "Due this week",
                value: stats.dueSoon,
                accent: "#d97706",
                hint: "with a deadline ≤ 7 days",
              },
              {
                label: "School updates",
                value: stats.school.length,
                accent: "#2563eb",
                hint: `across ${stats.bySource.size} sources`,
              },
              {
                label: "Noise filtered",
                value: stats.counts.noise,
                accent: "#9ca3af",
                hint: "hidden by the AI",
              },
            ]}
          />

          <div className="charts">
            <section className="card chart-card">
              <h2 className="chart-card__title">Priority mix</h2>
              <Donut
                segments={prioritySegments}
                centerValue={stats.school.length}
                centerLabel="school items"
              />
            </section>
            <section className="card chart-card">
              <h2 className="chart-card__title">Where it comes from</h2>
              <BarChart bars={sourceBars} />
            </section>
          </div>

          <div className="filters">
            <button
              type="button"
              className={activeSources.size === 0 ? "chip chip--on" : "chip"}
              onClick={() => setActiveSources(new Set())}
            >
              All
            </button>
            {[...stats.bySource.keys()].map((source) => {
              const m = sourceMeta(source);
              return (
                <button
                  key={source}
                  type="button"
                  className={activeSources.has(source) ? "chip chip--on" : "chip"}
                  onClick={() => toggleSource(source)}
                >
                  <span style={{ color: m.color }}>{m.icon}</span> {m.label}
                </button>
              );
            })}
          </div>

          <FeedView items={visible} />
        </>
      )}

      <footer className="page__footer">
        <p>
          Sources are simulated for this demo; the AI reading them is real. Wire real APIs in{" "}
          <code>apps/server/src/sources/</code>.
        </p>
      </footer>
    </main>
  );
}
