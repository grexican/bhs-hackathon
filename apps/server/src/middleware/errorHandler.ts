import type { NextFunction, Request, Response } from "express";

// Centralized error handler. Any route that throws or calls next(err) ends up
// here. Sends a clean JSON shape so the React client can surface a useful
// message instead of an HTML error page.
//
// (Express needs the unused `_next` parameter to recognize this as an error
// handler — that's why it's there.)
export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  console.error(`[${req.method} ${req.url}]`, error);

  res.status(500).json({
    ok: false,
    error: {
      message: error.message || "Internal server error",
    },
  });
}
