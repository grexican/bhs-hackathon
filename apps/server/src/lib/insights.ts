// The "growth coach" engine.
//
// The brief asked: let a player say how they felt, then use AI to distill that
// into key focus areas and a growth program (mental + physical). This engine
// does exactly that — but instead of inventing numbers, it reasons over the
// player's REAL graded stats and their own words. It blends three signals:
//
//   1. Where the player ranks vs their level (strengths + weaknesses)
//   2. Whether each skill is trending up or down across recent games
//   3. The player's own reflection (how they felt, energy, confidence, notes)
//
// The result is a structured, explainable plan — every recommendation can be
// traced back to a stat or a sentence the player wrote. (Want to swap in a
// hosted LLM later? Replace generateGrowthPlan's body with an API call and
// feed it this same evidence — the shape stays the same.)

import {
  LEVEL_LABELS,
  type MetricId,
  METRICS,
  type PlayerReport,
} from "./volleyball.js";

export type Reflection = {
  felt_rating: number;
  energy: number | null;
  confidence: number | null;
  notes: string | null;
};

export type GrowthPlan = {
  summary: string;
  strengths: { skill: string; detail: string }[];
  focusAreas: { skill: string; why: string; drill: string }[];
  mental: string;
  physical: string;
  nextGame: string;
  levelOutlook: string;
  generatedFrom: string; // what evidence fed the plan, for transparency
};

// One concrete practice drill per skill, so "work on passing" becomes
// something a 15-year-old can actually do on Monday.
const DRILLS: Record<MetricId, string> = {
  hitting_pct: "High-rep approach + swing reps focusing on hitting line/seam instead of into the block; cut down on getting stuffed.",
  kills_per_set: "Pepper-to-kill drills; finish more swings by tooling the block and tipping when the set is tight.",
  ace_pct: "Targeted serving — pick zones 1 and 5, serve 20 balls aiming deep corners each practice.",
  serve_err_pct: "Consistency serving: 10-in-a-row challenge before you're allowed to add pace. Misses cost the team points.",
  passer_rating: "Platform-angle reps off a coach toss, then live serve-receive holding your pass to a 2 or 3.",
  reception_err_pct: "Footwork-first passing: get behind the ball early so shanks turn into playable passes.",
  digs_per_set: "Reaction digging — read-and-pursue drills; stay low and finish on your platform.",
  blocks_per_set: "Block footwork + timing off the setter's hands; press over the net on the press move.",
  assists_per_set: "Setting reps to all three zones; quicken release and location to feed your hitters cleaner.",
  points_per_set: "Be a finisher — own the swings in rotation 1; convert more transition balls into points.",
};

// Helper: average of the non-null values in a numeric series.
function avg(nums: (number | null)[]): number | null {
  const real = nums.filter((n): n is number => n !== null);
  if (real.length === 0) return null;
  return real.reduce((a, b) => a + b, 0) / real.length;
}

// Compare recent games to earlier ones for one metric, to detect momentum.
export type Trend = { direction: "up" | "down" | "flat"; text: string };

export function trendFor(id: MetricId, series: (number | null)[]): Trend {
  const real = series.filter((n): n is number => n !== null);
  if (real.length < 4) return { direction: "flat", text: "not enough games yet" };
  const half = Math.max(2, Math.floor(real.length / 2));
  const early = avg(real.slice(0, real.length - half));
  const recent = avg(real.slice(real.length - half));
  if (early === null || recent === null || early === 0) return { direction: "flat", text: "steady" };
  const def = METRICS[id];
  const delta = recent - early;
  const improved = def.lowerBetter ? delta < 0 : delta > 0;
  const relative = Math.abs(delta / early);
  if (relative < 0.08) return { direction: "flat", text: "holding steady" };
  return improved
    ? { direction: "up", text: "trending up over recent games" }
    : { direction: "down", text: "slipping over recent games" };
}

// Scan the player's own words for emotional + physical cues.
function scanNotes(notes: string | null) {
  const t = (notes ?? "").toLowerCase();
  return {
    nervous: /nerv|anxious|pressure|scared|tight|choke|overthink/.test(t),
    tired: /tired|exhaust|gassed|legs|slow|cramp|sore|winded/.test(t),
    serving: /serv/.test(t),
    passing: /pass|receiv|platform|shank/.test(t),
    attacking: /hit|swing|block(ed)?|roof|stuff/.test(t),
    communication: /communic|talk|call|loud|quiet|silent/.test(t),
    positive: /good|great|confiden|strong|proud|fun|clutch/.test(t),
  };
}

// The main function. Given a graded report, per-game metric series, and an
// optional reflection, produce a plain-English growth plan.
export function generateGrowthPlan(
  report: PlayerReport,
  series: Partial<Record<MetricId, (number | null)[]>>,
  reflection: Reflection | null
): GrowthPlan {
  const primary = report.metrics.filter((m) => m.value !== null);
  const ranked = [...primary].sort((a, b) => b.score - a.score);

  const strengths = ranked
    .filter((m) => m.score >= 68)
    .slice(0, 2)
    .map((m) => {
      const tr = trendFor(m.id, series[m.id] ?? []);
      const trail = tr.direction === "up" ? ` — and ${tr.text}` : "";
      return {
        skill: m.label,
        detail: `${m.display} grades ${m.grade} (${m.tier}) for ${LEVEL_LABELS[report.level]}${trail}.`,
      };
    });

  // The two weakest primary skills become focus areas.
  const weak = [...ranked].reverse().slice(0, 2);
  const focusAreas = weak.map((m) => {
    const tr = trendFor(m.id, series[m.id] ?? []);
    const trailer = tr.direction === "down" ? ` It's ${tr.text}, so this is the priority.` : "";
    return {
      skill: m.label,
      why: `${m.display} grades ${m.grade} — ${m.tier} at ${LEVEL_LABELS[report.level]}.${trailer}`,
      drill: DRILLS[m.id],
    };
  });

  const cues = scanNotes(reflection?.notes ?? null);
  const confidence = reflection?.confidence ?? null;
  const energy = reflection?.energy ?? null;

  // Mental fitness: driven by confidence rating + emotional cues in notes.
  let mental: string;
  if (cues.nervous || (confidence !== null && confidence <= 2)) {
    mental =
      "Your head got loud under pressure. Build a 3-step pre-serve/pre-point reset (breath → target → cue word) and run it every dead ball. Confidence follows routine, not the other way around.";
  } else if (confidence !== null && confidence >= 4) {
    mental =
      "Headspace is a weapon for you right now — stay aggressive. Be the steady voice in serve-receive so teammates borrow your calm.";
  } else {
    mental =
      "Keep a short memory: one breath and a reset cue after every point, win or lose. Judge yourself on effort and next-ball focus, not the scoreboard.";
  }

  // Physical fitness: driven by energy rating + fatigue cues + serve drift.
  const serveDrift = trendFor("serve_err_pct", series.serve_err_pct ?? []).direction === "down";
  let physical: string;
  if (cues.tired || (energy !== null && energy <= 2)) {
    physical =
      "You ran low on gas. Prioritize sleep the night before games and a real warm-up; add 2 short conditioning blocks (jump rope + lateral shuffles) a week so the legs hold into set 3.";
  } else if (serveDrift) {
    physical =
      "Errors crept in late — that's often legs, not technique. A light lower-body + core circuit twice a week keeps your platform and serve steady when you're tired.";
  } else {
    physical =
      "Maintain a 2x/week strength base (squats, single-leg balance, shoulder care) plus mobility. Protect the shoulder if you swing a lot — band warm-ups before every session.";
  }

  // One concrete next-game focus: the single weakest skill, made tactical.
  const top = weak[0];
  const nextGame = top
    ? `Next game, win the ${top.label.toLowerCase()} battle: ${(DRILLS[top.id].split(";")[0] ?? "").toLowerCase()}.`
    : "Next game, pick one controllable — first-contact and effort — and own it every rally.";

  // Level outlook: the honest correlation back to level.
  const plays = report.overall.playsLikeLevel;
  const levelOutlook = plays
    ? `Across your main skills, your production holds up at the ${LEVEL_LABELS[plays]} level. Closing the gaps above would push you toward the next tier.`
    : "Your sample is still small — log a few more games and the level read will sharpen.";

  // A short narrative tying it together.
  const lead = strengths[0]
    ? `${strengths[0].skill.toLowerCase()} is carrying your game`
    : "you're building a foundation across the board";
  const fix = focusAreas[0] ? focusAreas[0].skill.toLowerCase() : "first-contact consistency";
  const summary = `Overall ${report.overall.grade} (${report.overall.tier}) for ${LEVEL_LABELS[report.level]} — ${lead}, and ${fix} is the biggest lever to pull next.`;

  const evidence = [
    `${report.games} games / ${report.sets} sets of real stats`,
    reflection ? "your post-game reflection" : "no reflection yet",
  ].join(" + ");

  return {
    summary,
    strengths,
    focusAreas,
    mental,
    physical,
    nextGame,
    levelOutlook,
    generatedFrom: evidence,
  };
}
