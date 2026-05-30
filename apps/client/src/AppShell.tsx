import { useAuth } from "./auth";
import { Avatar } from "./components/Avatar";
import { type Route, useNav } from "./router";
import { Dashboard } from "./pages/Dashboard";
import { Schedule } from "./pages/Schedule";
import { GameDetail } from "./pages/GameDetail";
import { RecordStats } from "./pages/RecordStats";
import { Roster } from "./pages/Roster";
import { PlayerProfile } from "./pages/PlayerProfile";
import { Growth } from "./pages/Growth";
import { TeamChat } from "./pages/TeamChat";
import { Methodology } from "./pages/Methodology";

// The frame around every page: a left sidebar of navigation and a top bar
// showing who you're signed in as. The set of nav links depends on your role
// (coaches manage the team; players get their own profile + growth plan).
export function AppShell() {
  const { user, logout } = useAuth();
  const { route, params, go } = useNav();
  if (!user) return null;

  const isCoach = user.role === "coach";

  const links: { route: Route; label: string; icon: string; params?: Parameters<typeof go>[1] }[] = [
    { route: "dashboard", label: "Dashboard", icon: "🏠" },
    { route: "schedule", label: "Schedule", icon: "📅" },
    { route: "roster", label: isCoach ? "Roster & Leaders" : "Team Leaders", icon: "🏆" },
    ...(!isCoach ? [{ route: "player" as Route, label: "My Profile", icon: "📊", params: { playerId: user.id } }] : []),
    ...(!isCoach ? [{ route: "growth" as Route, label: "My Growth", icon: "🌱" }] : []),
    { route: "record", label: "Record Stats", icon: "✏️" },
    { route: "chat", label: "Team Feed", icon: "💬" },
    { route: "methodology", label: "How Ratings Work", icon: "📖" },
  ];

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <span className="shell__logo">🏐</span>
          <span>RotationIQ</span>
        </div>
        <nav className="shell__nav">
          {links.map((l) => (
            <button
              key={l.label}
              type="button"
              className={`navlink ${route === l.route && (l.route !== "player" || params.playerId === user.id) ? "navlink--active" : ""}`}
              onClick={() => go(l.route, l.params)}
            >
              <span className="navlink__icon">{l.icon}</span>
              {l.label}
            </button>
          ))}
        </nav>
        <div className="shell__sidefoot">
          <span className="muted">{user.team?.name}</span>
        </div>
      </aside>

      <div className="shell__main">
        <header className="shell__topbar">
          <div className="shell__role-pill">{isCoach ? "Coach view" : "Player view"}</div>
          <div className="shell__user">
            <Avatar name={user.name} color={user.avatar_color} size={34} />
            <div className="shell__user-text">
              <strong>{user.name}</strong>
              <span className="muted">
                {isCoach ? "Head Coach" : `#${user.jersey_number} · ${user.position}`}
              </span>
            </div>
            <button type="button" className="btn btn--ghost" onClick={logout}>
              Switch
            </button>
          </div>
        </header>

        <main className="shell__content">
          <Page />
        </main>
      </div>
    </div>
  );
}

// Pick the page component for the current route.
function Page() {
  const { route, params } = useNav();
  const { user } = useAuth();

  switch (route) {
    case "schedule":
      return <Schedule />;
    case "game":
      return <GameDetail gameId={params.gameId!} />;
    case "record":
      return <RecordStats initialGameId={params.gameId} />;
    case "roster":
      return <Roster />;
    case "player":
      return <PlayerProfile playerId={params.playerId ?? user!.id} />;
    case "growth":
      return <Growth playerId={params.playerId ?? user!.id} />;
    case "chat":
      return <TeamChat />;
    case "methodology":
      return <Methodology />;
    default:
      return <Dashboard />;
  }
}
