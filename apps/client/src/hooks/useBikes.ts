import { useCallback, useEffect, useState } from "react";

import { api, type Bike, type IssueTag, type Review } from "../api";

// What the server returns when you "scan" one bike: the bike plus its reviews.
type BikeDetail = { bike: Bike; reviews: Review[] };

// The shape a rider fills in when leaving a review.
export type NewReview = {
  rider: string;
  rating: number;
  issues: IssueTag[];
  comment: string;
};

// Everything the BiciCheck UI needs to read and change bike data, in one hook.
// Components stay dumb and just call these. Mirrors the useTodos() pattern.
export function useBikes() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [detail, setDetail] = useState<BikeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A short "Marta just flagged BCN-1187" message after a simulated ride.
  const [flash, setFlash] = useState<string | null>(null);

  // Load every bike with its stats. Called on mount and after any change.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBikes(await api.get<Bike[]>("/api/bikes"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // "Scan" a bike by its QR code — opens the detail screen for that bike.
  const openBike = useCallback(async (code: string) => {
    setError(null);
    try {
      setDetail(await api.get<BikeDetail>(`/api/bikes/${code}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  const closeBike = useCallback(() => setDetail(null), []);

  // Rider submits a review; afterwards refresh both the detail and the list so
  // the new rating + health show up everywhere.
  const addReview = useCallback(
    async (code: string, review: NewReview) => {
      setError(null);
      try {
        await api.post<Review>(`/api/bikes/${code}/reviews`, review);
        await Promise.all([openBike(code), refresh()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    },
    [openBike, refresh]
  );

  // Operator marks a bike serviced — clears its open issues.
  const serviceBike = useCallback(
    async (bike: Bike) => {
      setError(null);
      try {
        await api.post<Bike>(`/api/bikes/${bike.id}/service`, {});
        await refresh();
        if (detail?.bike.code === bike.code) await openBike(bike.code);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    },
    [detail, openBike, refresh]
  );

  // Fake a random rider scanning a random bike and leaving a review — the demo
  // button that makes the dashboards move on their own.
  const simulate = useCallback(async () => {
    setError(null);
    try {
      const result = await api.post<{ review: Review; code: string }>("/api/bikes/simulate", {});
      setFlash(`${result.review.rider} just reviewed ${result.code} (${result.review.rating}★)`);
      await refresh();
      if (detail?.bike.code === result.code) await openBike(result.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, [detail, openBike, refresh]);

  return {
    bikes,
    detail,
    loading,
    error,
    flash,
    refresh,
    openBike,
    closeBike,
    addReview,
    serviceBike,
    simulate,
  };
}
