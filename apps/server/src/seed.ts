import type { Database as DatabaseType } from "better-sqlite3";

// Fills the database with fake Bicing bikes and rider reviews — but only the
// first time (when the bikes table is empty). This is what makes the demo feel
// real on first load instead of showing empty screens.

// The five fake bikes a rider can "scan". Each `code` is the QR sticker value.
const FAKE_BIKES = [
  { code: "BCN-0421", model: "Mechanical", station: "Pl. Catalunya" },
  { code: "BCN-1187", model: "Electric", station: "Sagrada Família" },
  { code: "BCN-0663", model: "Mechanical", station: "Barceloneta" },
  { code: "BCN-2050", model: "Electric", station: "Gràcia" },
  { code: "BCN-0934", model: "Mechanical", station: "Sants Estació" },
];

// Fake riders so reviews are attributed to believable people.
const RIDERS = ["Marta", "Jordi", "Aisha", "Leo", "Núria", "Pau", "Emma"];

// A pre-written set of reviews per bike code. `daysAgo` spreads them across the
// last two weeks so the "recent reviews" list looks natural. `issues` is a list
// of problem tags — empty means the bike was fine, and a review can list several.
type SeedReview = {
  rider: string;
  rating: number;
  issues: string[];
  comment: string | null;
  daysAgo: number;
};

const FAKE_REVIEWS: Record<string, SeedReview[]> = {
  "BCN-0421": [
    { rider: "Marta", rating: 5, issues: [], comment: "Smooth ride, brakes felt great.", daysAgo: 1 },
    { rider: "Jordi", rating: 4, issues: [], comment: "Solid bike, seat a little low.", daysAgo: 4 },
    { rider: "Pau", rating: 5, issues: [], comment: "No complaints!", daysAgo: 9 },
  ],
  "BCN-1187": [
    { rider: "Aisha", rating: 1, issues: ["battery", "gears"], comment: "Battery died AND gears slipped — rough ride.", daysAgo: 1 },
    { rider: "Leo", rating: 2, issues: ["battery"], comment: "Motor barely kicked in.", daysAgo: 2 },
    { rider: "Emma", rating: 3, issues: ["gears"], comment: "Gears slipped a couple times.", daysAgo: 6 },
  ],
  "BCN-0663": [
    { rider: "Núria", rating: 1, issues: ["brakes", "tires"], comment: "Front brake barely works and the tire's soft — scary.", daysAgo: 1 },
    { rider: "Jordi", rating: 2, issues: ["tires"], comment: "Back tire felt soft.", daysAgo: 3 },
  ],
  "BCN-2050": [
    { rider: "Pau", rating: 5, issues: [], comment: "Brand new feel, fast boost.", daysAgo: 2 },
    { rider: "Marta", rating: 4, issues: [], comment: "Great e-bike, full battery.", daysAgo: 5 },
  ],
  "BCN-0934": [
    { rider: "Emma", rating: 3, issues: ["seat"], comment: "Seat wobbles a bit.", daysAgo: 2 },
    { rider: "Leo", rating: 4, issues: [], comment: "Fine for a quick trip.", daysAgo: 7 },
  ],
};

export function seedBikes(db: DatabaseType): void {
  // Already seeded? Leave existing data alone.
  const count = db.prepare("SELECT COUNT(*) AS n FROM bikes").get() as { n: number };
  if (count.n > 0) return;

  const insertBike = db.prepare("INSERT INTO bikes (code, model, station) VALUES (?, ?, ?)");
  // created_at uses datetime('now', '-N days') so reviews are spread over time.
  const insertReview = db.prepare(
    "INSERT INTO reviews (bike_id, rider, rating, issues, comment, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))"
  );

  // Wrap in a transaction so the whole seed is one atomic write.
  const seed = db.transaction(() => {
    for (const bike of FAKE_BIKES) {
      const result = insertBike.run(bike.code, bike.model, bike.station);
      const bikeId = result.lastInsertRowid as number;
      for (const r of FAKE_REVIEWS[bike.code] ?? []) {
        // Store the problem list as JSON text, or null when there were none.
        const issues = r.issues.length ? JSON.stringify(r.issues) : null;
        insertReview.run(bikeId, r.rider, r.rating, issues, r.comment, `-${r.daysAgo} days`);
      }
    }
  });
  seed();
}

// Exported so the "simulate" route can reuse the same pools of fake people.
export { RIDERS, FAKE_BIKES };
