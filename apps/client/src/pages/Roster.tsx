import { useState } from "react";

import type { PlayerListItem, Position } from "../api";
import { useAuth } from "../auth";
import { Avatar } from "../components/Avatar";
import { GradeBadge } from "../components/GradeBadge";
import { Card, ErrorBox, Loading, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";
import { LEVEL_LABELS, POSITION_LABELS, scoreColor } from "../lib/ui";
import { useNav } from "../router";

// The whole roster ranked by overall rating, with a filter by position.
// This is the team leaderboard — tap anyone to open their full profile.
export function Roster() {
  const { user } = useAuth();
  const { go } = useNav();
  const teamId = user?.team_id ?? 1;
  const { data, loading, error } = useApi<PlayerListItem[]>(`/api/players?teamId=${teamId}`);
  const [pos, setPos] = useState<Position | "all">("all");

  const positions: (Position | "all")[] = ["all", "OH", "OPP", "MB", "S", "L", "DS"];
  const filtered = (data ?? [])
    .filter((p) => pos === "all" || p.position === pos)
    .sort((a, b) => b.report.overall.score - a.report.overall.score);

  return (
    <div className="stack">
      <PageHeader title="Team Leaders" subtitle="Ranked by overall rating, judged against the team's level." />

      {error && <ErrorBox message={error} />}

      <Card>
        <div className="chips">
          {positions.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip ${pos === p ? "chip--active" : ""}`}
              onClick={() => setPos(p)}
            >
              {p === "all" ? "All" : p}
            </button>
          ))}
        </div>

        {loading ? (
          <Loading />
        ) : (
          <ol className="leaders leaders--full">
            {filtered.map((p, i) => (
              <li key={p.id}>
                <button type="button" className="leaders__row" onClick={() => go("player", { playerId: p.id })}>
                  <span className="leaders__rank">{i + 1}</span>
                  <Avatar name={p.name} color={p.avatar_color} size={40} />
                  <span className="leaders__name">
                    <strong>{p.name}</strong>
                    <span className="muted">
                      #{p.jersey_number} · {p.position ? POSITION_LABELS[p.position] : ""}
                    </span>
                  </span>
                  <span className="leaders__headline muted">
                    {p.report.headline ? `${p.report.headline.label}: ${p.report.headline.display}` : "No stats yet"}
                  </span>
                  <span className="leaders__plays muted">
                    {p.report.overall.playsLikeLevel ? `plays ~${LEVEL_LABELS[p.report.overall.playsLikeLevel]}` : ""}
                  </span>
                  <span className="leaders__score" style={{ color: scoreColor(p.report.overall.score) }}>
                    {p.report.overall.score}
                  </span>
                  <GradeBadge grade={p.report.overall.grade} tier={p.report.overall.tier} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
