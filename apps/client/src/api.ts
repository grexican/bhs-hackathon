// One thin wrapper around fetch() that every component uses to talk to the
// Express API. Keeps URL building, JSON parsing, and error handling in one
// place so the components stay focused on UI.
//
// In dev, Vite proxies /api/* to http://localhost:3001 (see vite.config.ts).
// In production the API is mounted at /api on the same origin.

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: unknown };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Try to parse JSON whether the response succeeded or failed — the error
  // body usually carries useful context.
  const json = (await res.json().catch(() => ({}))) as ApiResponse<T>;

  if (!res.ok || !("ok" in json) || json.ok === false) {
    const message =
      "error" in json && json.error && typeof json.error === "object" && "message" in json.error
        ? String((json.error as { message?: unknown }).message ?? "")
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path, undefined),
};

// --- Types shared with the server ---
// In a bigger app these would live in a shared package. For a hackathon it's
// fine to redeclare them here and keep them in sync by hand.
export type Todo = {
  id: number;
  text: string;
  done: 0 | 1;
  created_at: string;
};

// The problem tags a rider can flag. Keep in sync with ISSUE_TAGS on the server.
export const ISSUE_TAGS = ["brakes", "tires", "seat", "chain", "gears", "battery", "other"] as const;
export type IssueTag = (typeof ISSUE_TAGS)[number];

// A bike, including the stats the server computes for us.
export type Bike = {
  id: number;
  code: string;
  model: string;
  station: string | null;
  status: "in_service" | "needs_check" | "out_of_service";
  serviced_at: string | null;
  created_at: string;
  review_count: number;
  avg_rating: number | null;
  open_issues: number;
};

export type Review = {
  id: number;
  bike_id: number;
  rider: string;
  rating: number;
  issues: IssueTag[];
  comment: string | null;
  created_at: string;
};

// Turn a bike's raw stats into a simple traffic-light verdict the UI can show.
// "bad" = avoid this bike, "good" = ride it, in between = your call.
export type Health = { label: string; tone: "good" | "warn" | "bad" | "neutral"; blurb: string };

export function bikeHealth(bike: Bike): Health {
  // review_count / avg_rating only reflect reviews SINCE the last service, so a
  // freshly-serviced bike reads as a clean slate, not a problem bike.
  if (bike.review_count === 0) {
    if (bike.serviced_at) {
      return {
        label: "Just serviced",
        tone: "neutral",
        blurb: "Recently serviced — be the first to confirm it's fixed.",
      };
    }
    return { label: "No reviews yet", tone: "neutral", blurb: "Be the first to review this bike." };
  }
  const avg = bike.avg_rating ?? 0;
  if (bike.open_issues >= 2 || avg < 2.5) {
    return { label: "Avoid", tone: "bad", blurb: "Recent riders reported problems." };
  }
  if (bike.open_issues === 1 || avg < 4) {
    return { label: "Caution", tone: "warn", blurb: "A few minor complaints lately." };
  }
  return { label: "Good to ride", tone: "good", blurb: "Riders rated this bike highly." };
}
