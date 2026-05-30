-- Tables for the demo todos feature. Add your own tables below.
-- The whole file is run on first server start. Re-run is safe (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT    NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,  -- 0 = open, 1 = done (SQLite has no native bool)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- BiciCheck: one row per physical Bicing bike. The QR a rider scans encodes `code`.
CREATE TABLE IF NOT EXISTS bikes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,            -- QR payload / sticker, e.g. "BCN-0421"
  model       TEXT    NOT NULL,                   -- "Mechanical" or "Electric"
  station     TEXT,                               -- last known dock, just for display
  status      TEXT    NOT NULL DEFAULT 'in_service', -- in_service | needs_check | out_of_service
  serviced_at TEXT,                               -- when an operator last serviced it; clears older issues
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- BiciCheck: one row per rider review of a bike.
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bike_id    INTEGER NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  rider      TEXT    NOT NULL,                    -- rider name/persona (no real auth in a hackathon)
  rating     INTEGER NOT NULL,                    -- 1..5 stars
  issues     TEXT,                                -- JSON array of problem tags e.g. ["brakes","tires"], or null if none
  comment    TEXT,                                -- optional free-text note
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
