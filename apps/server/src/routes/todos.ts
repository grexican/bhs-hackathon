import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { db, type Todo } from "../db.js";

const router: Router = Router();

// --- Validation schemas (Zod) ---
// Zod runs at runtime — checks the shape of incoming JSON and gives a clear
// error if the client sent something wrong. This is the standard pattern:
// define a schema, parse the body, use the typed result.

const CreateTodoSchema = z.object({
  text: z.string().min(1, "text cannot be empty").max(500, "text is too long"),
});

const UpdateTodoSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
});

const IdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// --- Routes ---

// GET /api/todos — list all todos, newest first.
// Tiebreak on id because datetime('now') only has 1-second precision —
// two rows inserted in the same second would otherwise come back in an
// undefined order.
router.get("/", (_req: Request, res: Response) => {
  const todos = db
    .prepare("SELECT id, text, done, created_at FROM todos ORDER BY created_at DESC, id DESC")
    .all() as Todo[];
  res.json({ ok: true, data: todos });
});

// POST /api/todos — create a new todo. Body: { text: string }
router.post("/", (req: Request, res: Response) => {
  const parsed = CreateTodoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const { text } = parsed.data;
  const result = db.prepare("INSERT INTO todos (text) VALUES (?)").run(text);
  const created = db
    .prepare("SELECT id, text, done, created_at FROM todos WHERE id = ?")
    .get(result.lastInsertRowid) as Todo;

  res.status(201).json({ ok: true, data: created });
});

// PATCH /api/todos/:id — update text and/or done state.
router.patch("/:id", (req: Request, res: Response) => {
  const params = IdParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }

  const body = UpdateTodoSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ ok: false, error: body.error.flatten() });
    return;
  }

  const { id } = params.data;
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.data.text !== undefined) {
    updates.push("text = ?");
    values.push(body.data.text);
  }
  if (body.data.done !== undefined) {
    updates.push("done = ?");
    values.push(body.data.done ? 1 : 0);
  }

  if (updates.length === 0) {
    res.status(400).json({ ok: false, error: { message: "No fields to update." } });
    return;
  }

  values.push(id);
  const result = db.prepare(`UPDATE todos SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  if (result.changes === 0) {
    res.status(404).json({ ok: false, error: { message: `Todo ${id} not found.` } });
    return;
  }

  const updated = db
    .prepare("SELECT id, text, done, created_at FROM todos WHERE id = ?")
    .get(id) as Todo;

  res.json({ ok: true, data: updated });
});

// DELETE /api/todos/:id — remove a todo.
router.delete("/:id", (req: Request, res: Response) => {
  const params = IdParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }

  const { id } = params.data;
  const result = db.prepare("DELETE FROM todos WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ ok: false, error: { message: `Todo ${id} not found.` } });
    return;
  }
  res.json({ ok: true });
});

export { router as todosRouter };
