// Fills an empty database with a full, believable season so the app has
// something real to show the moment it boots: one team, a coach, twelve
// players, a schedule of played + upcoming games, a stat line for every
// player in every completed game, post-game reflections, and team messages.
//
// Everything is generated from a fixed random seed, so the demo is the same
// every time you reset the database — stable enough to screenshot, varied
// enough to look real. This writes to the SAME SQLite file the app uses; it's
// simulated data, not mocked API responses.

import type { Database as DatabaseType } from "better-sqlite3";

import { generateGrowthPlan } from "../lib/insights.js";
import {
  buildPlayerReport,
  EMPTY_STATS,
  type Level,
  type MetricId,
  type Position,
  type RawStats,
  sumStats,
} from "../lib/volleyball.js";

// --- A tiny seeded random number generator (mulberry32) ---
// Deterministic so the seeded season never changes between runs.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Roster = {
  name: string;
  position: Position;
  jersey: number;
  grade: number;
  height: number;
  color: string;
  ability: number; // hidden 0-1 skill level that drives their stat generation
  starter: boolean;
};

// The roster. ability spreads players across grade tiers so the analytics
// produce a realistic mix of A's through D's.
const ROSTER: Roster[] = [
  { name: "Maya Torres", position: "OH", jersey: 7, grade: 12, height: 178, color: "#e11d48", ability: 0.92, starter: true },
  { name: "Jordan Blake", position: "OPP", jersey: 11, grade: 12, height: 185, color: "#7c3aed", ability: 0.8, starter: true },
  { name: "Priya Nair", position: "S", jersey: 3, grade: 11, height: 170, color: "#0891b2", ability: 0.85, starter: true },
  { name: "Sofia Marin", position: "MB", jersey: 14, grade: 12, height: 188, color: "#16a34a", ability: 0.78, starter: true },
  { name: "Hannah Kim", position: "MB", jersey: 9, grade: 11, height: 183, color: "#ca8a04", ability: 0.62, starter: true },
  { name: "Lucia Ferrer", position: "OH", jersey: 5, grade: 10, height: 174, color: "#db2777", ability: 0.58, starter: true },
  { name: "Emma Walsh", position: "L", jersey: 1, grade: 12, height: 165, color: "#2563eb", ability: 0.83, starter: true },
  { name: "Chloe Adams", position: "OH", jersey: 8, grade: 11, height: 176, color: "#9333ea", ability: 0.55, starter: false },
  { name: "Nadia Haddad", position: "DS", jersey: 6, grade: 10, height: 168, color: "#0d9488", ability: 0.5, starter: false },
  { name: "Ava Romero", position: "S", jersey: 2, grade: 9, height: 167, color: "#0284c7", ability: 0.42, starter: false },
  { name: "Bella Costa", position: "DS", jersey: 4, grade: 9, height: 166, color: "#65a30d", ability: 0.4, starter: false },
  { name: "Grace Lin", position: "MB", jersey: 12, grade: 10, height: 181, color: "#ea580c", ability: 0.47, starter: false },
];

const OPPONENTS = [
  "Riverside Prep", "St. Mary's", "Coastal Academy", "Northgate High", "Valley Central",
  "Oakridge", "Lincoln High", "Harbor View", "Westfield", "Pine Crest",
  "Summit Charter", "Bayside", "Eastwood", "Mountain View", "Crosstown Rival", "Lakeside",
];

const r3 = (rng: () => number) => (rng() + rng() + rng()) / 3; // bell-ish 0-1
const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

// Generate one realistic stat line for a player in a game with `sets` sets.
function genStatLine(pos: Position, ability: number, sets: number, rng: () => number): RawStats {
  const s: RawStats = { ...EMPTY_STATS, sets_played: sets };
  const v = 0.7 + 0.6 * r3(rng); // per-game variance multiplier
  const a = ability;

  const isHitter = pos === "OH" || pos === "OPP" || pos === "MB";
  if (isHitter) {
    const perSet = pos === "OPP" ? 8 : pos === "OH" ? 7 : 5;
    s.attack_attempts = clampInt(perSet * sets * v * (0.6 + 0.6 * a), 0, 80);
    const killRate = Math.min(0.62, (pos === "MB" ? 0.27 : 0.2) + 0.3 * a) * (0.8 + 0.4 * r3(rng));
    const errRate = Math.max(0.04, 0.18 - 0.1 * a) * (0.8 + 0.5 * r3(rng));
    s.kills = clampInt(s.attack_attempts * killRate, 0, s.attack_attempts);
    s.attack_errors = clampInt(s.attack_attempts * errRate, 0, s.attack_attempts - s.kills);
  }

  if (pos === "S") {
    s.assists = clampInt((6 + 6 * a) * sets * v, 0, 90);
    s.ball_handling_errors = clampInt(rng() * 2, 0, 3);
  }

  // Blocking: middles and the opposite live at the net.
  if (pos === "MB" || pos === "OPP") {
    s.solo_blocks = clampInt((0.15 + 0.6 * a) * sets * (0.6 + 0.8 * r3(rng)), 0, 8);
    s.block_assists = clampInt((0.5 + 1.1 * a) * sets * (0.6 + 0.8 * r3(rng)), 0, 12);
  } else if (pos === "OH") {
    s.block_assists = clampInt((0.3 + 0.5 * a) * sets * r3(rng), 0, 6);
  }
  if (rng() < 0.25) s.block_errors = clampInt(rng() * 2, 0, 2);

  // Serving: nearly everyone serves on rotation, except many liberos.
  if (pos !== "L") {
    s.serve_attempts = clampInt((1.6 + 0.6 * a) * sets * v, 0, 30);
    const aceRate = Math.min(0.2, 0.03 + 0.1 * a) * (0.7 + 0.6 * r3(rng));
    const sErrRate = Math.max(0.03, 0.17 - 0.09 * a) * (0.8 + 0.5 * r3(rng));
    s.aces = clampInt(s.serve_attempts * aceRate, 0, s.serve_attempts);
    s.serve_errors = clampInt(s.serve_attempts * sErrRate, 0, s.serve_attempts - s.aces);
  }

  // Passing / serve-receive: liberos, DS, and outsides take most of it.
  const passes = pos === "L" ? 5 : pos === "DS" ? 4 : pos === "OH" ? 2.8 : pos === "S" ? 0.6 : 0.4;
  s.reception_attempts = clampInt(passes * sets * v, 0, 60);
  if (s.reception_attempts > 0) {
    const rating = Math.min(2.95, 1.8 + 0.95 * a) * (0.92 + 0.12 * r3(rng));
    s.reception_rating_total = clampInt(rating * s.reception_attempts, 0, s.reception_attempts * 3);
    const rErr = Math.max(0.01, 0.1 - 0.07 * a) * (0.7 + 0.6 * r3(rng));
    s.reception_errors = clampInt(s.reception_attempts * rErr, 0, Math.floor(s.reception_attempts * 0.4));
  }

  // Digs: back-row defenders rack these up.
  const digPerSet = pos === "L" ? 3.2 + 3 * a : pos === "DS" ? 2.5 + 2.5 * a : pos === "OH" ? 1.5 + 1.5 * a : pos === "S" ? 1 + 1 * a : 0.4 + 0.6 * a;
  s.digs = clampInt(digPerSet * sets * v, 0, 40);

  return s;
}

// A few human-sounding reflection notes, picked to exercise the insight engine.
const NOTES_POOL = [
  "Felt locked in early but my serve got shaky in the third when we were tired. Passing felt solid though.",
  "Nervous before the match and it showed on my first few swings — kept getting blocked. Settled down after a timeout.",
  "Legs were heavy the whole game, couldn't get my approach going. Need more sleep before games.",
  "Best I've felt all season. Confident on every swing and I was talking loud in serve receive.",
  "Frustrated with myself — too many service errors gave them easy points. Hitting was decent.",
  "Quiet game for me, didn't see many balls but stayed ready. Defense felt good.",
  "Pressure got to me at match point, overthought my serve. Want a routine to calm down.",
  "Strong passing night, platform felt steady. Tired by set 4 but pushed through.",
];

// Wipe the demo tables. Used by the /api/admin/reset endpoint.
export function clearDemoData(db: DatabaseType): void {
  for (const t of ["messages", "reflections", "stat_lines", "games", "users", "teams"]) {
    db.exec(`DELETE FROM ${t}`);
  }
}

// Seed the database if it has no team yet. Safe to call on every boot.
export function seedIfEmpty(db: DatabaseType): void {
  const teamCount = (db.prepare("SELECT COUNT(*) AS n FROM teams").get() as { n: number }).n;
  if (teamCount > 0) return;
  seedDemo(db);
}

// The actual seeding work, wrapped in a transaction so it's all-or-nothing.
export function seedDemo(db: DatabaseType): void {
  const rng = makeRng(20260530);
  const level: Level = "varsity";

  const insertTeam = db.prepare("INSERT INTO teams (name, level, season) VALUES (?, ?, ?)");
  const insertUser = db.prepare(
    `INSERT INTO users (team_id, name, role, email, jersey_number, position, level, height_cm, grade_year, avatar_color)
     VALUES (@team_id, @name, @role, @email, @jersey_number, @position, @level, @height_cm, @grade_year, @avatar_color)`
  );
  const insertGame = db.prepare(
    `INSERT INTO games (team_id, opponent, location, home_away, scheduled_at, status, our_sets, opp_sets, result, notes)
     VALUES (@team_id, @opponent, @location, @home_away, @scheduled_at, @status, @our_sets, @opp_sets, @result, @notes)`
  );
  const statCols = Object.keys(EMPTY_STATS);
  const insertStat = db.prepare(
    `INSERT INTO stat_lines (game_id, player_id, recorded_by, ${statCols.join(", ")})
     VALUES (@game_id, @player_id, @recorded_by, ${statCols.map((c) => `@${c}`).join(", ")})`
  );
  const insertReflection = db.prepare(
    `INSERT INTO reflections (game_id, player_id, felt_rating, energy, confidence, notes, insights_json)
     VALUES (@game_id, @player_id, @felt_rating, @energy, @confidence, @notes, @insights_json)`
  );
  const insertMessage = db.prepare(
    `INSERT INTO messages (team_id, author_id, kind, body, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );

  const run = db.transaction(() => {
    const teamId = Number(insertTeam.run("Barcelona High Varsity", level, "2026 Spring").lastInsertRowid);

    // Coach first, then the roster.
    const coachId = Number(
      insertUser.run({
        team_id: teamId,
        name: "Coach Rivera",
        role: "coach",
        email: "coach.rivera@bhs.edu",
        jersey_number: null,
        position: null,
        level,
        height_cm: null,
        grade_year: null,
        avatar_color: "#111827",
      }).lastInsertRowid
    );

    const playerIds: number[] = [];
    for (const p of ROSTER) {
      const id = Number(
        insertUser.run({
          team_id: teamId,
          name: p.name,
          role: "player",
          email: `${p.name.toLowerCase().split(" ")[0]}@bhs.edu`,
          jersey_number: p.jersey,
          position: p.position,
          level,
          height_cm: p.height,
          grade_year: p.grade,
          avatar_color: p.color,
        }).lastInsertRowid
      );
      playerIds.push(id);
    }
    // The injured DS keeps the book — a real "teammates record the stats" touch.
    const scorerId = playerIds[ROSTER.findIndex((p) => p.name === "Bella Costa")];

    // Build the schedule: 12 completed games behind us, 4 upcoming.
    const today = new Date();
    const totalGames = 16;
    const completedCount = 12;
    // Track each player's per-game metric series for reflection insights.
    const seriesByPlayer = new Map<number, Partial<Record<MetricId, (number | null)[]>>>();
    const linesByPlayer = new Map<number, RawStats[]>();
    playerIds.forEach((id) => {
      seriesByPlayer.set(id, {});
      linesByPlayer.set(id, []);
    });

    for (let g = 0; g < totalGames; g++) {
      // Space games ~4 days apart, centered so #12 is a few days ago.
      const dayOffset = (g - completedCount) * 4 + 2;
      const date = new Date(today.getTime() + dayOffset * 86400000);
      date.setHours(18, 0, 0, 0);
      const completed = g < completedCount;

      let our = null as number | null;
      let opp = null as number | null;
      let result = null as string | null;
      if (completed) {
        const win = rng() < 0.6;
        const loserSets = clampInt(r3(rng) * 2.6, 0, 2);
        our = win ? 3 : loserSets;
        opp = win ? loserSets : 3;
        result = win ? "win" : "loss";
      }

      const gameId = Number(
        insertGame.run({
          team_id: teamId,
          opponent: OPPONENTS[g % OPPONENTS.length],
          location: g % 2 === 0 ? "BHS Main Gym" : "Away Gym",
          home_away: g % 2 === 0 ? "home" : "away",
          scheduled_at: date.toISOString(),
          status: completed ? "completed" : "scheduled",
          our_sets: our,
          opp_sets: opp,
          result,
          notes: null,
        }).lastInsertRowid
      );

      if (!completed) continue;

      const setsTotal = (our ?? 0) + (opp ?? 0);
      ROSTER.forEach((p, i) => {
        const pid = playerIds[i]!;
        // Starters play most sets; bench players sometimes sit.
        const setsPlayed = p.starter ? clampInt(setsTotal - r3(rng), Math.max(1, setsTotal - 1), setsTotal) : clampInt(r3(rng) * setsTotal, 0, setsTotal - 1);
        if (setsPlayed <= 0) return; // didn't play this game
        const line = genStatLine(p.position, p.ability, setsPlayed, rng);
        insertStat.run({ game_id: gameId, player_id: pid, recorded_by: scorerId, ...line });

        // Record per-game metrics for trend analysis later.
        linesByPlayer.get(pid)!.push(line);
        const m = buildPlayerReport(line, p.position, level, 1).allMetrics;
        const series = seriesByPlayer.get(pid)!;
        for (const mg of m) {
          if (!series[mg.id]) series[mg.id] = [];
          series[mg.id]!.push(mg.value);
        }
      });
    }

    // Reflections: a handful of players reflect on their recent games.
    // Maya reflects often; a few others occasionally. The latest reflection
    // gets a fully-distilled growth plan attached.
    const reflectiveNames = ["Maya Torres", "Lucia Ferrer", "Jordan Blake", "Hannah Kim", "Priya Nair"];
    const completedGames = db
      .prepare("SELECT id FROM games WHERE status = 'completed' ORDER BY scheduled_at ASC")
      .all() as { id: number }[];

    for (const name of reflectiveNames) {
      const idx = ROSTER.findIndex((p) => p.name === name);
      if (idx < 0) continue;
      const p = ROSTER[idx]!;
      const pid = playerIds[idx]!;
      // Reflect on the most recent 3-4 games.
      const reflectGames = completedGames.slice(-(name === "Maya Torres" ? 5 : 3));
      reflectGames.forEach((cg, j) => {
        const isLatest = j === reflectGames.length - 1;
        const felt = clampInt(2 + p.ability * 3 + (r3(rng) - 0.5) * 2, 1, 5);
        const energy = clampInt(2 + p.ability * 2.5 + (r3(rng) - 0.5) * 2, 1, 5);
        const confidence = clampInt(2 + p.ability * 2.8 + (r3(rng) - 0.5) * 2, 1, 5);
        const notes = NOTES_POOL[Math.floor(rng() * NOTES_POOL.length)] ?? null;

        let insightsJson: string | null = null;
        if (isLatest) {
          const totals = sumStats(linesByPlayer.get(pid)!);
          const report = buildPlayerReport(totals, p.position, level, linesByPlayer.get(pid)!.length);
          const plan = generateGrowthPlan(report, seriesByPlayer.get(pid)!, {
            felt_rating: felt,
            energy,
            confidence,
            notes,
          });
          insightsJson = JSON.stringify(plan);
        }

        insertReflection.run({
          game_id: cg.id,
          player_id: pid,
          felt_rating: felt,
          energy,
          confidence,
          notes,
          insights_json: insightsJson,
        });
      });
    }

    // Team communication: a pinned coach announcement, a couple more, and
    // some player chat. created_at is staggered so the thread reads naturally.
    const maya = playerIds[ROSTER.findIndex((p) => p.name === "Maya Torres")]!;
    const emma = playerIds[ROSTER.findIndex((p) => p.name === "Emma Walsh")]!;
    const jordan = playerIds[ROSTER.findIndex((p) => p.name === "Jordan Blake")]!;
    const t = (mins: number) => new Date(today.getTime() - mins * 60000).toISOString();

    const msgs: [number, string, string, number, string][] = [
      [coachId, "announcement", "🏐 Playoffs seeding is set — we're the #3 seed! First match is next Saturday 10am at BHS Main Gym. Be there 9am for warmups.", 1, t(2880)],
      [coachId, "announcement", "Reminder: film review Thursday after practice. We'll break down our serve-receive vs Riverside. Watch your reflections before then.", 0, t(1440)],
      [maya, "chat", "Let's go!! 🔥 Who's carpooling Saturday?", 0, t(1400)],
      [emma, "chat", "I can take 3 people, leaving from the north lot at 8:30.", 0, t(1380)],
      [jordan, "chat", "Great practice today everyone. Our middle blocking looked way sharper.", 0, t(700)],
      [coachId, "chat", "Agreed. Sofia and Hannah, your timing off Priya's hands is clicking. Keep it up.", 0, t(680)],
      [maya, "chat", "Logged my reflection from the last game — the growth plan said to fix my serve consistency 😅 working on it.", 0, t(120)],
    ];
    for (const [author, kind, body, pinned, created] of msgs) {
      insertMessage.run(teamId, author, kind, body, pinned, created);
    }
  });

  run();
}
