import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { db, type User } from "../db.js";
import { buildReportForPlayer, getPlayerGameLog } from "../services/playerStats.js";

const router: Router = Router();

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const TeamQuery = z.object({ teamId: z.coerce.number().int().positive().optional() });

// GET /api/players?teamId=1 — the roster with each player's overall rating
// and headline stat. Powers the leaderboard and the coach dashboard.
router.get("/", (req: Request, res: Response) => {
  const q = TeamQuery.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ ok: false, error: q.error.flatten() });
    return;
  }

  const players = (
    q.data.teamId
      ? db.prepare("SELECT * FROM users WHERE role = 'player' AND team_id = ? ORDER BY jersey_number").all(q.data.teamId)
      : db.prepare("SELECT * FROM users WHERE role = 'player' ORDER BY jersey_number").all()
  ) as User[];

  // For each player, attach the season report. ~12 players → cheap to do inline.
  const data = players.map((p) => {
    const report = buildReportForPlayer(p);
    const headline = report.metrics[0];
    return {
      ...p,
      report: {
        games: report.games,
        sets: report.sets,
        overall: report.overall,
        headline: headline
          ? { id: headline.id, label: headline.label, display: headline.display, grade: headline.grade, tier: headline.tier }
          : null,
      },
    };
  });

  res.json({ ok: true, data });
});

// GET /api/players/:id — one player's full profile: graded metrics vs their
// level, the position-aware overall rating, and their game-by-game log.
router.get("/:id", (req: Request, res: Response) => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }

  const player = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'player'").get(params.data.id) as User | undefined;
  if (!player) {
    res.status(404).json({ ok: false, error: { message: `Player ${params.data.id} not found.` } });
    return;
  }

  const report = buildReportForPlayer(player);
  const log = getPlayerGameLog(player.id);

  res.json({ ok: true, data: { player, report, gameLog: log } });
});

export { router as playersRouter };
