import { type Request, type Response, Router } from "express";

import { classify } from "../ai/classify.js";
import { db, type FeedItem } from "../db.js";
import { SAMPLE_ITEMS } from "../sources/sampleData.js";

const router: Router = Router();

// GET /api/feed — the dashboard. Most important first, then most recent.
// School items float to the top via the is_school DESC sort.
router.get("/", (_req: Request, res: Response) => {
  const items = db
    .prepare(
      `SELECT * FROM feed_item
       ORDER BY is_school DESC, relevance DESC, deadline IS NULL, deadline ASC, occurred_at DESC`,
    )
    .all() as FeedItem[];
  res.json({ ok: true, data: items });
});

// POST /api/feed/scan — go through every (simulated) source item, let Claude
// READ each NEW one for real, and store the result. Items we've already
// classified are skipped so we never pay to read the same thing twice.
// (Swap SAMPLE_ITEMS for real source fetchers later — same shape, no other
// changes needed. See docs/poc-plan.md.)
router.post("/scan", async (_req: Request, res: Response) => {
  try {
    await scanSources(res);
  } catch (e) {
    // Surface the real reason (e.g. missing ANTHROPIC_API_KEY) so it shows up
    // in the UI instead of a silent hang.
    const message = e instanceof Error ? e.message : "Scan failed";
    res.status(500).json({ ok: false, error: { message } });
  }
});

async function scanSources(res: Response) {
  const items = SAMPLE_ITEMS;

  // Have we already classified this exact item? (dedupe before spending tokens)
  const seen = db.prepare("SELECT 1 FROM feed_item WHERE source = ? AND source_id = ?");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO feed_item
       (source, source_id, title, sender, body, url, occurred_at, is_school, category, summary, relevance, deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let added = 0;
  for (const item of items) {
    if (seen.get(item.source, item.source_id)) continue;

    const ai = await classify({ title: item.title, sender: item.sender, body: item.body });
    insert.run(
      item.source,
      item.source_id,
      item.title,
      item.sender,
      item.body,
      item.url,
      item.occurred_at,
      ai.is_school ? 1 : 0,
      ai.category,
      ai.summary,
      ai.relevance,
      ai.deadline ?? null,
    );
    added++;
  }

  res.json({ ok: true, data: { scanned: items.length, added } });
}

export { router as feedRouter };
