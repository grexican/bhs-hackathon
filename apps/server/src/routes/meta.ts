import { type Request, type Response, Router } from "express";

import {
  LEVEL_LABELS,
  LEVELS,
  type MetricId,
  METRICS,
  POSITION_LABELS,
  POSITION_PRIMARY,
} from "../lib/volleyball.js";

const router: Router = Router();

// GET /api/meta — the rulebook behind the grades. The client's "How ratings
// work" page renders this so the methodology is transparent: every benchmark,
// for every level, is right here. This is what makes "good vs bad" meaningful.
router.get("/", (_req: Request, res: Response) => {
  const metrics = (Object.keys(METRICS) as MetricId[]).map((id) => ({
    id,
    label: METRICS[id].label,
    short: METRICS[id].short,
    format: METRICS[id].format,
    lowerBetter: METRICS[id].lowerBetter,
    anchors: METRICS[id].anchors, // [worst, belowAvg, good, elite] per level
  }));

  res.json({
    ok: true,
    data: {
      levels: LEVELS.map((id) => ({ id, label: LEVEL_LABELS[id] })),
      positions: Object.entries(POSITION_LABELS).map(([id, label]) => ({
        id,
        label,
        primary: POSITION_PRIMARY[id as keyof typeof POSITION_PRIMARY],
      })),
      metrics,
      tiers: [
        { tier: "elite", min: 88, note: "Top-tier for the level" },
        { tier: "strong", min: 76, note: "Clearly above average" },
        { tier: "solid", min: 60, note: "Reliable, at-level production" },
        { tier: "developing", min: 45, note: "Below the level's average" },
        { tier: "needs work", min: 0, note: "A clear focus area" },
      ],
      anchorNote: "Each metric has four benchmarks per level: worst, below-average, good, and elite. A value is scored 0-100 by where it lands between those benchmarks for the player's level.",
    },
  });
});

export { router as metaRouter };
