import { useState } from "react";

import { api, type GameDetail as GameDetailData } from "../api";
import { useAuth } from "../auth";
import { Avatar } from "../components/Avatar";
import { Card, ErrorBox, Loading, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";
import { formatDate, formatTime } from "../lib/ui";
import { useNav } from "../router";

// A single game: the matchup, final score, and the full box score (every
// player's line with the key derived stats). Coaches can post/edit the result
// and jump to the stat-recording screen.
export function GameDetail({ gameId }: { gameId: number }) {
  const { user } = useAuth();
  const { go } = useNav();
  const { data, loading, error, reload } = useApi<GameDetailData>(`/api/games/${gameId}`);
  const isCoach = user?.role === "coach";

  if (loading) return <Loading label="Loading game…" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const { game, lines } = data;

  return (
    <div className="stack">
      <PageHeader
        title={`vs ${game.opponent}`}
        subtitle={`${formatDate(game.scheduled_at)} · ${formatTime(game.scheduled_at)} · ${game.home_away === "home" ? "Home" : "Away"} · ${game.location ?? ""}`}
        action={
          <button type="button" className="btn btn--primary" onClick={() => go("record", { gameId })}>
            ✏️ Record stats
          </button>
        }
      />

      <div className="grid-2">
        <Card className="scoreboard">
          <div className="scoreboard__side">
            <span className="scoreboard__name">BHS</span>
            <span className="scoreboard__sets">{game.our_sets ?? "–"}</span>
          </div>
          <div className="scoreboard__mid">
            {game.status === "completed" ? (
              <span className={`scoreboard__result scoreboard__result--${game.result}`}>
                {game.result === "win" ? "WIN" : "LOSS"}
              </span>
            ) : (
              <span className="muted">Not played yet</span>
            )}
          </div>
          <div className="scoreboard__side">
            <span className="scoreboard__name">{game.opponent}</span>
            <span className="scoreboard__sets">{game.opp_sets ?? "–"}</span>
          </div>
        </Card>

        {isCoach && <ResultEditor gameId={gameId} our={game.our_sets} opp={game.opp_sets} onSaved={reload} />}
      </div>

      <Card>
        <h3 className="panel__title">Box score</h3>
        {lines.length === 0 ? (
          <p className="muted state-note">
            No stats recorded yet.{" "}
            <button type="button" className="linkbtn" onClick={() => go("record", { gameId })}>
              Record them now →
            </button>
          </p>
        ) : (
          <div className="table-wrap">
            <table className="boxscore">
              <thead>
                <tr>
                  <th className="boxscore__player">Player</th>
                  <th>SP</th>
                  <th>K</th>
                  <th>Hit%</th>
                  <th>Ace</th>
                  <th>SE</th>
                  <th>Dig</th>
                  <th>Blk</th>
                  <th>Ast</th>
                  <th>Pass</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="boxscore__row" onClick={() => go("player", { playerId: l.player.id })}>
                    <td className="boxscore__player">
                      <Avatar name={l.player.name} color={l.player.avatar_color} size={28} />
                      <span>
                        <strong>{l.player.name}</strong>
                        <span className="muted"> #{l.player.jersey_number} · {l.player.position}</span>
                      </span>
                    </td>
                    <td>{l.sets_played}</td>
                    <td>{l.kills}</td>
                    <td>{fmtPct(l.metrics.hitting_pct)}</td>
                    <td>{l.aces}</td>
                    <td>{l.serve_errors}</td>
                    <td>{l.digs}</td>
                    <td>{l.solo_blocks + Math.round(l.block_assists * 0.5)}</td>
                    <td>{l.assists}</td>
                    <td>{l.metrics.passer_rating !== null ? l.metrics.passer_rating.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="boxscore__legend muted">
          SP sets · K kills · SE serve errors · Blk block points · Ast assists · Pass 0–3 rating. Click a player for
          their full profile.
        </p>
      </Card>
    </div>
  );
}

function fmtPct(v: number | null): string {
  return v === null ? "—" : v.toFixed(3).replace(/^0/, "").replace(/^-0/, "-");
}

// Coach widget to enter the final set score; win/loss is derived server-side.
function ResultEditor({ gameId, our, opp, onSaved }: { gameId: number; our: number | null; opp: number | null; onSaved: () => void }) {
  const [ourSets, setOurSets] = useState(our ?? 0);
  const [oppSets, setOppSets] = useState(opp ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/games/${gameId}`, { our_sets: ourSets, opp_sets: oppSets, status: "completed" });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h3 className="panel__title">Post / edit result</h3>
      {error && <ErrorBox message={error} />}
      <div className="result-editor">
        <label className="field field--mini">
          <span>BHS sets</span>
          <input type="number" min={0} max={5} value={ourSets} onChange={(e) => setOurSets(Number(e.target.value))} />
        </label>
        <label className="field field--mini">
          <span>Opp sets</span>
          <input type="number" min={0} max={5} value={oppSets} onChange={(e) => setOppSets(Number(e.target.value))} />
        </label>
        <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save result"}
        </button>
      </div>
    </Card>
  );
}
