import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { db, type StatLineRow } from "../db.js";
import { computeMetrics } from "../lib/volleyball.js";

// mergeParams lets this router read :gameId from the parent mount path.
const router: Router = Router({ mergeParams: true });

const Params = z.object({
  gameId: z.coerce.number().int().positive(),
  playerId: z.coerce.number().int().positive(),
});

// Every counting stat the scorer can enter. All optional and default to 0 so
// a half-finished line still saves — the scorer fills in what they tracked.
const count = z.number().int().min(0).max(200);
const StatBody = z.object({
  recorded_by: z.number().int().positive().nullable().optional(),
  sets_played: z.number().int().min(0).max(5),
  serve_attempts: count.default(0),
  aces: count.default(0),
  serve_errors: count.default(0),
  reception_attempts: count.default(0),
  reception_errors: count.default(0),
  reception_rating_total: z.number().int().min(0).max(600).default(0),
  attack_attempts: count.default(0),
  kills: count.default(0),
  attack_errors: count.default(0),
  assists: count.default(0),
  ball_handling_errors: count.default(0),
  digs: count.default(0),
  solo_blocks: count.default(0),
  block_assists: count.default(0),
  block_errors: count.default(0),
});

const COLS = [
  "sets_played", "serve_attempts", "aces", "serve_errors", "reception_attempts", "reception_errors",
  "reception_rating_total", "attack_attempts", "kills", "attack_errors", "assists", "ball_handling_errors",
  "digs", "solo_blocks", "block_assists", "block_errors",
] as const;

// PUT /api/games/:gameId/stats/:playerId — record (or overwrite) a player's
// stat line for a game. This is the screen a teammate uses to keep the book.
// Upsert so re-saving the same player just updates their line.
router.put("/:playerId", (req: Request, res: Response) => {
  const params = Params.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const body = StatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ ok: false, error: body.error.flatten() });
    return;
  }

  const game = db.prepare("SELECT id FROM games WHERE id = ?").get(params.data.gameId);
  if (!game) {
    res.status(404).json({ ok: false, error: { message: "Game not found." } });
    return;
  }

  const d = body.data;
  const values = COLS.map((c) => d[c]);
  db.prepare(
    `INSERT INTO stat_lines (game_id, player_id, recorded_by, ${COLS.join(", ")})
     VALUES (?, ?, ?, ${COLS.map(() => "?").join(", ")})
     ON CONFLICT(game_id, player_id) DO UPDATE SET
       recorded_by = excluded.recorded_by,
       ${COLS.map((c) => `${c} = excluded.${c}`).join(", ")}`
  ).run(params.data.gameId, params.data.playerId, d.recorded_by ?? null, ...values);

  const saved = db
    .prepare("SELECT * FROM stat_lines WHERE game_id = ? AND player_id = ?")
    .get(params.data.gameId, params.data.playerId) as StatLineRow;

  res.json({ ok: true, data: { ...saved, metrics: computeMetrics(saved) } });
});

export { router as statsRouter };
