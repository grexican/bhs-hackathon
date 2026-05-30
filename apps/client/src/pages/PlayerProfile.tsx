import type { PlayerProfile as ProfileData } from "../api";
import { useAuth } from "../auth";
import { Avatar } from "../components/Avatar";
import { MetricBar } from "../components/MetricBar";
import { RatingRing } from "../components/RatingRing";
import { Card, ErrorBox, Loading, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";
import { LEVEL_LABELS, POSITION_LABELS, formatDate } from "../lib/ui";
import { useNav } from "../router";

// One player's full story: an overall rating, every skill graded against their
// level (with the honest "how far up the levels does this hold up" read), and
// a game-by-game log. This is the page a player lives on.
export function PlayerProfile({ playerId }: { playerId: number }) {
  const { user } = useAuth();
  const { go } = useNav();
  const { data, loading, error } = useApi<ProfileData>(`/api/players/${playerId}`);

  if (loading) return <Loading label="Loading profile…" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const { player, report, gameLog } = data;
  const isMe = user?.id === player.id;

  return (
    <div className="stack">
      <PageHeader title={isMe ? "My Profile" : player.name} subtitle="Skill grades are measured against your level — what's good for one level is average at the next." />

      <Card className="profile-head">
        <div className="profile-head__id">
          <Avatar name={player.name} color={player.avatar_color} size={64} />
          <div>
            <h2 className="profile-head__name">{player.name}</h2>
            <p className="muted">
              #{player.jersey_number} · {player.position ? POSITION_LABELS[player.position] : ""} ·{" "}
              {player.level ? LEVEL_LABELS[player.level] : ""}
            </p>
            <p className="muted profile-head__meta">
              {player.grade_year ? `Grade ${player.grade_year}` : ""}
              {player.height_cm ? ` · ${Math.floor(player.height_cm / 30.48)}'${Math.round((player.height_cm % 30.48) / 2.54)}"` : ""}
              {` · ${report.games} games · ${report.sets} sets`}
            </p>
          </div>
        </div>
        <div className="profile-head__rating">
          <RatingRing score={report.overall.score} grade={report.overall.grade} size={120} />
          <div className="profile-head__plays">
            <span className="muted">Production holds up at</span>
            <strong>{report.overall.playsLikeLevel ? LEVEL_LABELS[report.overall.playsLikeLevel] : "—"} level</strong>
          </div>
        </div>
      </Card>

      <div className="grid-2">
        <Card>
          <h3 className="panel__title">Skill grades</h3>
          <p className="muted panel__sub">vs other {report.level ? LEVEL_LABELS[report.level] : ""} {player.position} players</p>
          {report.metrics.map((m) => (
            <MetricBar key={m.id} metric={m} />
          ))}
        </Card>

        <Card>
          <h3 className="panel__title">Every metric</h3>
          <p className="muted panel__sub">The full picture, including stats outside your main role.</p>
          <div className="metric-mini-list">
            {report.allMetrics.map((m) => (
              <div key={m.id} className="metric-mini">
                <span className="metric-mini__label">{m.label}</span>
                <span className="metric-mini__val">{m.display}</span>
                <span className="metric-mini__grade" style={{ color: scoreToColor(m.score) }}>
                  {m.grade}
                </span>
              </div>
            ))}
          </div>
          {isMe && (
            <button type="button" className="btn btn--primary profile__growth-btn" onClick={() => go("growth", { playerId })}>
              🌱 See my growth plan →
            </button>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="panel__title">Game log</h3>
        {gameLog.length === 0 ? (
          <p className="muted state-note">No games recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="boxscore">
              <thead>
                <tr>
                  <th className="boxscore__player">Game</th>
                  <th>Res</th>
                  <th>SP</th>
                  <th>K</th>
                  <th>Hit%</th>
                  <th>Ace</th>
                  <th>Dig</th>
                  <th>Blk</th>
                  <th>Ast</th>
                  <th>Pass</th>
                </tr>
              </thead>
              <tbody>
                {[...gameLog].reverse().map((g) => (
                  <tr key={g.line.id} className="boxscore__row" onClick={() => go("game", { gameId: g.game.id })}>
                    <td className="boxscore__player">
                      <span>
                        <strong>vs {g.game.opponent}</strong>
                        <span className="muted"> {formatDate(g.game.scheduled_at)}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`reschip reschip--${g.game.result}`}>{g.game.result === "win" ? "W" : "L"}</span>
                    </td>
                    <td>{g.line.sets_played}</td>
                    <td>{g.line.kills}</td>
                    <td>{g.metrics.hitting_pct !== null ? g.metrics.hitting_pct.toFixed(3).replace(/^0/, "") : "—"}</td>
                    <td>{g.line.aces}</td>
                    <td>{g.line.digs}</td>
                    <td>{g.line.solo_blocks + Math.round(g.line.block_assists * 0.5)}</td>
                    <td>{g.line.assists}</td>
                    <td>{g.metrics.passer_rating !== null ? g.metrics.passer_rating.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function scoreToColor(score: number): string {
  if (score >= 88) return "#7c3aed";
  if (score >= 76) return "#16a34a";
  if (score >= 60) return "#2563eb";
  if (score >= 45) return "#d97706";
  return "#dc2626";
}
