import type { Game, Message, PlayerListItem, PlayerProfile } from "../api";
import { useAuth } from "../auth";
import { Avatar } from "../components/Avatar";
import { GradeBadge } from "../components/GradeBadge";
import { MetricBar } from "../components/MetricBar";
import { RatingRing } from "../components/RatingRing";
import { Card, ErrorBox, Loading, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";
import { LEVEL_LABELS, formatDate, formatTime } from "../lib/ui";
import { useNav } from "../router";

// The landing page. It greets you and adapts to your role: players see their
// own rating + growth focus; coaches see the team's record and top performers.
export function Dashboard() {
  const { user } = useAuth();
  const { go } = useNav();
  const teamId = user?.team_id ?? 1;

  const games = useApi<Game[]>(`/api/games?teamId=${teamId}`);
  const messages = useApi<Message[]>(`/api/teams/${teamId}/messages`);
  const isCoach = user?.role === "coach";

  const nextGame = games.data?.find((g) => g.status === "scheduled");
  const pinned = messages.data?.find((m) => m.pinned);

  return (
    <div className="stack">
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0]} 👋`}
        subtitle={isCoach ? "Here's where your team stands." : "Here's your game, at a glance."}
      />

      {games.error && <ErrorBox message={games.error} />}

      <div className="grid-2">
        {isCoach ? <CoachHero teamId={teamId} /> : <PlayerHero playerId={user!.id} />}

        <Card>
          <h3 className="panel__title">Next up</h3>
          {games.loading ? (
            <Loading />
          ) : nextGame ? (
            <button type="button" className="nextgame" onClick={() => go("game", { gameId: nextGame.id })}>
              <div className="nextgame__date">
                <span className="nextgame__day">{formatDate(nextGame.scheduled_at)}</span>
                <span className="muted">{formatTime(nextGame.scheduled_at)}</span>
              </div>
              <div className="nextgame__match">
                <strong>vs {nextGame.opponent}</strong>
                <span className="muted">
                  {nextGame.home_away === "home" ? "🏠 Home" : "✈️ Away"} · {nextGame.location}
                </span>
              </div>
            </button>
          ) : (
            <p className="muted">No upcoming games scheduled.</p>
          )}

          {pinned && (
            <div className="pinned">
              <span className="pinned__tag">📌 Pinned</span>
              <p>{pinned.body}</p>
            </div>
          )}
        </Card>
      </div>

      {isCoach ? <TopPerformers teamId={teamId} /> : <PlayerFocus playerId={user!.id} />}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// --- Player's headline rating ring + position/level ---
function PlayerHero({ playerId }: { playerId: number }) {
  const { data, loading } = useApi<PlayerProfile>(`/api/players/${playerId}`);
  const { go } = useNav();
  if (loading || !data) return <Card>{loading ? <Loading /> : null}</Card>;

  const { report } = data;
  return (
    <Card className="hero">
      <RatingRing score={report.overall.score} grade={report.overall.grade} size={130} />
      <div className="hero__text">
        <h3 className="panel__title">Your season rating</h3>
        <p className="muted">
          {report.position} · {LEVEL_LABELS[report.level]} · {report.games} games
        </p>
        <p className="hero__plays">
          Plays like{" "}
          <strong>{report.overall.playsLikeLevel ? LEVEL_LABELS[report.overall.playsLikeLevel] : "—"}</strong> level
        </p>
        <button type="button" className="btn btn--primary" onClick={() => go("player", { playerId })}>
          View full profile →
        </button>
      </div>
    </Card>
  );
}

// --- Player's top 3 graded skills + a growth teaser ---
function PlayerFocus({ playerId }: { playerId: number }) {
  const profile = useApi<PlayerProfile>(`/api/players/${playerId}`);
  const insights = useApi<{ plan: { summary: string; nextGame: string } }>(`/api/players/${playerId}/insights`);
  const { go } = useNav();

  return (
    <div className="grid-2">
      <Card>
        <h3 className="panel__title">Your top skills</h3>
        {profile.loading ? (
          <Loading />
        ) : (
          profile.data?.report.metrics.slice(0, 3).map((m) => <MetricBar key={m.id} metric={m} />)
        )}
      </Card>

      <Card className="growth-teaser">
        <h3 className="panel__title">🌱 Your growth focus</h3>
        {insights.loading ? (
          <Loading />
        ) : insights.data ? (
          <>
            <p className="growth-teaser__summary">{insights.data.plan.summary}</p>
            <div className="growth-teaser__next">
              <strong>Next game:</strong> {insights.data.plan.nextGame}
            </div>
            <button type="button" className="btn btn--primary" onClick={() => go("growth", { playerId })}>
              See my full growth plan →
            </button>
          </>
        ) : null}
      </Card>
    </div>
  );
}

// --- Coach: team record + season info ---
function CoachHero({ teamId }: { teamId: number }) {
  const { data, loading } = useApi<Game[]>(`/api/games?teamId=${teamId}`);
  if (loading || !data) return <Card>{loading ? <Loading /> : null}</Card>;

  const completed = data.filter((g) => g.status === "completed");
  const wins = completed.filter((g) => g.result === "win").length;
  const losses = completed.filter((g) => g.result === "loss").length;
  const winPct = completed.length ? Math.round((wins / completed.length) * 100) : 0;

  return (
    <Card className="hero">
      <RatingRing score={winPct} grade={`${wins}-${losses}`} size={130} caption="Win rate" />
      <div className="hero__text">
        <h3 className="panel__title">Season record</h3>
        <p className="muted">{completed.length} games played</p>
        <p className="hero__plays">
          <strong>{wins}</strong> wins · <strong>{losses}</strong> losses
        </p>
      </div>
    </Card>
  );
}

// --- Coach: top performers leaderboard preview ---
function TopPerformers({ teamId }: { teamId: number }) {
  const { data, loading } = useApi<PlayerListItem[]>(`/api/players?teamId=${teamId}`);
  const { go } = useNav();

  const top = [...(data ?? [])].sort((a, b) => b.report.overall.score - a.report.overall.score).slice(0, 5);

  return (
    <Card>
      <div className="panel__head">
        <h3 className="panel__title">Top performers</h3>
        <button type="button" className="btn btn--ghost" onClick={() => go("roster")}>
          Full roster →
        </button>
      </div>
      {loading ? (
        <Loading />
      ) : (
        <ol className="leaders">
          {top.map((p, i) => (
            <li key={p.id}>
              <button type="button" className="leaders__row" onClick={() => go("player", { playerId: p.id })}>
                <span className="leaders__rank">{i + 1}</span>
                <Avatar name={p.name} color={p.avatar_color} size={34} />
                <span className="leaders__name">
                  <strong>{p.name}</strong>
                  <span className="muted">
                    #{p.jersey_number} · {p.position}
                  </span>
                </span>
                <span className="leaders__metric muted">
                  {p.report.headline ? `${p.report.headline.label} ${p.report.headline.display}` : ""}
                </span>
                <GradeBadge grade={p.report.overall.grade} tier={p.report.overall.tier} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
