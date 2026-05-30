import { useEffect, useState } from "react";

import { api, type Game, type GameDetail, type PlayerListItem } from "../api";
import { useAuth } from "../auth";
import { Avatar } from "../components/Avatar";
import { Card, ErrorBox, PageHeader } from "../components/primitives";
import { useApi } from "../hooks/useApi";
import { formatDate } from "../lib/ui";

// The scorekeeping screen — this is how stats actually get into the system.
// A teammate on the bench picks the game and a player, taps in what they
// tracked, and saves. Re-saving the same player updates their line.
//
// Passing is entered as an average 0–3 rating (how scorers actually grade
// passes); we convert it to the running total the database stores.

type Counts = Record<string, number>;

const SERVE = [
  ["serve_attempts", "Serve attempts"],
  ["aces", "Aces"],
  ["serve_errors", "Serve errors"],
] as const;
const ATTACK = [
  ["attack_attempts", "Attack attempts"],
  ["kills", "Kills"],
  ["attack_errors", "Attack errors"],
] as const;
const SETTING = [
  ["assists", "Assists"],
  ["ball_handling_errors", "Ball-handling errors"],
] as const;
const DEFENSE = [
  ["digs", "Digs"],
  ["solo_blocks", "Solo blocks"],
  ["block_assists", "Block assists"],
  ["block_errors", "Block errors"],
] as const;

export function RecordStats({ initialGameId }: { initialGameId?: number }) {
  const { user } = useAuth();
  const teamId = user?.team_id ?? 1;

  const games = useApi<Game[]>(`/api/games?teamId=${teamId}`);
  const players = useApi<PlayerListItem[]>(`/api/players?teamId=${teamId}`);

  const [gameId, setGameId] = useState<number | null>(initialGameId ?? null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [counts, setCounts] = useState<Counts>({});
  const [setsPlayed, setSetsPlayed] = useState(3);
  const [avgPass, setAvgPass] = useState(2);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the most recent completed game once the list loads.
  useEffect(() => {
    if (gameId === null && games.data && games.data.length > 0) {
      const completed = games.data.filter((g) => g.status === "completed");
      const pick = completed[completed.length - 1] ?? games.data[0];
      if (pick) setGameId(pick.id);
    }
  }, [games.data, gameId]);

  // When game + player are chosen, prefill from any line already recorded.
  const detail = useApi<GameDetail>(gameId ? `/api/games/${gameId}` : null);
  useEffect(() => {
    setSaved(false);
    if (!playerId || !detail.data) {
      setCounts({});
      return;
    }
    const existing = detail.data.lines.find((l) => l.player.id === playerId);
    if (existing) {
      // Copy only the numeric stat columns — skip the nested player/metrics.
      const next: Counts = {};
      for (const [key, label] of [...SERVE, ...ATTACK, ...SETTING, ...DEFENSE]) {
        void label;
        next[key] = existing[key as keyof typeof existing] as number;
      }
      next.reception_attempts = existing.reception_attempts;
      next.reception_errors = existing.reception_errors;
      setCounts(next);
      setSetsPlayed(existing.sets_played);
      setAvgPass(existing.reception_attempts > 0 ? existing.reception_rating_total / existing.reception_attempts : 2);
    } else {
      setCounts({});
      setSetsPlayed(3);
      setAvgPass(2);
    }
  }, [playerId, detail.data]);

  const set = (key: string, value: number) => setCounts((c) => ({ ...c, [key]: Math.max(0, value) }));
  const get = (key: string) => counts[key] ?? 0;

  async function save() {
    if (!gameId || !playerId) return;
    setSaving(true);
    setError(null);
    try {
      const receptionAttempts = get("reception_attempts");
      await api.put(`/api/games/${gameId}/stats/${playerId}`, {
        recorded_by: user?.id ?? null,
        sets_played: setsPlayed,
        serve_attempts: get("serve_attempts"),
        aces: get("aces"),
        serve_errors: get("serve_errors"),
        reception_attempts: receptionAttempts,
        reception_errors: get("reception_errors"),
        reception_rating_total: Math.round(avgPass * receptionAttempts),
        attack_attempts: get("attack_attempts"),
        kills: get("kills"),
        attack_errors: get("attack_errors"),
        assists: get("assists"),
        ball_handling_errors: get("ball_handling_errors"),
        digs: get("digs"),
        solo_blocks: get("solo_blocks"),
        block_assists: get("block_assists"),
        block_errors: get("block_errors"),
      });
      setSaved(true);
      detail.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const selectedPlayer = players.data?.find((p) => p.id === playerId);

  return (
    <div className="stack">
      <PageHeader title="Record stats" subtitle="Keep the book for a teammate. Pick a game and a player, then tap in what you tracked." />

      {error && <ErrorBox message={error} />}

      <Card>
        <div className="record-pick">
          <label className="field">
            <span>Game</span>
            <select value={gameId ?? ""} onChange={(e) => setGameId(Number(e.target.value))}>
              {(games.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  vs {g.opponent} · {formatDate(g.scheduled_at)} {g.status === "completed" ? `(${g.our_sets}-${g.opp_sets})` : "(upcoming)"}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Player</span>
            <select value={playerId ?? ""} onChange={(e) => setPlayerId(Number(e.target.value))}>
              <option value="">Select a player…</option>
              {(players.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.jersey_number} {p.name} ({p.position})
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {!playerId ? (
        <Card>
          <p className="muted state-note">👆 Pick a player to start recording their stat line.</p>
        </Card>
      ) : (
        <Card>
          <div className="record-head">
            {selectedPlayer && <Avatar name={selectedPlayer.name} color={selectedPlayer.avatar_color} size={40} />}
            <div>
              <strong>{selectedPlayer?.name}</strong>
              <span className="muted"> · #{selectedPlayer?.jersey_number} · {selectedPlayer?.position}</span>
            </div>
            <label className="field field--mini record-head__sets">
              <span>Sets played</span>
              <input type="number" min={0} max={5} value={setsPlayed} onChange={(e) => setSetsPlayed(Number(e.target.value))} />
            </label>
          </div>

          <div className="record-groups">
            <StatGroup title="🎯 Serving" fields={SERVE} get={get} set={set} />
            <StatGroup title="💥 Attacking" fields={ATTACK} get={get} set={set} />
            <StatGroup title="🤝 Setting" fields={SETTING} get={get} set={set} />
            <StatGroup title="🛡️ Defense" fields={DEFENSE} get={get} set={set} />

            <div className="statgroup">
              <h4 className="statgroup__title">📥 Passing</h4>
              <div className="statgroup__fields">
                <NumberField label="Reception attempts" value={get("reception_attempts")} onChange={(v) => set("reception_attempts", v)} />
                <NumberField label="Reception errors" value={get("reception_errors")} onChange={(v) => set("reception_errors", v)} />
                <label className="numfield">
                  <span className="numfield__label">Avg pass rating: {avgPass.toFixed(1)}</span>
                  <input type="range" min={0} max={3} step={0.1} value={avgPass} onChange={(e) => setAvgPass(Number(e.target.value))} />
                </label>
              </div>
            </div>
          </div>

          <div className="record-actions">
            <button type="button" className="btn btn--primary btn--lg" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "💾 Save stat line"}
            </button>
            {saved && <span className="record-saved">✓ Saved! Grades updated.</span>}
          </div>
        </Card>
      )}
    </div>
  );
}

function StatGroup({
  title,
  fields,
  get,
  set,
}: {
  title: string;
  fields: readonly (readonly [string, string])[];
  get: (k: string) => number;
  set: (k: string, v: number) => void;
}) {
  return (
    <div className="statgroup">
      <h4 className="statgroup__title">{title}</h4>
      <div className="statgroup__fields">
        {fields.map(([key, label]) => (
          <NumberField key={key} label={label} value={get(key)} onChange={(v) => set(key, v)} />
        ))}
      </div>
    </div>
  );
}

// A number input with big +/- steppers, easy to tap on a phone courtside.
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="numfield">
      <span className="numfield__label">{label}</span>
      <div className="numfield__control">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </button>
        <input type="number" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <button type="button" onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
