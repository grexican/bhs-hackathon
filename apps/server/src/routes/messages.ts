import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { db, type MessageRow, type User } from "../db.js";

// Mounted at /api/teams/:teamId/messages.
const router: Router = Router({ mergeParams: true });

const TeamParam = z.object({ teamId: z.coerce.number().int().positive() });

const CreateMessage = z.object({
  author_id: z.number().int().positive(),
  kind: z.enum(["announcement", "chat"]).default("chat"),
  body: z.string().min(1).max(1000),
  pinned: z.boolean().optional(),
});

// GET /api/teams/:teamId/messages — the team feed: messages with their
// author's name and color so the client can render them without extra calls.
router.get("/", (req: Request, res: Response) => {
  const params = TeamParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const rows = db
    .prepare(
      `SELECT m.*, u.name AS author_name, u.role AS author_role, u.avatar_color AS author_color
       FROM messages m JOIN users u ON u.id = m.author_id
       WHERE m.team_id = ? ORDER BY m.created_at ASC`
    )
    .all(params.data.teamId) as (MessageRow & { author_name: string; author_role: string; author_color: string })[];

  const data = rows.map((m) => ({
    id: m.id,
    kind: m.kind,
    body: m.body,
    pinned: m.pinned === 1,
    created_at: m.created_at,
    author: { id: m.author_id, name: m.author_name, role: m.author_role, color: m.author_color },
  }));
  res.json({ ok: true, data });
});

// POST /api/teams/:teamId/messages — post a chat message or (coach) an
// announcement. Only coaches should pin; we trust the client to send the
// right author, since there's no auth in this demo.
router.post("/", (req: Request, res: Response) => {
  const params = TeamParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }
  const body = CreateMessage.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ ok: false, error: body.error.flatten() });
    return;
  }

  const author = db.prepare("SELECT * FROM users WHERE id = ?").get(body.data.author_id) as User | undefined;
  if (!author) {
    res.status(400).json({ ok: false, error: { message: "Unknown author." } });
    return;
  }
  // Only coaches may post announcements; everyone else is forced to 'chat'.
  const kind = author.role === "coach" ? body.data.kind : "chat";
  const pinned = author.role === "coach" && body.data.pinned ? 1 : 0;

  const result = db
    .prepare("INSERT INTO messages (team_id, author_id, kind, body, pinned) VALUES (?, ?, ?, ?, ?)")
    .run(params.data.teamId, author.id, kind, body.data.body, pinned);

  const created = db
    .prepare(
      `SELECT m.*, u.name AS author_name, u.role AS author_role, u.avatar_color AS author_color
       FROM messages m JOIN users u ON u.id = m.author_id WHERE m.id = ?`
    )
    .get(result.lastInsertRowid) as MessageRow & { author_name: string; author_role: string; author_color: string };

  res.status(201).json({
    ok: true,
    data: {
      id: created.id,
      kind: created.kind,
      body: created.body,
      pinned: created.pinned === 1,
      created_at: created.created_at,
      author: { id: created.author_id, name: created.author_name, role: created.author_role, color: created.author_color },
    },
  });
});

export { router as messagesRouter };
