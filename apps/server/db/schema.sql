-- Volleyball stats tracker — database schema.
-- The whole file runs on every server start. Every CREATE uses IF NOT EXISTS,
-- so re-running it is safe and never drops your data.

-- The original starter demo table. Left in place so the starter still works.
CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT    NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- A team plays a season. Everything else hangs off a team.
CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  level       TEXT    NOT NULL,                       -- middle_school | jv | varsity | club | college
  season      TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Coaches and players both live here. role decides what they can do.
-- No passwords — this is a demo. You "log in" by picking your name.
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id        INTEGER REFERENCES teams(id),
  name           TEXT    NOT NULL,
  role           TEXT    NOT NULL,                    -- coach | player
  email          TEXT,
  jersey_number  INTEGER,
  position       TEXT,                                -- OH | OPP | MB | S | L | DS
  level          TEXT,                                -- the player's own level, used for benchmarking
  height_cm      INTEGER,
  grade_year     INTEGER,                             -- 9..12
  avatar_color   TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Every game on the calendar. status flips to 'completed' once it's played.
CREATE TABLE IF NOT EXISTS games (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  opponent      TEXT    NOT NULL,
  location      TEXT,
  home_away     TEXT    NOT NULL DEFAULT 'home',      -- home | away
  scheduled_at  TEXT    NOT NULL,                     -- ISO datetime
  status        TEXT    NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled
  our_sets      INTEGER,
  opp_sets      INTEGER,
  result        TEXT,                                 -- win | loss | null
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One stat line per player per game. A teammate (the "scorer") records it.
-- We store raw counting stats; percentages and per-set rates are computed
-- in the analytics engine, never stored, so they're always consistent.
CREATE TABLE IF NOT EXISTS stat_lines (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id                INTEGER NOT NULL REFERENCES games(id),
  player_id              INTEGER NOT NULL REFERENCES users(id),
  recorded_by            INTEGER REFERENCES users(id),
  sets_played            INTEGER NOT NULL DEFAULT 0,
  -- Serving
  serve_attempts         INTEGER NOT NULL DEFAULT 0,
  aces                   INTEGER NOT NULL DEFAULT 0,
  serve_errors           INTEGER NOT NULL DEFAULT 0,
  -- Passing / serve-receive (each pass is graded 0-3; store the running total)
  reception_attempts     INTEGER NOT NULL DEFAULT 0,
  reception_errors       INTEGER NOT NULL DEFAULT 0,
  reception_rating_total INTEGER NOT NULL DEFAULT 0,
  -- Attacking
  attack_attempts        INTEGER NOT NULL DEFAULT 0,
  kills                  INTEGER NOT NULL DEFAULT 0,
  attack_errors          INTEGER NOT NULL DEFAULT 0,
  -- Setting
  assists                INTEGER NOT NULL DEFAULT 0,
  ball_handling_errors   INTEGER NOT NULL DEFAULT 0,
  -- Defense
  digs                   INTEGER NOT NULL DEFAULT 0,
  solo_blocks            INTEGER NOT NULL DEFAULT 0,
  block_assists          INTEGER NOT NULL DEFAULT 0,
  block_errors           INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game_id, player_id)
);

-- A player's own after-game reflection plus the growth plan the insight
-- engine distills from it. insights_json holds the structured plan.
CREATE TABLE IF NOT EXISTS reflections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id       INTEGER NOT NULL REFERENCES games(id),
  player_id     INTEGER NOT NULL REFERENCES users(id),
  felt_rating   INTEGER NOT NULL,                     -- 1-5, how the game felt overall
  energy        INTEGER,                              -- 1-5, physical readiness
  confidence    INTEGER,                              -- 1-5, mental/headspace
  notes         TEXT,                                 -- free-text, in the player's words
  insights_json TEXT,                                 -- distilled growth plan (JSON)
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game_id, player_id)
);

-- Team communication. kind='announcement' is a coach broadcast (pinnable);
-- kind='chat' is the open team thread anyone can post to.
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  author_id   INTEGER NOT NULL REFERENCES users(id),
  kind        TEXT    NOT NULL DEFAULT 'chat',        -- announcement | chat
  body        TEXT    NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Helpful indexes for the queries the app makes most.
CREATE INDEX IF NOT EXISTS idx_games_team    ON games(team_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_stats_game    ON stat_lines(game_id);
CREATE INDEX IF NOT EXISTS idx_stats_player  ON stat_lines(player_id);
CREATE INDEX IF NOT EXISTS idx_messages_team ON messages(team_id, created_at);
