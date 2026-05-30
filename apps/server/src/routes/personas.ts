import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { db, type Team, type User } from "../db.js";

const router: Router = Router();

const IdParam = z.object({ id: z.coerce.number().int().positive() });

// GET /api/personas — everyone you can "log in" as. The login screen lists
// these so a tester can jump between the coach and any player in one click.
// (No passwords — this is a demo. Real login can be added after the event.)
router.get("/personas", (_req: Request, res: Response) => {
  const users = db.prepare("SELECT * FROM users ORDER BY role DESC, jersey_number").all() as User[];
  const teams = db.prepare("SELECT * FROM teams").all() as Team[];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const data = users.map((u) => ({ ...u, team: u.team_id ? (teamById.get(u.team_id) ?? null) : null }));
  res.json({ ok: true, data });
});

// GET /api/users/:id — fetch a single user (used to refresh "who am I").
router.get("/users/:id", (req: Request, res: Response) => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(params.data.id) as User | undefined;
  if (!user) {
    res.status(404).json({ ok: false, error: { message: "User not found." } });
    return;
  }
  res.json({ ok: true, data: user });
});

// GET /api/teams/:id — basic team info (name, level, season).
router.get("/teams/:id", (req: Request, res: Response) => {
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(params.data.id) as Team | undefined;
  if (!team) {
    res.status(404).json({ ok: false, error: { message: "Team not found." } });
    return;
  }
  res.json({ ok: true, data: team });
});

export { router as personasRouter };
