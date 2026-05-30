import { type FormEvent, useState } from "react";

import { api, type Game } from "../api";
import { useAuth } from "../auth";
import { Card, Empty, ErrorBox, Loading, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";
import { formatDate, formatTime } from "../lib/ui";
import { useNav } from "../router";

// The team calendar: upcoming games and past results. Coaches can schedule a
// new game right here; anyone can click a finished game to see its box score.
export function Schedule() {
  const { user } = useAuth();
  const { go } = useNav();
  const teamId = user?.team_id ?? 1;
  const { data, loading, error, reload } = useApi<Game[]>(`/api/games?teamId=${teamId}`);
  const [adding, setAdding] = useState(false);

  const isCoach = user?.role === "coach";
  const upcoming = (data ?? []).filter((g) => g.status === "scheduled");
  const results = (data ?? []).filter((g) => g.status === "completed").reverse();

  return (
    <div className="stack">
      <PageHeader
        title="Schedule"
        subtitle="Games, results, and box scores."
        action={
          isCoach ? (
            <button type="button" className="btn btn--primary" onClick={() => setAdding((v) => !v)}>
              {adding ? "Cancel" : "+ Schedule game"}
            </button>
          ) : undefined
        }
      />

      {error && <ErrorBox message={error} />}
      {adding && isCoach && (
        <AddGameForm
          teamId={teamId}
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      )}

      <Card>
        <h3 className="panel__title">Upcoming</h3>
        {loading ? (
          <Loading />
        ) : upcoming.length === 0 ? (
          <Empty label="No games scheduled yet." />
        ) : (
          <ul className="gamelist">
            {upcoming.map((g) => (
              <li key={g.id}>
                <button type="button" className="gamerow" onClick={() => go("game", { gameId: g.id })}>
                  <div className="gamerow__date">
                    <strong>{formatDate(g.scheduled_at)}</strong>
                    <span className="muted">{formatTime(g.scheduled_at)}</span>
                  </div>
                  <div className="gamerow__match">
                    <strong>vs {g.opponent}</strong>
                    <span className="muted">{g.home_away === "home" ? "🏠 Home" : "✈️ Away"} · {g.location}</span>
                  </div>
                  <span className="gamerow__chip gamerow__chip--upcoming">Scheduled</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="panel__title">Results</h3>
        {loading ? (
          <Loading />
        ) : results.length === 0 ? (
          <Empty label="No results yet." />
        ) : (
          <ul className="gamelist">
            {results.map((g) => (
              <li key={g.id}>
                <button type="button" className="gamerow" onClick={() => go("game", { gameId: g.id })}>
                  <div className="gamerow__date">
                    <strong>{formatDate(g.scheduled_at)}</strong>
                    <span className="muted">{g.home_away === "home" ? "Home" : "Away"}</span>
                  </div>
                  <div className="gamerow__match">
                    <strong>vs {g.opponent}</strong>
                    <span className="muted">
                      {g.our_sets}–{g.opp_sets} sets
                    </span>
                  </div>
                  <span className={`gamerow__chip gamerow__chip--${g.result}`}>
                    {g.result === "win" ? "W" : "L"} {g.our_sets}–{g.opp_sets}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// Coach-only form to put a new game on the calendar.
function AddGameForm({ teamId, onDone }: { teamId: number; onDone: () => void }) {
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("BHS Main Gym");
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!opponent.trim() || !date) return;
    setSaving(true);
    setError(null);
    try {
      await api.post<Game>("/api/games", {
        team_id: teamId,
        opponent: opponent.trim(),
        location,
        home_away: homeAway,
        scheduled_at: new Date(date).toISOString(),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Card>
      <h3 className="panel__title">Schedule a game</h3>
      {error && <ErrorBox message={error} />}
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          <span>Opponent</span>
          <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Riverside Prep" />
        </label>
        <label className="field">
          <span>Date & time</span>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label className="field">
          <span>Home / Away</span>
          <select value={homeAway} onChange={(e) => setHomeAway(e.target.value as "home" | "away")}>
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
        </label>
        <div className="form-grid__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Saving…" : "Add to schedule"}
          </button>
        </div>
      </form>
    </Card>
  );
}
