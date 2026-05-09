-- Tables for the demo todos feature. Add your own tables below.
-- The whole file is run on first server start. Re-run is safe (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT    NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,  -- 0 = open, 1 = done (SQLite has no native bool)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Add your own tables here. Example:
-- CREATE TABLE IF NOT EXISTS flashcards (
--   id         INTEGER PRIMARY KEY AUTOINCREMENT,
--   question   TEXT    NOT NULL,
--   answer     TEXT    NOT NULL,
--   created_at TEXT    NOT NULL DEFAULT (datetime('now'))
-- );
