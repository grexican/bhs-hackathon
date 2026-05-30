import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { type Bike, db, type Review } from "../db.js";
import { RIDERS } from "../seed.js";

const router: Router = Router();

// The problem tags a rider can attach to a review. null/absent = no problem.
const ISSUE_TAGS = ["brakes", "tires", "seat", "chain", "gears", "battery", "other"] as const;

// --- Validation schemas (Zod) ---

const CreateReviewSchema = z.object({
  rider: z.string().min(1, "rider name is required").max(40),
  rating: z.coerce.number().int().min(1).max(5),
  // A review can flag several problems; an empty/omitted list means "no issues".
  issues: z.array(z.enum(ISSUE_TAGS)).optional().default([]),
  comment: z.string().max(280).nullish(),
});

const CodeParamSchema = z.object({
  code: z.string().min(1),
});

const IdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// A bike row plus the computed stats the UI needs (rating, counts).
type BikeWithStats = Bike & {
  review_count: number;
  avg_rating: number | null;
  open_issues: number;
};

// The client wants `issues` as a real array, but the DB stores it as JSON text.
// This expands a stored row into the shape the UI expects.
type ApiReview = Omit<Review, "issues"> & { issues: string[] };
function toApiReview(row: Review): ApiReview {
  return { ...row, issues: row.issues ? (JSON.parse(row.issues) as string[]) : [] };
}

// Shared SELECT that attaches stats to a bike row. A service is a fresh start:
// rating, review count, and open issues ALL count only reviews newer than the
// last service, so old complaints stop dragging down a bike that was repaired.
const SINCE_SERVICE = "r.created_at > COALESCE(b.serviced_at, '')";
const BIKE_WITH_STATS = `
  SELECT b.id, b.code, b.model, b.station, b.status, b.serviced_at, b.created_at,
    (SELECT COUNT(*) FROM reviews r WHERE r.bike_id = b.id AND ${SINCE_SERVICE}) AS review_count,
    (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.bike_id = b.id AND ${SINCE_SERVICE}) AS avg_rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.bike_id = b.id AND r.issues IS NOT NULL
       AND ${SINCE_SERVICE}) AS open_issues
  FROM bikes b
`;

// --- Routes ---

// GET /api/bikes — every bike with its stats, worst health first.
// Worst-first (most open issues, then lowest rating) is what the operator
// dashboard wants; the rider scan screen re-sorts on the client.
router.get("/", (_req: Request, res: Response) => {
  // Worst first: most open issues, then lowest rating. `avg_rating IS NULL`
  // keeps freshly-serviced / never-reviewed bikes below genuinely-rated ones.
  const bikes = db
    .prepare(
      `${BIKE_WITH_STATS} ORDER BY open_issues DESC, avg_rating IS NULL ASC, avg_rating ASC, b.code ASC`
    )
    .all() as BikeWithStats[];
  res.json({ ok: true, data: bikes });
});

// GET /api/bikes/:code — one bike (by QR code) plus its recent reviews.
// This is the screen a rider sees right after "scanning".
router.get("/:code", (req: Request, res: Response) => {
  const params = CodeParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }

  const bike = db.prepare(`${BIKE_WITH_STATS} WHERE b.code = ?`).get(params.data.code) as
    | BikeWithStats
    | undefined;
  if (!bike) {
    res.status(404).json({ ok: false, error: { message: `No bike with code ${params.data.code}.` } });
    return;
  }

  const reviews = (
    db
      .prepare("SELECT * FROM reviews WHERE bike_id = ? ORDER BY created_at DESC, id DESC")
      .all(bike.id) as Review[]
  ).map(toApiReview);

  res.json({ ok: true, data: { bike, reviews } });
});

// POST /api/bikes/:code/reviews — a rider leaves a review for the scanned bike.
router.post("/:code/reviews", (req: Request, res: Response) => {
  const params = CodeParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }

  const body = CreateReviewSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ ok: false, error: body.error.flatten() });
    return;
  }

  const bike = db.prepare("SELECT id FROM bikes WHERE code = ?").get(params.data.code) as
    | { id: number }
    | undefined;
  if (!bike) {
    res.status(404).json({ ok: false, error: { message: `No bike with code ${params.data.code}.` } });
    return;
  }

  const { rider, rating, issues, comment } = body.data;
  // Store the problem list as JSON text, or null when the rider flagged nothing.
  const issuesJson = issues.length ? JSON.stringify(issues) : null;
  const result = db
    .prepare("INSERT INTO reviews (bike_id, rider, rating, issues, comment) VALUES (?, ?, ?, ?, ?)")
    .run(bike.id, rider, rating, issuesJson, comment ?? null);
  const created = db
    .prepare("SELECT * FROM reviews WHERE id = ?")
    .get(result.lastInsertRowid) as Review;

  res.status(201).json({ ok: true, data: toApiReview(created) });
});

// POST /api/bikes/:id/service — operator marks a bike serviced.
// Stamps serviced_at = now, which clears any issues reported before this moment.
router.post("/:id/service", (req: Request, res: Response) => {
  const params = IdParamSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ ok: false, error: params.error.flatten() });
    return;
  }

  const result = db
    .prepare("UPDATE bikes SET serviced_at = datetime('now'), status = 'in_service' WHERE id = ?")
    .run(params.data.id);
  if (result.changes === 0) {
    res.status(404).json({ ok: false, error: { message: `Bike ${params.data.id} not found.` } });
    return;
  }

  const bike = db.prepare(`${BIKE_WITH_STATS} WHERE b.id = ?`).get(params.data.id) as BikeWithStats;
  res.json({ ok: true, data: bike });
});

// POST /api/bikes/simulate — fake a random rider scanning a random bike and
// leaving a review. Powers the "Simulate activity" demo button. Weighted so
// most rides are fine but some report a problem — keeps the demo lively.
router.post("/simulate", (_req: Request, res: Response) => {
  const bikes = db.prepare("SELECT id, code FROM bikes").all() as { id: number; code: string }[];
  if (bikes.length === 0) {
    res.status(409).json({ ok: false, error: { message: "No bikes to simulate against yet." } });
    return;
  }

  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;
  const bike = pick(bikes);
  const rider = pick(RIDERS);

  // 35% of simulated rides report a problem — and sometimes two at once.
  const hasIssue = Math.random() < 0.35;
  const issues: string[] = [];
  if (hasIssue) {
    issues.push(pick(ISSUE_TAGS));
    const second = pick(ISSUE_TAGS);
    if (Math.random() < 0.4 && !issues.includes(second)) issues.push(second);
  }
  const rating = hasIssue ? pick([1, 2, 3] as const) : pick([4, 5] as const);
  const comment = hasIssue
    ? `Heads up: ${issues.join(", ")} not great right now.`
    : "All good, smooth ride.";

  const result = db
    .prepare("INSERT INTO reviews (bike_id, rider, rating, issues, comment) VALUES (?, ?, ?, ?, ?)")
    .run(bike.id, rider, rating, issues.length ? JSON.stringify(issues) : null, comment);
  const created = db
    .prepare("SELECT * FROM reviews WHERE id = ?")
    .get(result.lastInsertRowid) as Review;

  res.status(201).json({ ok: true, data: { review: toApiReview(created), code: bike.code } });
});

export { router as bikesRouter };
