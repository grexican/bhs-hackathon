-- Tables for the demo todos feature. Add your own tables below.
-- The whole file is run on first server start. Re-run is safe (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT    NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,  -- 0 = open, 1 = done (SQLite has no native bool)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- The unified dashboard feed. Every source (Gmail now; Classroom, YouTube,
-- Instagram later) normalizes into this one table. The AI columns
-- (is_school, category, summary, relevance) are filled by Claude on ingest.
CREATE TABLE IF NOT EXISTS feed_item (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT    NOT NULL,                    -- 'gmail' | 'classroom' | 'youtube' | ...
  source_id   TEXT    NOT NULL,                    -- stable id from the source, used to dedupe
  title       TEXT    NOT NULL,                    -- email subject, video title, etc.
  sender      TEXT,                                -- who it's from (email address / channel)
  body        TEXT,                                -- the text the AI read
  url         TEXT,                                -- link back to the original, if any
  occurred_at TEXT    NOT NULL,                    -- when it happened (ISO), for sorting
  -- AI-derived fields (filled once, on ingest):
  is_school   INTEGER,                             -- 1 = school-related, 0 = noise
  category    TEXT,                                -- 'assignment'|'event'|'announcement'|'news'|'admin'|'other'
  summary     TEXT,                                -- one-line plain-English summary
  relevance   INTEGER,                             -- 0-100: how much a student should care
  deadline    TEXT,                                -- ISO date when this is due, if any
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, source_id)                        -- never store the same item twice
);
