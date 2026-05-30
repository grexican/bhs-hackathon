// Shared helpers that turn rows in the database into graded reports and
// growth plans. Several routes need this, so it lives in one place instead of
// being copy-pasted. Everything here is read-only.

import { db, type Game, type StatLineRow, type User } from "../db.js";
import { generateGrowthPlan, type GrowthPlan, type Reflection } from "../lib/insights.js";
import {
  buildPlayerReport,
  type Level,
  type MetricId,
  computeMetrics,
  type PlayerReport,
  type Position,
  sumStats,
} from "../lib/volleyball.js";

// One played game for a player: the raw line plus the opponent/date context
// and the per-game derived metrics (used for the game log + trend charts).
export type PlayerGameLog = {
  game: Pick<Game, "id" | "opponent" | "scheduled_at" | "result" | "home_away" | "our_sets" | "opp_sets">;
  line: StatLineRow;
  metrics: Record<MetricId, number | null>;
};

// Pull every stat line a player has, oldest game first, with game context.
export function getPlayerGameLog(playerId: number): PlayerGameLog[] {
  const rows = db
    .prepare(
      `SELECT s.*, g.opponent, g.scheduled_at, g.result, g.home_away, g.our_sets, g.opp_sets
       FROM stat_lines s
       JOIN games g ON g.id = s.game_id
       WHERE s.player_id = ? AND g.status = 'completed'
       ORDER BY g.scheduled_at ASC`
    )
    .all(playerId) as (StatLineRow & {
    opponent: string;
    scheduled_at: string;
    result: Game["result"];
    home_away: Game["home_away"];
    our_sets: number | null;
    opp_sets: number | null;
  })[];

  return rows.map((row) => {
    const { opponent, scheduled_at, result, home_away, our_sets, opp_sets, ...line } = row;
    return {
      game: { id: line.game_id, opponent, scheduled_at, result, home_away, our_sets, opp_sets },
      line: line as StatLineRow,
      metrics: computeMetrics(line),
    };
  });
}

// Per-metric series across games, for trend detection in the insight engine.
export function seriesFromLog(log: PlayerGameLog[]): Partial<Record<MetricId, (number | null)[]>> {
  const series: Partial<Record<MetricId, (number | null)[]>> = {};
  for (const entry of log) {
    for (const [id, value] of Object.entries(entry.metrics) as [MetricId, number | null][]) {
      if (!series[id]) series[id] = [];
      series[id]!.push(value);
    }
  }
  return series;
}

// Build a player's full season report (totals → grades → overall rating).
export function buildReportForPlayer(player: User): PlayerReport {
  const log = getPlayerGameLog(player.id);
  const totals = sumStats(log.map((l) => l.line));
  const position = (player.position ?? "OH") as Position;
  const level = (player.level ?? "varsity") as Level;
  return buildPlayerReport(totals, position, level, log.length);
}

// The current growth plan for a player: their latest report + the most recent
// reflection they wrote. Computed live so it always reflects the real data.
export function getInsightsForPlayer(player: User): { plan: GrowthPlan; reflection: Reflection | null } {
  const log = getPlayerGameLog(player.id);
  const totals = sumStats(log.map((l) => l.line));
  const position = (player.position ?? "OH") as Position;
  const level = (player.level ?? "varsity") as Level;
  const report = buildPlayerReport(totals, position, level, log.length);

  const latest = db
    .prepare("SELECT * FROM reflections WHERE player_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(player.id) as
    | { felt_rating: number; energy: number | null; confidence: number | null; notes: string | null }
    | undefined;

  const reflection: Reflection | null = latest
    ? { felt_rating: latest.felt_rating, energy: latest.energy, confidence: latest.confidence, notes: latest.notes }
    : null;

  return { plan: generateGrowthPlan(report, seriesFromLog(log), reflection), reflection };
}
