import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

// A deliberately tiny router. A full app might use react-router, but for this
// demo a single piece of state — "which view, with which id" — keeps things
// simple and dependency-free. Any component can call go() to navigate.

export type Route =
  | "dashboard"
  | "schedule"
  | "game"
  | "record"
  | "roster"
  | "player"
  | "growth"
  | "chat"
  | "methodology";

export type NavParams = { gameId?: number; playerId?: number };

type NavValue = {
  route: Route;
  params: NavParams;
  go: (route: Route, params?: NavParams) => void;
};

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>("dashboard");
  const [params, setParams] = useState<NavParams>({});

  const value = useMemo<NavValue>(
    () => ({
      route,
      params,
      go: (next, p = {}) => {
        setRoute(next);
        setParams(p);
        window.scrollTo(0, 0);
      },
    }),
    [route, params]
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used inside <NavProvider>.");
  return ctx;
}
