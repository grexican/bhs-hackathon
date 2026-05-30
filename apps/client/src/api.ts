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

// One item in the unified dashboard feed (mirrors the server's FeedItem).
export type FeedItem = {
  id: number;
  source: string;
  source_id: string;
  title: string;
  sender: string | null;
  body: string | null;
  url: string | null;
  occurred_at: string;
  is_school: 0 | 1 | null;
  category: string | null;
  summary: string | null;
  relevance: number | null;
  deadline: string | null;
  created_at: string;
};
