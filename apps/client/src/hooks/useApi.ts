import { useCallback, useEffect, useState } from "react";

import { api } from "../api";

// Generic "fetch this GET endpoint and give me {data, loading, error, reload}".
// Pass null as the path to skip fetching (e.g. while we don't know the id yet).
// Every page that just reads data uses this instead of repeating useEffect.
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (path === null) return;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
