import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database, { type Database as DatabaseType } from "better-sqlite3";

import { seedIfEmpty } from "./db/seed.js";
import { env } from "./env.js";

// Resolve the schema.sql path relative to THIS file so it works whether
// the server is running via tsx (src/) or compiled JS (dist/).
const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../db/schema.sql");

// Open (or create) the SQLite database. better-sqlite3 is synchronous —
// every db.prepare(...).run/get/all() returns immediately, no await.
export const db: DatabaseType = new Database(env.DATABASE_FILE);

// Recommended pragmas for a tiny single-process app like this one.
// WAL mode lets reads happen while writes are in flight.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Apply the schema on startup. CREATE TABLE IF NOT EXISTS makes this
// idempotent — running it on every boot is fine and won't drop data.
const schema = readFileSync(schemaPath, "utf8");
db.exec(schema);

// Fill an empty database with the demo season the first time the server runs.
// Skipped under tests (VITEST) so test files control their own data.
if (!process.env.VITEST) {
  seedIfEmpty(db);
}

export type Todo = {
  id: number;
  text: string;
  done: 0 | 1;
  created_at: string;
};

// --- Row shapes for the volleyball tables (mirror schema.sql) ---

export type Team = {
  id: number;
  name: string;
  level: string;
  season: string;
  created_at: string;
};

export type User = {
  id: number;
  team_id: number | null;
  name: string;
  role: "coach" | "player";
  email: string | null;
  jersey_number: number | null;
  position: string | null;
  level: string | null;
  height_cm: number | null;
  grade_year: number | null;
  avatar_color: string | null;
  created_at: string;
};

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
  created_at: string;
};

export type StatLineRow = {
  id: number;
  game_id: number;
  player_id: number;
  recorded_by: number | null;
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
  created_at: string;
};

export type ReflectionRow = {
  id: number;
  game_id: number;
  player_id: number;
  felt_rating: number;
  energy: number | null;
  confidence: number | null;
  notes: string | null;
  insights_json: string | null;
  created_at: string;
};

export type MessageRow = {
  id: number;
  team_id: number;
  author_id: number;
  kind: "announcement" | "chat";
  body: string;
  pinned: 0 | 1;
  created_at: string;
};
