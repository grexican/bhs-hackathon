import type { Request, Response } from "express";

// Runs after every route. If nothing matched, return a JSON 404 instead of
// Express's default HTML page.
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: { message: `Not found: ${req.method} ${req.url}` },
  });
}
