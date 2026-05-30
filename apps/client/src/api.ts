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
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path, undefined),
};

// --- Types shared with the server ---
// In a bigger app these would live in a shared package. For a hackathon it's
// fine to redeclare them here and keep them in sync by hand.

export type Role = "coach" | "player";
export type Position = "OH" | "OPP" | "MB" | "S" | "L" | "DS";
export type Level = "middle_school" | "jv" | "varsity" | "club" | "college";
export type Tier = "needs work" | "developing" | "solid" | "strong" | "elite";

export type Team = { id: number; name: string; level: string; season: string };

export type User = {
  id: number;
  team_id: number | null;
  name: string;
  role: Role;
  email: string | null;
  jersey_number: number | null;
  position: Position | null;
  level: Level | null;
  height_cm: number | null;
  grade_year: number | null;
  avatar_color: string | null;
};

export type Persona = User & { team: Team | null };

export type Game = {
  id: number;
  team_id: number;
  opponent: string;
  location: string | null;
  home_away: "home" | "away";
  scheduled_at: string;
  status: "scheduled" | "completed" | "cancelled";
  our_sets: number | null;
  opp_sets: number | null;
  result: "win" | "loss" | null;
  notes: string | null;
};

export type RawStats = {
  sets_played: number;
  serve_attempts: number;
  aces: number;
  serve_errors: number;
  reception_attempts: number;
  reception_errors: number;
  reception_rating_total: number;
  attack_attempts: number;
  kills: number;
  attack_errors: number;
  assists: number;
  ball_handling_errors: number;
  digs: number;
  solo_blocks: number;
  block_assists: number;
  block_errors: number;
};

export type MetricId =
  | "hitting_pct" | "kills_per_set" | "ace_pct" | "serve_err_pct" | "passer_rating"
  | "reception_err_pct" | "digs_per_set" | "blocks_per_set" | "assists_per_set" | "points_per_set";

export type MetricGrade = {
  id: MetricId;
  label: string;
  short: string;
  value: number | null;
  display: string;
  score: number;
  grade: string;
  tier: Tier;
  benchmark: [number, number, number, number];
  solidUpTo: Level | null;
  eliteUpTo: Level | null;
};

export type PlayerReport = {
  level: Level;
  position: Position;
  totals: RawStats;
  games: number;
  sets: number;
  overall: { score: number; grade: string; tier: Tier; playsLikeLevel: Level | null };
  metrics: MetricGrade[];
  allMetrics: MetricGrade[];
};

export type PlayerListItem = User & {
  report: {
    games: number;
    sets: number;
    overall: { score: number; grade: string; tier: Tier; playsLikeLevel: Level | null };
    headline: { id: MetricId; label: string; display: string; grade: string; tier: Tier } | null;
  };
};

export type GameLogEntry = {
  game: { id: number; opponent: string; scheduled_at: string; result: string | null; home_away: string; our_sets: number | null; opp_sets: number | null };
  line: RawStats & { id: number };
  metrics: Record<MetricId, number | null>;
};

export type PlayerProfile = { player: User; report: PlayerReport; gameLog: GameLogEntry[] };

export type BoxScoreLine = RawStats & {
  id: number;
  player: { id: number; name: string; jersey_number: number; position: Position; avatar_color: string };
  metrics: Record<MetricId, number | null>;
};

export type GameDetail = {
  game: Game;
  lines: BoxScoreLine[];
  teamTotals: RawStats;
  teamMetrics: Record<MetricId, number | null>;
};

export type GrowthPlan = {
  summary: string;
  strengths: { skill: string; detail: string }[];
  focusAreas: { skill: string; why: string; drill: string }[];
  mental: string;
  physical: string;
  nextGame: string;
  levelOutlook: string;
  generatedFrom: string;
};

export type ReflectionItem = {
  id: number;
  game: { id: number; opponent: string; scheduled_at: string; result: string | null };
  felt_rating: number;
  energy: number | null;
  confidence: number | null;
  notes: string | null;
  insights: GrowthPlan | null;
  created_at: string;
};

export type ReflectionsResponse = { reflections: ReflectionItem[]; current: { plan: GrowthPlan; reflection: unknown } };

export type Message = {
  id: number;
  kind: "announcement" | "chat";
  body: string;
  pinned: boolean;
  created_at: string;
  author: { id: number; name: string; role: Role; color: string };
};

export type MetaInfo = {
  levels: { id: Level; label: string }[];
  positions: { id: Position; label: string; primary: MetricId[] }[];
  metrics: { id: MetricId; label: string; short: string; format: string; lowerBetter: boolean; anchors: Record<Level, [number, number, number, number]> }[];
  tiers: { tier: string; min: number; note: string }[];
  anchorNote: string;
};

export type Todo = { id: number; text: string; done: 0 | 1; created_at: string };
