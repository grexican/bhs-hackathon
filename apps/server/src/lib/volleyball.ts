// The volleyball "brain" of the app.
//
// This single file answers the hard questions from the project brief:
//   - What stats matter, and how do we compute them from raw counts?
//   - What is "good" vs "bad" — and good *for whom*?  A .200 hitting
//     percentage is strong for a high-school varsity player and weak for a
//     college player. So every grade is judged against the player's LEVEL.
//   - How do we turn a pile of stat lines into a rating, a letter grade, and
//     a plain-English growth plan?
//
// Nothing here touches the database. It's pure functions: raw stat lines in,
// grades and insights out. That makes it easy to test and reason about.

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type Level = "middle_school" | "jv" | "varsity" | "club" | "college";
export type Position = "OH" | "OPP" | "MB" | "S" | "L" | "DS";

export const LEVELS: Level[] = ["middle_school", "jv", "varsity", "club", "college"];

export const LEVEL_LABELS: Record<Level, string> = {
  middle_school: "Middle School",
  jv: "JV",
  varsity: "Varsity",
  club: "Club / Travel",
  college: "College",
};

export const POSITION_LABELS: Record<Position, string> = {
  OH: "Outside Hitter",
  OPP: "Opposite",
  MB: "Middle Blocker",
  S: "Setter",
  L: "Libero",
  DS: "Defensive Specialist",
};

// The raw numbers a scorer records for one player in one game.
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

export const EMPTY_STATS: RawStats = {
  sets_played: 0,
  serve_attempts: 0,
  aces: 0,
  serve_errors: 0,
  reception_attempts: 0,
  reception_errors: 0,
  reception_rating_total: 0,
  attack_attempts: 0,
  kills: 0,
  attack_errors: 0,
  assists: 0,
  ball_handling_errors: 0,
  digs: 0,
  solo_blocks: 0,
  block_assists: 0,
  block_errors: 0,
};

// ----------------------------------------------------------------------------
// Aggregation + derived metrics
// ----------------------------------------------------------------------------

// Add up many stat lines into one total (e.g. a whole season for a player).
export function sumStats(lines: RawStats[]): RawStats {
  return lines.reduce<RawStats>((acc, l) => {
    const out = { ...acc };
    for (const k of Object.keys(EMPTY_STATS) as (keyof RawStats)[]) {
      out[k] = acc[k] + (l[k] ?? 0);
    }
    return out;
  }, { ...EMPTY_STATS });
}

// A metric is a single number we judge, like "hitting percentage".
// We never store these — they're always computed from raw counts so they
// can't drift out of sync. Returns null when there isn't enough data.
export type MetricId =
  | "hitting_pct"
  | "kills_per_set"
  | "ace_pct"
  | "serve_err_pct"
  | "passer_rating"
  | "reception_err_pct"
  | "digs_per_set"
  | "blocks_per_set"
  | "assists_per_set"
  | "points_per_set";

function div(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

// Turn raw counts into the metrics we actually grade.
export function computeMetrics(s: RawStats): Record<MetricId, number | null> {
  const sets = s.sets_played;
  return {
    // Attack efficiency: the single most-cited volleyball stat.
    hitting_pct: div(s.kills - s.attack_errors, s.attack_attempts),
    kills_per_set: div(s.kills, sets),
    ace_pct: div(s.aces, s.serve_attempts),
    serve_err_pct: div(s.serve_errors, s.serve_attempts),
    // Average pass quality on a 0-3 scale (3 = perfect pass).
    passer_rating: div(s.reception_rating_total, s.reception_attempts),
    reception_err_pct: div(s.reception_errors, s.reception_attempts),
    digs_per_set: div(s.digs, sets),
    // A block assist counts as half a block, the standard convention.
    blocks_per_set: div(s.solo_blocks + 0.5 * s.block_assists, sets),
    assists_per_set: div(s.assists, sets),
    // Scoring contribution per set: kills + aces + block credit.
    points_per_set: div(s.kills + s.aces + s.solo_blocks + 0.5 * s.block_assists, sets),
  };
}

// ----------------------------------------------------------------------------
// Benchmarks — the part that makes a grade mean something
// ----------------------------------------------------------------------------

// For each metric we store four anchor values per level, ordered worst → best.
// A higher hitting % is better; a lower serve-error % is better, so each
// metric also says which direction "good" points.
type MetricDef = {
  label: string;
  short: string;
  // How to display the value: percentage, a 0-3 rating, or a per-set rate.
  format: "pct" | "rating" | "rate";
  lowerBetter: boolean;
  // [worst, belowAverage, good, elite] for each level.
  anchors: Record<Level, [number, number, number, number]>;
};

export const METRICS: Record<MetricId, MetricDef> = {
  hitting_pct: {
    label: "Hitting %",
    short: "Attack efficiency (kills − errors) ÷ attempts",
    format: "pct",
    lowerBetter: false,
    anchors: {
      middle_school: [0.0, 0.08, 0.15, 0.23],
      jv: [0.03, 0.12, 0.19, 0.27],
      varsity: [0.08, 0.16, 0.24, 0.32],
      club: [0.12, 0.2, 0.28, 0.36],
      college: [0.15, 0.23, 0.31, 0.4],
    },
  },
  kills_per_set: {
    label: "Kills / set",
    short: "Terminated attacks per set played",
    format: "rate",
    lowerBetter: false,
    anchors: {
      middle_school: [0.3, 1.0, 1.8, 2.8],
      jv: [0.5, 1.3, 2.2, 3.2],
      varsity: [0.7, 1.6, 2.6, 3.8],
      club: [0.9, 1.9, 2.9, 4.2],
      college: [1.0, 2.2, 3.2, 4.6],
    },
  },
  ace_pct: {
    label: "Ace %",
    short: "Aces ÷ serve attempts",
    format: "pct",
    lowerBetter: false,
    anchors: {
      middle_school: [0.0, 0.04, 0.08, 0.14],
      jv: [0.01, 0.05, 0.09, 0.15],
      varsity: [0.02, 0.06, 0.1, 0.16],
      club: [0.02, 0.06, 0.1, 0.16],
      college: [0.03, 0.07, 0.11, 0.17],
    },
  },
  serve_err_pct: {
    label: "Serve error %",
    short: "Service errors ÷ serve attempts (lower is better)",
    format: "pct",
    lowerBetter: true,
    anchors: {
      middle_school: [0.3, 0.2, 0.12, 0.06],
      jv: [0.28, 0.18, 0.1, 0.05],
      varsity: [0.25, 0.15, 0.09, 0.05],
      club: [0.22, 0.13, 0.08, 0.04],
      college: [0.2, 0.12, 0.07, 0.04],
    },
  },
  passer_rating: {
    label: "Passer rating",
    short: "Average serve-receive quality (0-3 scale)",
    format: "rating",
    lowerBetter: false,
    anchors: {
      middle_school: [1.4, 1.8, 2.1, 2.5],
      jv: [1.6, 2.0, 2.3, 2.6],
      varsity: [1.7, 2.1, 2.4, 2.7],
      club: [1.8, 2.2, 2.45, 2.75],
      college: [1.9, 2.25, 2.5, 2.8],
    },
  },
  reception_err_pct: {
    label: "Reception error %",
    short: "Passing errors ÷ attempts (lower is better)",
    format: "pct",
    lowerBetter: true,
    anchors: {
      middle_school: [0.2, 0.13, 0.08, 0.04],
      jv: [0.18, 0.11, 0.06, 0.03],
      varsity: [0.15, 0.09, 0.05, 0.02],
      club: [0.13, 0.08, 0.04, 0.02],
      college: [0.12, 0.07, 0.04, 0.015],
    },
  },
  digs_per_set: {
    label: "Digs / set",
    short: "Defensive digs per set played",
    format: "rate",
    lowerBetter: false,
    anchors: {
      middle_school: [0.5, 1.5, 2.5, 4.0],
      jv: [0.8, 1.8, 3.0, 4.5],
      varsity: [1.0, 2.2, 3.5, 5.5],
      club: [1.2, 2.5, 4.0, 6.0],
      college: [1.5, 2.8, 4.2, 6.5],
    },
  },
  blocks_per_set: {
    label: "Blocks / set",
    short: "Solo + half-credit assist blocks per set",
    format: "rate",
    lowerBetter: false,
    anchors: {
      middle_school: [0.1, 0.4, 0.8, 1.4],
      jv: [0.15, 0.5, 0.9, 1.5],
      varsity: [0.2, 0.6, 1.0, 1.7],
      club: [0.25, 0.7, 1.1, 1.8],
      college: [0.3, 0.8, 1.2, 2.0],
    },
  },
  assists_per_set: {
    label: "Assists / set",
    short: "Setting assists per set (the setter's core stat)",
    format: "rate",
    lowerBetter: false,
    anchors: {
      middle_school: [2, 5, 8, 11],
      jv: [3, 6, 9, 12],
      varsity: [4, 7, 10, 13],
      club: [4.5, 7.5, 10.5, 13.5],
      college: [5, 8, 11, 14],
    },
  },
  points_per_set: {
    label: "Points / set",
    short: "Total scoring contribution per set",
    format: "rate",
    lowerBetter: false,
    anchors: {
      middle_school: [0.5, 1.5, 2.5, 4.0],
      jv: [0.7, 1.8, 3.0, 4.5],
      varsity: [0.9, 2.1, 3.4, 5.0],
      club: [1.1, 2.4, 3.8, 5.5],
      college: [1.3, 2.6, 4.0, 6.0],
    },
  },
};

export type Tier = "needs work" | "developing" | "solid" | "strong" | "elite";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Convert a metric value into a 0-100 score by interpolating between the
// four benchmark anchors for that level. The anchors map to scores
// 40 / 60 / 78 / 92; we extrapolate (clamped) beyond the ends.
function scoreFromAnchors(value: number, anchors: [number, number, number, number], lowerBetter: boolean): number {
  const ys: [number, number, number, number] = [40, 60, 78, 92];
  const dir = lowerBetter ? -1 : 1;
  const v = value * dir;
  const [a0, a1, a2, a3] = anchors;
  const ax: [number, number, number, number] = [a0 * dir, a1 * dir, a2 * dir, a3 * dir]; // ascending worst → best
  if (v <= ax[0]) {
    const span = ax[1] - ax[0] || 1;
    return clamp(40 + ((v - ax[0]) / span) * (60 - 40), 5, 100);
  }
  for (let i = 0; i < 3; i++) {
    const lo = ax[i] ?? 0;
    const hi = ax[i + 1] ?? 0;
    if (v <= hi) {
      const t = (v - lo) / (hi - lo || 1);
      return clamp((ys[i] ?? 0) + t * ((ys[i + 1] ?? 0) - (ys[i] ?? 0)), 5, 100);
    }
  }
  const span = ax[3] - ax[2] || 1;
  return clamp(92 + ((v - ax[3]) / span) * (100 - 92), 5, 100);
}

export function tierFromScore(score: number): Tier {
  if (score >= 88) return "elite";
  if (score >= 76) return "strong";
  if (score >= 60) return "solid";
  if (score >= 45) return "developing";
  return "needs work";
}

export function gradeFromScore(score: number): string {
  if (score >= 93) return "A";
  if (score >= 85) return "A-";
  if (score >= 78) return "B+";
  if (score >= 70) return "B";
  if (score >= 62) return "C+";
  if (score >= 54) return "C";
  if (score >= 46) return "D";
  return "F";
}

// Format a metric value for display the way coaches expect to see it.
export function formatMetric(id: MetricId, value: number | null): string {
  if (value === null) return "—";
  const def = METRICS[id];
  if (def.format === "pct") return value.toFixed(3).replace(/^0/, "");
  if (def.format === "rating") return value.toFixed(2);
  return value.toFixed(1);
}

export type MetricGrade = {
  id: MetricId;
  label: string;
  short: string;
  value: number | null;
  display: string;
  score: number; // 0-100 relative to the player's level
  grade: string; // letter
  tier: Tier;
  benchmark: [number, number, number, number]; // anchors at the player's level
  // The honest "level correlation": at what level would this value still be
  // solid, and at what level would it be elite?
  solidUpTo: Level | null;
  eliteUpTo: Level | null;
};

// Grade one metric for a player at their level, and work out which levels
// the value would map to. This is the literal answer to "how do you correlate
// a stat back to level?": we re-score the same number against every level's
// benchmark and report where it lands.
export function gradeMetric(id: MetricId, value: number | null, level: Level): MetricGrade {
  const def = METRICS[id];
  const benchmark = def.anchors[level];
  const score = value === null ? 0 : Math.round(scoreFromAnchors(value, benchmark, def.lowerBetter));

  let solidUpTo: Level | null = null;
  let eliteUpTo: Level | null = null;
  if (value !== null) {
    for (const lv of LEVELS) {
      const s = scoreFromAnchors(value, def.anchors[lv], def.lowerBetter);
      if (s >= 60) solidUpTo = lv;
      if (s >= 88) eliteUpTo = lv;
    }
  }

  return {
    id,
    label: def.label,
    short: def.short,
    value,
    display: formatMetric(id, value),
    score,
    grade: gradeFromScore(score),
    tier: tierFromScore(score),
    benchmark,
    solidUpTo,
    eliteUpTo,
  };
}

// ----------------------------------------------------------------------------
// Position-aware overall rating
// ----------------------------------------------------------------------------

// Which metrics matter for each position, and how much. A libero is never
// judged on hitting; a setter is judged mostly on assists. Weights are
// renormalized over whichever metrics actually have data.
const POSITION_WEIGHTS: Record<Position, Partial<Record<MetricId, number>>> = {
  OH: { hitting_pct: 0.25, kills_per_set: 0.25, passer_rating: 0.2, digs_per_set: 0.15, serve_err_pct: 0.15 },
  OPP: { hitting_pct: 0.35, kills_per_set: 0.3, blocks_per_set: 0.2, points_per_set: 0.15 },
  MB: { hitting_pct: 0.3, blocks_per_set: 0.35, kills_per_set: 0.2, serve_err_pct: 0.15 },
  S: { assists_per_set: 0.4, ace_pct: 0.15, digs_per_set: 0.2, blocks_per_set: 0.1, serve_err_pct: 0.15 },
  L: { passer_rating: 0.45, digs_per_set: 0.4, reception_err_pct: 0.15 },
  DS: { passer_rating: 0.35, digs_per_set: 0.35, ace_pct: 0.15, serve_err_pct: 0.15 },
};

// The metrics a coach most wants to see for each position, in display order.
export const POSITION_PRIMARY: Record<Position, MetricId[]> = {
  OH: ["kills_per_set", "hitting_pct", "passer_rating", "digs_per_set", "serve_err_pct", "ace_pct"],
  OPP: ["kills_per_set", "hitting_pct", "blocks_per_set", "points_per_set", "serve_err_pct"],
  MB: ["blocks_per_set", "hitting_pct", "kills_per_set", "serve_err_pct"],
  S: ["assists_per_set", "ace_pct", "digs_per_set", "blocks_per_set", "serve_err_pct"],
  L: ["passer_rating", "digs_per_set", "reception_err_pct"],
  DS: ["passer_rating", "digs_per_set", "ace_pct", "serve_err_pct"],
};

export type PlayerReport = {
  level: Level;
  position: Position;
  totals: RawStats;
  games: number;
  sets: number;
  overall: {
    score: number; // 0-100, the "VolleyIQ rating"
    grade: string;
    tier: Tier;
    // The standout level correlation across the player's primary skills.
    playsLikeLevel: Level | null;
  };
  metrics: MetricGrade[]; // primary metrics for the position, in order
  allMetrics: MetricGrade[]; // every metric, for the deep-dive view
};

// Build the full report for a player from their summed season stats.
export function buildPlayerReport(totals: RawStats, position: Position, level: Level, games: number): PlayerReport {
  const values = computeMetrics(totals);
  const allMetrics = (Object.keys(METRICS) as MetricId[]).map((id) => gradeMetric(id, values[id], level));
  const byId = new Map(allMetrics.map((m) => [m.id, m]));

  const primary = POSITION_PRIMARY[position].map((id) => byId.get(id)!).filter(Boolean);

  // Weighted overall score over primary metrics that have data.
  const weights = POSITION_WEIGHTS[position];
  let weightSum = 0;
  let scoreSum = 0;
  for (const [id, w] of Object.entries(weights) as [MetricId, number][]) {
    const m = byId.get(id);
    if (m && m.value !== null) {
      weightSum += w;
      scoreSum += w * m.score;
    }
  }
  const overallScore = weightSum > 0 ? Math.round(scoreSum / weightSum) : 0;

  // "Plays like" level: the highest level at which the player's primary
  // skills are, on balance, still solid — a single honest summary of where
  // this player's production would hold up.
  let playsLikeLevel: Level | null = null;
  for (const lv of LEVELS) {
    let sum = 0;
    let total = 0;
    for (const id of POSITION_PRIMARY[position]) {
      const m = byId.get(id);
      if (m && m.value !== null) {
        total++;
        sum += scoreFromAnchors(m.value, METRICS[id].anchors[lv], METRICS[id].lowerBetter);
      }
    }
    // The highest level where the player's primary skills average out to
    // "solid" (60+) is an honest one-word answer to "what level is this?"
    if (total > 0 && sum / total >= 60) playsLikeLevel = lv;
  }

  return {
    level,
    position,
    totals,
    games,
    sets: totals.sets_played,
    overall: {
      score: overallScore,
      grade: gradeFromScore(overallScore),
      tier: tierFromScore(overallScore),
      playsLikeLevel,
    },
    metrics: primary,
    allMetrics,
  };
}
