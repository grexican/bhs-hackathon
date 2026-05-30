import type { Persona } from "../api";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../auth";
import { POSITION_LABELS } from "../lib/ui";

// The "who are you?" screen. No passwords — this is a demo, so logging in is
// just picking a persona. Pick the coach to manage the team, or any player to
// see their personal stats and growth plan.
export function Login() {
  const { personas, login, loading } = useAuth();

  const coaches = personas.filter((p) => p.role === "coach");
  const players = personas.filter((p) => p.role === "player");
  const team = personas[0]?.team;

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <span className="login__logo">🏐</span>
          <h1>RotationIQ</h1>
          <p className="muted">Volleyball stats, growth, and team comms — for the whole roster.</p>
        </div>

        {team && (
          <div className="login__team">
            <strong>{team.name}</strong>
            <span className="muted"> · {team.season}</span>
          </div>
        )}

        <p className="login__hint">Pick who you want to explore as. You can switch anytime.</p>

        {loading ? (
          <p className="muted">Loading the roster…</p>
        ) : (
          <>
            <h2 className="login__group">Coach</h2>
            <div className="login__list">
              {coaches.map((p) => (
                <PersonaButton key={p.id} persona={p} onPick={login} subtitle="Head Coach" />
              ))}
            </div>

            <h2 className="login__group">Players</h2>
            <div className="login__list">
              {players.map((p) => (
                <PersonaButton
                  key={p.id}
                  persona={p}
                  onPick={login}
                  subtitle={`#${p.jersey_number} · ${p.position ? POSITION_LABELS[p.position] : ""}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// One clickable persona row.
function PersonaButton({ persona, onPick, subtitle }: { persona: Persona; onPick: (p: Persona) => void; subtitle: string }) {
  return (
    <button type="button" className="persona" onClick={() => onPick(persona)}>
      <Avatar name={persona.name} color={persona.avatar_color} size={40} />
      <span className="persona__text">
        <strong>{persona.name}</strong>
        <span className="muted">{subtitle}</span>
      </span>
    </button>
  );
}
