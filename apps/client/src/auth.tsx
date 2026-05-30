import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { api, type Persona } from "./api";

// Who am I, and how do I switch? Because this is a demo with no passwords,
// "logging in" just means picking a persona. We remember the choice in
// localStorage so a refresh keeps you signed in as the same person.

type AuthValue = {
  user: Persona | null;
  personas: Persona[];
  loading: boolean;
  login: (user: Persona) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);
const STORAGE_KEY = "vb_current_user_id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [user, setUser] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, fetch everyone you can log in as and restore the last choice.
  useEffect(() => {
    api
      .get<Persona[]>("/api/personas")
      .then((list) => {
        setPersonas(list);
        const savedId = Number(localStorage.getItem(STORAGE_KEY));
        const saved = list.find((p) => p.id === savedId);
        if (saved) setUser(saved);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((u: Persona) => {
    localStorage.setItem(STORAGE_KEY, String(u.id));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, personas, loading, login, logout }}>{children}</AuthContext.Provider>;
}

// Small helper so components can grab the current user with one call.
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}
