import { type FormEvent, useState } from "react";

import { api, type Game, type GrowthPlan, type ReflectionsResponse } from "../api";
import { useAuth } from "../auth";
import { Card, ErrorBox, Loading, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";
import { formatDate } from "../lib/ui";

// The growth coach. It shows the plan distilled from the player's real stats
// and their own reflections, and lets the player log a new reflection — which
// instantly refreshes the plan. This is the "AI turns how-I-felt into a
// focused program" feature from the brief.
export function Growth({ playerId }: { playerId: number }) {
  const { user } = useAuth();
  const teamId = user?.team_id ?? 1;
  const { data, loading, error, reload } = useApi<ReflectionsResponse>(`/api/players/${playerId}/reflections`);
  const games = useApi<Game[]>(`/api/games?teamId=${teamId}`);
  const isMe = user?.id === playerId;

  if (loading) return <Loading label="Building your growth plan…" />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const plan = data.current.plan;

  return (
    <div className="stack">
      <PageHeader title={isMe ? "My Growth Plan" : "Growth Plan"} subtitle="Distilled from real stats + the player's own reflections. Updates the moment new data comes in." />

      <PlanView plan={plan} />

      {isMe && (
        <ReflectionForm
          playerId={playerId}
          games={(games.data ?? []).filter((g) => g.status === "completed")}
          onSaved={reload}
        />
      )}

      <Card>
        <h3 className="panel__title">Reflection history</h3>
        {data.reflections.length === 0 ? (
          <p className="muted state-note">No reflections yet. {isMe ? "Log one above to sharpen your plan." : ""}</p>
        ) : (
          <ul className="reflection-list">
            {data.reflections.map((r) => (
              <li key={r.id} className="reflection">
                <div className="reflection__head">
                  <strong>vs {r.game.opponent}</strong>
                  <span className="muted">{formatDate(r.game.scheduled_at)}</span>
                </div>
                <div className="reflection__ratings">
                  <Rating label="Felt" value={r.felt_rating} />
                  <Rating label="Energy" value={r.energy} />
                  <Rating label="Confidence" value={r.confidence} />
                </div>
                {r.notes && <p className="reflection__notes">“{r.notes}”</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// Render the structured growth plan.
function PlanView({ plan }: { plan: GrowthPlan }) {
  return (
    <Card className="plan">
      <div className="plan__summary">
        <span className="plan__tag">🌱 Growth focus</span>
        <p>{plan.summary}</p>
        <span className="plan__source muted">Based on {plan.generatedFrom}</span>
      </div>

      <div className="plan__cols">
        <div className="plan__col">
          <h4 className="plan__h">💪 Strengths to lean on</h4>
          {plan.strengths.length === 0 ? (
            <p className="muted">Keep logging games to surface your strengths.</p>
          ) : (
            plan.strengths.map((s) => (
              <div key={s.skill} className="plan__item">
                <strong>{s.skill}</strong>
                <p className="muted">{s.detail}</p>
              </div>
            ))
          )}
        </div>

        <div className="plan__col">
          <h4 className="plan__h">🎯 Focus areas</h4>
          {plan.focusAreas.map((f) => (
            <div key={f.skill} className="plan__item plan__item--focus">
              <strong>{f.skill}</strong>
              <p className="muted">{f.why}</p>
              <p className="plan__drill">🏐 Drill: {f.drill}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="plan__fitness">
        <div className="plan__fitcard plan__fitcard--mental">
          <h4>🧠 Mental fitness</h4>
          <p>{plan.mental}</p>
        </div>
        <div className="plan__fitcard plan__fitcard--physical">
          <h4>🏋️ Physical fitness</h4>
          <p>{plan.physical}</p>
        </div>
      </div>

      <div className="plan__next">
        <h4>⭐ Your one focus next game</h4>
        <p>{plan.nextGame}</p>
        <p className="plan__outlook muted">{plan.levelOutlook}</p>
      </div>
    </Card>
  );
}

function Rating({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="rating-pill">
      <span className="muted">{label}</span>
      <span className="rating-pill__dots">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`dot ${value && n <= value ? "dot--on" : ""}`} />
        ))}
      </span>
    </span>
  );
}

// The form a player fills in after a game.
function ReflectionForm({ playerId, games, onSaved }: { playerId: number; games: Game[]; onSaved: () => void }) {
  const [gameId, setGameId] = useState<number | "">(games[games.length - 1]?.id ?? "");
  const [felt, setFelt] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [confidence, setConfidence] = useState(3);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!gameId) return;
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      await api.post(`/api/players/${playerId}/reflections`, {
        game_id: Number(gameId),
        felt_rating: felt,
        energy,
        confidence,
        notes: notes.trim() || null,
      });
      setDone(true);
      setNotes("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h3 className="panel__title">Log a reflection</h3>
      <p className="muted panel__sub">How did the game feel? Be honest — it shapes your plan.</p>
      {error && <ErrorBox message={error} />}
      <form className="reflect-form" onSubmit={submit}>
        <label className="field">
          <span>Which game?</span>
          <select value={gameId} onChange={(e) => setGameId(e.target.value ? Number(e.target.value) : "")}>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                vs {g.opponent} · {formatDate(g.scheduled_at)}
              </option>
            ))}
          </select>
        </label>

        <Slider label="Overall, how did it feel?" value={felt} onChange={setFelt} />
        <Slider label="Physical energy" value={energy} onChange={setEnergy} />
        <Slider label="Confidence / headspace" value={confidence} onChange={setConfidence} />

        <label className="field">
          <span>In your own words (optional)</span>
          <textarea
            value={notes}
            rows={3}
            placeholder="What went well, what frustrated you, how your body felt…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="reflect-form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Distilling…" : "Save & update my plan"}
          </button>
          {done && <span className="record-saved">✓ Plan updated above!</span>}
        </div>
      </form>
    </Card>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field slider">
      <span>
        {label} <strong>{value}/5</strong>
      </span>
      <input type="range" min={1} max={5} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
