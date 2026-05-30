import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database, { type Database as DatabaseType } from "better-sqlite3";

import { env } from "./env.js";
import { seedBikes } from "./seed.js";

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

// Fill in fake bikes + reviews on first boot so the app isn't empty.
seedBikes(db);

export type Todo = {
  id: number;
  text: string;
  done: 0 | 1;
  created_at: string;
};

// A physical Bicing bike. `code` is what the QR sticker encodes.
export type Bike = {
  id: number;
  code: string;
  model: string;
  station: string | null;
  status: "in_service" | "needs_check" | "out_of_service";
  serviced_at: string | null;
  created_at: string;
};

// A rider's review of a bike, exactly as stored. `issues` is a JSON array
// string (e.g. '["brakes","tires"]') or null when nothing was wrong.
export type Review = {
  id: number;
  bike_id: number;
  rider: string;
  rating: number;
  issues: string | null;
  comment: string | null;
  created_at: string;
};
