import { AppShell } from "./AppShell";
import { useAuth } from "./auth";
import { Login } from "./pages/Login";
import { NavProvider } from "./router";

// Top-level switch: if nobody is "logged in" (no persona picked yet) show the
// login screen; otherwise show the full app inside its navigation shell.
export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="splash">
        <span className="splash__logo">🏐</span>
        <p className="muted">Loading RotationIQ…</p>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <NavProvider>
      <AppShell />
    </NavProvider>
  );
}
