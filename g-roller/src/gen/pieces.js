// The SELF-DESCRIBING BOARD-PIECE REGISTRY — a dictionary where every piece type declares its own
// CAPABILITIES, so adding a new creative piece is ONE entry here, not edits scattered through the
// generator and renderer. The generator reads these flags to decide what a piece may become; the
// renderer reads `plate`/`structure` to build the mesh.
//
// Each entry:
//   geoType        — base mesh shape ("box" | "cyl" | "hex") for non-structure pieces.
//   round          — true for radially-round pads (hex/cyl): a turntable SPIN keeps the landing spot
//                    put, so spin is only ever allowed on these.
//   motions        — the motion types this piece CAN carry (the generator further filters by the
//                    critical-path safe set + the per-distance unlock). [] = never moves.
//   canTilt        — may take slope/curve/lean/yaw (the "drama" spectacle).
//   canObstacle    — may host a barrier/spikes/pillars/overhead hazard.
//   baseDifficulty — a small intrinsic difficulty floor folded into boardDifficulty (a flipper/round
//                    pad reads a touch harder than a plain slab before any decoration).
//   plate          — special-plate identity for the renderer ("boost"|"flipper"|"bouncy").
//   structure      — true for self-contained set-pieces the generator builds directly (tunnel/spline).
//   forcesRunway   — the piece launches you, so a straight landing runway must follow (flipper).
//
// NOTE: this captures the DATA model the pieces describe themselves with. The matching refactor —
// giving each piece its OWN render function (so platforms.js stops branching on type) — is the next
// step; see todo.md "self-rendering pieces". boardDifficulty/pickMotion already read this registry.

export const PIECE_DEFS = {
  // --- landable ground pads --------------------------------------------------
  box: { geoType: "box", round: false, motions: ["lift", "slide", "wag", "orbit"], canTilt: true, canObstacle: true, baseDifficulty: 0 },
  hex: { geoType: "hex", round: true, motions: ["lift", "slide", "spin", "wag", "orbit"], canTilt: false, canObstacle: false, baseDifficulty: 0.05 },
  cyl: { geoType: "cyl", round: true, motions: ["lift", "slide", "spin", "wag", "orbit"], canTilt: false, canObstacle: false, baseDifficulty: 0.05 },
  // --- special plates (self-lit, identity glow) ------------------------------
  boost: { geoType: "box", round: false, motions: [], canTilt: false, canObstacle: false, baseDifficulty: 0, plate: "boost" },
  flipper: { geoType: "box", round: false, motions: [], canTilt: false, canObstacle: false, baseDifficulty: 0.2, plate: "flipper", forcesRunway: true },
  bouncy: { geoType: "box", round: false, motions: [], canTilt: false, canObstacle: false, baseDifficulty: 0.1, plate: "bouncy" },
  // --- structures (set-pieces the generator builds directly) -----------------
  tunnel: { structure: true, motions: [], canTilt: false, canObstacle: false, baseDifficulty: 0.1 },
  spline: { structure: true, motions: [], canTilt: false, canObstacle: false, baseDifficulty: 0.15 },
};

// Resolve a piece def from the generator's (type, geoType). A special-plate `type`
// (boost/flipper/bouncy) wins; otherwise the geoType (box/cyl/hex) picks the pad.
export function pieceFor(type, geoType) {
  if (type === "boost" || type === "flipper" || type === "bouncy") return PIECE_DEFS[type];
  return PIECE_DEFS[geoType] || PIECE_DEFS.box;
}

// The SELF-DESCRIBING OBSTACLE REGISTRY — parallel to PIECE_DEFS. Each hazard declares what it is,
// how hard it is, which boards it can sit on, and how it MOVES (patrol) + how much that motion adds
// to its difficulty. The generator (planPath) reads this to choose + place hazards and to roll the
// patrol IN THE PURE LAYER (so boardDifficulty sees the motion); the renderer reads it to build the
// mesh + drive the patrol. Adding a new hazard = one entry.
//   difficulty   — base threat (0..1) folded into boardDifficulty.
//   action       — what the player does: "jump" | "steer" | "duck" | "thread" (UX/telegraph hint).
//   minBoardLen  — shortest board it's fair on (overhead needs a long grounded runway).
//   onlyFlat     — must sit on a flat (untilted) board (a hazard you can't dodge mid-climb is unfair).
//   patrol       — the axis it can PATROL along ("x" = side-to-side, "z" = fore/aft) or null (static).
//   patrolDiff   — how much a moving (patrolling) instance ADDS to its difficulty.
export const OBSTACLE_DEFS = {
  spikes:   { difficulty: 0.30, action: "steer",  minBoardLen: 0,  onlyFlat: true, patrol: "x",  patrolDiff: 0.15 },
  barrier:  { difficulty: 0.35, action: "jump",   minBoardLen: 0,  onlyFlat: true, patrol: "z",  patrolDiff: 0.15 },
  pillars:  { difficulty: 0.50, action: "thread", minBoardLen: 0,  onlyFlat: true, patrol: null, patrolDiff: 0 },
  overhead: { difficulty: 0.55, action: "duck",   minBoardLen: 22, onlyFlat: true, patrol: null, patrolDiff: 0 },
};

// Difficulty of an obstacle plan { kind, move } — base + patrol surcharge if it's moving.
export function obstacleDifficulty(ob) {
  if (!ob) return 0;
  const d = OBSTACLE_DEFS[ob.kind] || OBSTACLE_DEFS.barrier;
  return d.difficulty + (ob.move ? d.patrolDiff : 0);
}
