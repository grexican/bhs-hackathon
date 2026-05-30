import { useCallback, useEffect, useState } from "react";

import { api, type FeedItem } from "../api";

// Everything the dashboard needs to show the unified feed:
// - the current list of items (already read + scored by the AI)
// - loading / scanning / error state
// - scan(): ask the server to pull the sources, let Claude read each new
//   item, then refresh the list.
export function useFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the current feed from the database (fast — no AI here).
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.get<FeedItem[]>("/api/feed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load whatever's already been scanned when the page opens.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Kick off a scan: the slow step where the AI actually reads each new item.
  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      await api.post<{ scanned: number; added: number }>("/api/feed/scan", {});
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setScanning(false);
    }
  }, [refresh]);

  return { items, loading, scanning, error, scan, refresh };
}
