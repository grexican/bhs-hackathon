import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { db, type ReflectionRow, type User } from "../db.js";
import { getInsightsForPlayer } from "../services/playerStats.js";

// Mounted at /api/players/:playerId so it can read the player from the URL.
const router: Router = Router({ mergeParams: true });

const PlayerParam = z.object({ playerId: z.coerce.number().int().positive() });

const CreateReflection = z.object({
  game_id: z.number().int().positive(),
  felt_rating: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  confidence: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

function getPlayer(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ? AND role = 'player'").get(id) as User | undefined;
}

// GET /api/players/:playerId/insights — the current growth plan, computed live
// from the player's real stats + most recent reflection. The Growth page can
// show this even before the player writes a new reflection.
router.get("/insights", (req: Request, res: Response) => {
  const params = PlayerParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const player = getPlayer(params.data.playerId);
  if (!player) {
    res.status(404).json({ ok: false, error: { message: "Player not found." } });
    return;
  }
  res.json({ ok: true, data: getInsightsForPlayer(player) });
});

// GET /api/players/:playerId/reflections — the player's reflection history
// (with the game it was about), plus the freshly computed current plan.
router.get("/reflections", (req: Request, res: Response) => {
  const params = PlayerParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const player = getPlayer(params.data.playerId);
  if (!player) {
    res.status(404).json({ ok: false, error: { message: "Player not found." } });
    return;
  }

  const rows = db
    .prepare(
      `SELECT r.*, g.opponent, g.scheduled_at, g.result
       FROM reflections r JOIN games g ON g.id = r.game_id
       WHERE r.player_id = ? ORDER BY g.scheduled_at DESC`
    )
    .all(player.id) as (ReflectionRow & { opponent: string; scheduled_at: string; result: string | null })[];

  const reflections = rows.map((r) => ({
    id: r.id,
    game: { id: r.game_id, opponent: r.opponent, scheduled_at: r.scheduled_at, result: r.result },
    felt_rating: r.felt_rating,
    energy: r.energy,
    confidence: r.confidence,
    notes: r.notes,
    insights: r.insights_json ? JSON.parse(r.insights_json) : null,
    created_at: r.created_at,
  }));

  res.json({ ok: true, data: { reflections, current: getInsightsForPlayer(player) } });
});

// POST /api/players/:playerId/reflections — the player logs how a game felt.
// We immediately distill a growth plan from their stats + words and store it.
router.post("/reflections", (req: Request, res: Response) => {
  const params = PlayerParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const body = CreateReflection.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ ok: false, error: body.error.flatten() });
    return;
  }
  const player = getPlayer(params.data.playerId);
  if (!player) {
    res.status(404).json({ ok: false, error: { message: "Player not found." } });
    return;
  }

  const d = body.data;
  // Upsert: a player gets one reflection per game; saving again updates it.
  db.prepare(
    `INSERT INTO reflections (game_id, player_id, felt_rating, energy, confidence, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(game_id, player_id) DO UPDATE SET
       felt_rating = excluded.felt_rating, energy = excluded.energy,
       confidence = excluded.confidence, notes = excluded.notes`
  ).run(d.game_id, player.id, d.felt_rating, d.energy ?? null, d.confidence ?? null, d.notes ?? null);

  // Generate the plan now that this reflection is the latest, then cache it.
  const { plan, reflection } = getInsightsForPlayer(player);
  db.prepare("UPDATE reflections SET insights_json = ? WHERE game_id = ? AND player_id = ?").run(
    JSON.stringify(plan),
    d.game_id,
    player.id
  );

  res.status(201).json({ ok: true, data: { plan, reflection } });
});

export { router as reflectionsRouter };
