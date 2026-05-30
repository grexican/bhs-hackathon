import { type Request, type Response, Router } from "express";

import { db } from "../db.js";
import { clearDemoData, seedDemo } from "../db/seed.js";

const router: Router = Router();

// POST /api/admin/reset — wipe and regenerate the demo season. Handy during a
// demo if someone has been clicking around and you want a clean slate. Because
// the seed is deterministic, you get the exact same starting data every time.
router.post("/reset", (_req: Request, res: Response) => {
  const reset = db.transaction(() => {
    clearDemoData(db);
    seedDemo(db);
  });
  reset();
  res.json({ ok: true, data: { message: "Demo data reset." } });
});

export { router as adminRouter };
