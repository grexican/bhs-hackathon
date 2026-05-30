import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { db, type Game, type StatLineRow } from "../db.js";
import { computeMetrics, sumStats } from "../lib/volleyball.js";

const router: Router = Router();

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const TeamQuery = z.object({ teamId: z.coerce.number().int().positive().optional() });

const CreateGame = z.object({
  team_id: z.number().int().positive(),
  opponent: z.string().min(1).max(120),
  location: z.string().max(120).optional(),
  home_away: z.enum(["home", "away"]).default("home"),
  scheduled_at: z.string().min(4), // ISO datetime from the form
});

// When a game finishes, the coach records the set score. We derive win/loss.
const UpdateGame = z.object({
  opponent: z.string().min(1).max(120).optional(),
  location: z.string().max(120).optional(),
  scheduled_at: z.string().min(4).optional(),
  status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
  our_sets: z.number().int().min(0).max(5).nullable().optional(),
  opp_sets: z.number().int().min(0).max(5).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

// GET /api/games?teamId=1 — the full calendar, soonest upcoming first then
// recent results. The client splits it into "upcoming" and "results".
router.get("/", (req: Request, res: Response) => {
  const q = TeamQuery.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ ok: false, error: q.error.flatten() });
    return;
  }
  const games = (
    q.data.teamId
      ? db.prepare("SELECT * FROM games WHERE team_id = ? ORDER BY scheduled_at ASC").all(q.data.teamId)
      : db.prepare("SELECT * FROM games ORDER BY scheduled_at ASC").all()
  ) as Game[];
  res.json({ ok: true, data: games });
});

// GET /api/games/:id — the game plus its full box score (every player's line
// with per-line metrics) and the team totals for that game.
router.get("/:id", (req: Request, res: Response) => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(params.data.id) as Game | undefined;
  if (!game) {
    res.status(404).json({ ok: false, error: { message: "Game not found." } });
    return;
  }

  const rows = db
    .prepare(
      `SELECT s.*, u.name, u.jersey_number, u.position, u.avatar_color
       FROM stat_lines s JOIN users u ON u.id = s.player_id
       WHERE s.game_id = ? ORDER BY u.jersey_number`
    )
    .all(game.id) as (StatLineRow & { name: string; jersey_number: number; position: string; avatar_color: string })[];

  const lines = rows.map((row) => {
    const { name, jersey_number, position, avatar_color, ...line } = row;
    return {
      ...line,
      player: { id: line.player_id, name, jersey_number, position, avatar_color },
      metrics: computeMetrics(line),
    };
  });

  const teamTotals = sumStats(rows);
  res.json({ ok: true, data: { game, lines, teamTotals, teamMetrics: computeMetrics(teamTotals) } });
});

// POST /api/games — schedule a new game (coach action).
router.post("/", (req: Request, res: Response) => {
  const parsed = CreateGame.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const result = db
    .prepare(
      `INSERT INTO games (team_id, opponent, location, home_away, scheduled_at, status)
       VALUES (?, ?, ?, ?, ?, 'scheduled')`
    )
    .run(d.team_id, d.opponent, d.location ?? null, d.home_away, d.scheduled_at);
  const created = db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid) as Game;
  res.status(201).json({ ok: true, data: created });
});

// PATCH /api/games/:id — edit a game or post its final result.
router.patch("/:id", (req: Request, res: Response) => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const body = UpdateGame.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ ok: false, error: body.error.flatten() });
    return;
  }

  const existing = db.prepare("SELECT * FROM games WHERE id = ?").get(params.data.id) as Game | undefined;
  if (!existing) {
    res.status(404).json({ ok: false, error: { message: "Game not found." } });
    return;
  }

  // Merge the changes, then derive win/loss whenever both set scores are set.
  const merged = { ...existing, ...body.data };
  let result = merged.result;
  if (merged.our_sets != null && merged.opp_sets != null) {
    result = merged.our_sets > merged.opp_sets ? "win" : merged.our_sets < merged.opp_sets ? "loss" : null;
  }

  db.prepare(
    `UPDATE games SET opponent=?, location=?, scheduled_at=?, status=?, our_sets=?, opp_sets=?, result=?, notes=? WHERE id=?`
  ).run(
    merged.opponent,
    merged.location ?? null,
    merged.scheduled_at,
    merged.status,
    merged.our_sets ?? null,
    merged.opp_sets ?? null,
    result,
    merged.notes ?? null,
    params.data.id
  );

  const updated = db.prepare("SELECT * FROM games WHERE id = ?").get(params.data.id) as Game;
  res.json({ ok: true, data: updated });
});

export { router as gamesRouter };
