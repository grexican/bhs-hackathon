import { type Request, type Response, Router } from "express";

const router: Router = Router();

// Tiny "is this thing on?" endpoint. Useful for a status check.
router.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, status: "healthy", time: new Date().toISOString() });
});

export { router as healthRouter };
