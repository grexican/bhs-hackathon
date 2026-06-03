// =============================================================================
// G-Roller config — every tunable number, grouped by what it controls.
//
// Sections:
//   player    — the ball's own movement & physics
//   plates    — how special plates push the ball (accel/bounce/flipper/tilt)
//   effects   — how each powerup/powerdown behaves once collected
//   scoring   — the score & combo economy
//   world     — run framing (culling, death, starter, base-speed ramp)
//   zen       — the calm no-death mode
//   audiosurf — the beat-pulse mode
//   cheat     — the secret test menu
//   gen       — THE procedural generator: what spawns, where, how often, how big
//
// The mental model for `gen`: it decides WHAT pieces spawn, WHERE, HOW OFTEN and
// HOW BIG. How the ball RESPONDS to a piece lives in player/plates/effects. So a
// ramp's spawn-chance + steepness is in gen, but the launch it gives you is in
// plates; an obstacle's spawn-chance is in gen, but no "response" — you just dodge.
//
// Difficulty (Easy/Medium/Hard) is NOT a pile of special-cases. It's five intuitive
// knobs per tier (see `gen.tiers`) that scale one shared ruleset. See the long note
// above `gen` for the full model.
// =============================================================================

export const CONFIG = {
  // --- The ball -------------------------------------------------------------
  player: {
    sideSpeed: 20, // left/right strafe (units per second)
    forwardSpeed: 26, // starting auto-run speed (eases up from here) — × tier pace
    maxForwardSpeed: 48, // the auto-run speed PLATEAU (× pace → Easy 42 / Med 48 / Hard 55). Trimmed
    //                      from 63 (Hard's old 72.5 was "absolutely brutal"). Speed climbs steadily
    //                      over the first ~5km, THEN plateaus; the rest of the climb is hazards.
    minSpeed: 15, // speed never eases below this (so you can't stall)
    manualSpeed: 8, // Up/Down arrows nudge speed this much (kept small so gaps stay reachable)

    jumpSpeed: 42, // launch velocity — trimmed from 50 so take-off is less "springy"
    gravity: 39, // FALL gravity (the drop the player likes — full strength)
    riseGravity: 23, // ASCENT gravity — weaker, so the jump floats UP slowly (Spider-Man swing feel). Asymmetric on purpose.
    terminalVelocity: 130, // cap on DOWNWARD fall speed. A big moon-bounce could otherwise build up
    //                        enough speed to skip past a board between frames (clip through the ground).
    //                        High enough that the drop still feels fast + dramatic. Launches (upward) are unaffected.
    quickDescentDivisor: 1.7, // releasing jump while rising chops upward speed by this for a fast drop
    playerRadius: 0.9,

    // Forgiveness so edge/just-landed jumps always register:
    coyoteTime: 0.1, // still jump for this long after rolling off a ledge
    jumpBufferTime: 0.5, // a jump pressed this soon before landing still fires
  },

  // --- How special plates push the ball -------------------------------------
  plates: {
    // Acceleration plates (green arrows): the longer you ride one, the faster you
    // go. The build COMPOUNDS — a quick tap nudges you; a full ride steepens into a
    // real zoom that caps just under a second of solid riding.
    accel: {
      rate: 13, // speed gained per second the instant you touch a plate
      growth: 2.3, // how fast that build rate itself ramps the longer you ride
      max: 42, // cap on the accumulated bonus
      hold: 1.4, // seconds at top speed before the decay kicks in
      decay: 9, // speed lost per second after the hold (steady linear glide back)
      ease: 0.09, // while ON a plate, speed chases its target this fast (small = snappy, so the gain happens before you lift off)
    },
    // Trampoline boards (pink): launch you up like a boosted jump.
    bounce: { boost: 1.7, springTime: 0.4 }, // launch velocity = player.jumpSpeed*boost; springTime = the deck's dip-then-spring animation length
    // Flipper plate (orange): a hinged springboard that sends you up AND forward.
    flipper: {
      vertical: 1.45, // launch v.y = player.jumpSpeed * this (big air — it's a CANNON). Trimmed only
      //                modestly from 1.75 so the ~81u launch keeps its spectacle (a normal jump peaks
      //                ~38u); the shorter airtime (~4.7s vs ~5.6s) is what trims the landing runway.
      forward: 60, // forward speed BLAST injected on launch (was 95). This is the SINGLE source for
      //              both the launch fling (game._onLanded) AND the runway sizing (planPath
      //              flipperFlightDistance) — they used to diverge (runway off maxSpeed, launch off
      //              this), which sized a ~900m straight strip for a ~350m flight. Trimmed so the
      //              cannon stays a big-air launch without sailing the player half a kilometre.
      maxSpeed: 150, // PER-FRAME velocity clamp only — the ball can momentarily reach this. NEVER
      //               use this to size the runway: it's a cap the ball never SUSTAINS.
      flipTime: 0.4, // seconds the hinge-kick animation lasts
    },
    // Board-tilt responses — how the ball reacts to a board's slope/curve/bank.
    rampLaunch: 0.7, // fraction of climb speed kept as a hop off an up-ramp
    curveForce: 16, // sideways "gravity" on a curved board — multiplied by the (random) curve, so a deep bowl pulls hard
    leanForce: 14, // downhill "gravity" while riding a banked board — multiplied by the (random) lean
  },

  // --- How each powerup / powerdown behaves ---------------------------------
  // (Each effect's duration, color, icon, label and good/bad flag live together on
  // its POWERUP_DEFS entry in platforms.js — one source of truth. These are the
  // strength/tuning knobs only.)
  effects: {
    powerupChance: 0.3, // chance a path platform spawns a pickup
    powerupAuraRadius: 6, // visible glowing trigger-cloud radius around each pickup (also the grab zone)
    magnetRadius: 32, // gems within this distance get sucked in
    magnetPull: 22, // how hard the magnet yanks gems
    slowFactor: 0.72, // forward speed multiplier while slowed
    slowEase: 2.4, // seconds to ease into the slow
    surgeAmount: 16, // extra forward speed while surged (a powerdown)
    invulnTime: 1.2, // mercy window after a shielded hit
    flightLift: 19, // upward speed while flying
    morphWobble: 12, // strength of the steering wobble while morphed
    lowgravScale: 0.45, // gravity multiplier while low-grav is active
    flubberBounce: 1.3, // bounce velocity = player.jumpSpeed * this
    blackoutDim: 0.3,
    fogNear: 80,
    fogFar: 230, // normal fog distances (clear & far-seeing)
    fogBlindNear: 42,
    fogBlindFar: 95, // "fogged" distances — clear close, grey wall beyond
    fogSmokeColor: 0x494d55, // dark mid-grey the fog tints toward while fogged
  },

  // --- Score & combo economy ------------------------------------------------
  // Score = distance * multiplier (+ gems and near-miss bonuses). The multiplier
  // climbs as you take risks and decays if you play it safe.
  scoring: {
    scorePerMeter: 1,
    gemScore: 25,
    clusterGem: 5,       // an off-path "side-quest" CLUSTER gem is worth this many gems (5×)
    clusterGemSpicy: 10, // …or this many on a SPICY (hard-to-reach) branch — the big dare (10×)
    nearMissBonus: 50,
    nearMissMargin: 1.2, // grazing an obstacle within this extra distance = near-miss
    multiplierMax: 12,
    comboDecay: 4, // seconds without a combo event before the multiplier drops 1
    // Riding out powerdowns cranks scoring: each active one adds powerdownMult, and
    // every one beyond the first adds an extra stack bonus — surviving three at once
    // scores far more than three one-at-a-time.
    powerdownMult: 1,
    powerdownStackBonus: 1,
  },

  // --- Run framing ----------------------------------------------------------
  world: {
    keepAheadDistance: 800, // generate platforms out to this far ahead — ALSO where the emitter
    //                         rides (it sits at the live spawn frontier, so pieces literally come
    //                         from it out in the distance). Safe at this long lead ONLY because
    //                         gaps are now sized off the SUSTAINABLE base speed (see game.js
    //                         genSpeed), not transient boosts — otherwise a gap sized for a fading
    //                         boost would be unjumpable by the time you arrived.
    cullBehindDistance: 70, // remove platforms this far behind
    emergeBand: 80, // metres before the draw horizon over which a piece FADES IN (opacity 0→1) so it
    //                 materialises OUT of the fog/backdrop instead of popping its silhouette into view.
    // Death: game over only once you fall this far below the LOWEST landable surface
    // still drawn near you. Deep, so a near-miss is a long recoverable plunge.
    fallMargin: 42,
    fallDeathHang: 10, // hard cap (s) on the fall-death cinematic
    starterLength: 64,
    starterWidth: 18,
    // Base auto-run speed nudges up slowly with distance (keeps the early game relaxed).
    speedRampEvery: 270, // METRES between speed nudges (distance-based — see game.js). base 26 → max
    //                      48 in (48-26)/1.2 ≈ 18 nudges × 270m ≈ 5000m: speed climbs steadily over
    //                      the first ~5km, THEN plateaus while the danger ramp keeps hazards rising.
    speedRampAmount: 1.2,
  },

  // --- Zen mode: calm, no-death, scoring off --------------------------------
  zen: {
    bounce: 2.0, // a would-be-fatal fall instead power-bounces you up at jumpSpeed * this
    catchDepth: 32, // how far BELOW the lowest nearby board you fall before the bounce catches you
    fixedDanger: 0.2, // the hazard ramp is PINNED here (no escalation) — a steady mild Medium
  },

  // --- Audiosurf: the world pulses ON the beat ------------------------------
  audiosurf: {
    track: 4, // index into TRACKS — "Pulse Runner" (the most beat-forward)
    bloomKick: 0.7, // bloom/sun flash added on each beat
    fovKick: 1.0, // degrees of FOV punch per beat (small — camera movement is distracting)
    lightKick: 0.4, // fraction the scene lights brighten per beat (the GROUND flash pump)
    skyKick: 0.8, // how much the skyline windows flash brighter per beat
    decay: 7, // how fast the pulse decays per second (higher = punchier)
    reducedScale: 0.4, // soften the whole pulse this much when reduced-motion is on
  },

  // --- Secret cheat code (half-Contra) on the start/game-over screen ---------
  // Unlocks the per-powerup spawn-pool picker + God-mode key for testing effects.
  cheat: {
    code: ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"],
    itemMultiplier: 1, // spawn frequency in cheat mode (kept at 1× — the menu is the tool)
  },

  // ===========================================================================
  // gen — THE procedural generator
  // ===========================================================================
  //
  // TWO progression ramps run over distance (preserves "the world opens up FAST,
  // but gets dangerous SLOWLY"):
  //   openness(z) 0→1 over `opennessDistance` — how much the field has opened (the
  //               journey feel: wander, vertical reach, gap length, scatter spread).
  //   danger(z)   0→1 over `dangerDistance`   — how dangerous it's become (obstacle,
  //               mover, sharp-turn, lean frequency; pads shrink). Scaled per-tier by
  //               the `danger` knob (how fast it ramps in).
  //
  // Per-tier knobs (`tiers`) scale that one ruleset. This is all Easy/Med/Hard
  // are — no special-cases:
  //   pace      — base auto-run speed multiplier.
  //   hazard    — scales hazard CHANCES (the danger ramp's output) + how fast pads
  //               shrink. Higher = busier & a higher danger plateau.
  //   danger    — scales how FAST the danger ramp climbs with distance (Hard gets
  //               dangerous in fewer metres). `danger` sets WHEN, `hazard` sets HOW MUCH.
  //   openness  — scales how FAST the world opens (the openness ramp's input distance).
  //               NOTE: this only differentiates tiers during the RAMP — it saturates
  //               at 1.0 by ~opennessDistance, after which all tiers are "fully open".
  //               For plateau width, that's what `sprawl` is for.
  //   sprawl    — scales how WIDE/TALL the route + scatter roam AT THE PLATEAU (the
  //               wander band, vertical corridor, drift reach, scatter radius). This
  //               is the knob that makes Hard keep sweeping wider than Medium deep in
  //               a run; openness alone can't (it maxes out). Only touches the WANDER
  //               TARGET / decor spread — never a single jump's reach, so it's safe.
  //   density   — scales how MANY scatter/branch platforms spawn. **>1 = more options
  //               (forgiving), <1 = sparser (commit to the path).** Decoupled from
  //               sprawl ON PURPOSE: sprawl widens the field, density populates it.
  //               (Old bug: one "spread" lever did both, so Hard scattered platforms
  //               far AND spawned more of them — wide-but-also-more = unreachable yet
  //               easier. Splitting them is the fix.)
  //   drama     — scales the spectacle (spline/ramp/curve/yaw/tunnel freq & intensity).
  //
  // INVARIANT across every tier: the critical path is always solvable. Gaps/rises/
  // laterals are sized off jumpReach() × the `reach` safety fractions and never
  // exceed what a jump clears. Tiers change FEEL and FORGIVENESS, not whether the
  // path can be jumped. Hard is harder via sparser options + more hazards + faster
  // pace + wilder drama — never via an impossible gap.
  //
  // Every [lo, hi] pair below is interpolated by a 0→1 ramp via ramp(pair, t). The
  // comment on each says which ramp drives it.
  // ===========================================================================
  gen: {
    // Progression ramps
    opennessDistance: 650, // metres for the field to fully open (scaled per-tier by `openness`)
    dangerDistance: 8000, // metres for the DANGER ramp to peak (before the tier `danger` mult) — long
    //                       & gentle so a run is a "mood", not a panic. Per-tier peak = this /
    //                       tier.danger → Hard ~5km, Med 8km, Easy ~9.4km.
    hazardCeil: 0.92, // global cap on any hazard chance after the tier's `hazard` mult (so Hard stays < 100%)
    safeStraight: 2, // the first N steps run straight ahead (ease-in) before anything opens up

    // Difficulty BUDGET knobs (see gen/difficulty.js). DESIGN NOTE — why these are CONSTANTS, not
    // per-tier: the budget MAGNITUDE is already per-tier via each tier's diffFloor/diffSpan (that's
    // where Easy/Hard diverge). These are the SHARED-RULESET pacing + risk/reward STRUCTURE that
    // operates ON that per-tier budget — making them per-tier too would be the special-casing this
    // config exists to avoid. Each one is tier-appropriate WITHOUT a per-tier knob:
    restBeatEvery: 6,   // sawtooth cadence: every Nth non-safe board, dip the cap for a breather. A
    //                    constant cadence already gives tier-right RELIEF because it dips the per-tier
    //                    cap (big relief on Hard's high cap, gentle on Easy's low one).
    restBeatScale: 0.35, // dip depth — a fraction, so it auto-scales to whatever the tier's cap is.
    branchLicensePerRoute: 0.25, // risk/reward: each extra route lets an optional branch be this much
    //                    harder. Universal rule; the tier modulates it via `density` (how many routes
    //                    appear) and the per-tier cap it multiplies — no per-tier knob needed.
    branchLicenseMaxRoutes: 3,   // …capped here (branchCap tops out at cap × 1.75).
    minSpiceGap: 4,     // anti-starvation safety net: if the budget went unspent this many boards,
    //                    force one floor-level feature so calm tiers never go DEAD. The calm-vs-busy
    //                    baseline is already per-tier (motionChance/hazard), so this stays constant.

    // Reachability safety — fraction of the ball's true jump reach a step may use.
    // The contract that keeps every tier solvable. Lower = more headroom.
    reach: {
      rise: 0.8, // fraction of max jump HEIGHT a step may rise
      gap: 0.8, // fraction of jump DISTANCE a forward gap may span
      lateral: 0.6, // fraction of strafe reach a sideways step may take
    },

    // The guaranteed-reachable critical path. It winds toward a roaming target (up,
    // over, across) in big sweeps, but every step stays within a jump.
    //   gap/lateral/rise/drop — per-STEP budgets, ride the OPENNESS ramp, stay <1.0
    //     of jump reach (the solvability contract). NOT scaled by `sprawl`.
    //   bandX/bandY/driftY — how far the WANDER TARGET roams. Ride openness AND the
    //     tier's `sprawl` knob, so the route sweeps wider/taller on harder tiers even
    //     once openness has maxed out. Widening these only means the path takes MORE
    //     (still-reachable) steps to travel there — it never enlarges a single jump.
    path: {
      gapFracLo: [0.28, 0.78], // fraction-of-max-gap LOW end (longer early hops; the floaty jump gives the reach)
      gapFracHi: [0.45, 0.92], // HIGH end — kept under 1.0 so even fully open there's jump headroom
      lateralFrac: [0.5, 0.9], // how much of the reachable strafe a step may use. Raised the LOW end
      //                          (0.35→0.5) so the path SWEEPS left/right SOONER — it was drifting in
      //                          too gently early and read as "straight on" for the first ~1km.
      riseFrac: [0.35, 0.85], // how much of the reachable rise a step may use
      dropDepth: [-4, -10], // how far a step may drop
      // Spread is wide even at the START (high low-ends) so the field reads as "go
      // anywhere" from the first jump, not a tight cluster that slowly opens up.
      bandX: [72, 125], // how far the path may wander left/right (× tier sprawl). Low end raised
      //                   55→72 so the wander TARGET roams wider from early on (spread sooner).
      bandY: [-50, 85], // vertical corridor the wander target stays within (× tier sprawl)
      driftEvery: [2, 12], // steps between picking a new wander target
      driftY: [38, 100], // vertical reach of each wander target (× tier sprawl) — more climb/movement
    },

    // Branch/decor platforms strewn around the path — the parallax "free-floating"
    // backdrop + alternate routes. COUNT rides openness × tier `density` (the
    // forgiveness lever). SPREAD (radius) rides openness × tier `openness`, kept
    // tight enough that branches stay relevant/reachable, not flung off-screen.
    scatter: {
      count: [2, 3], // base extra platforms per step (× tier density → Easy many, Hard few)
      // SPREAD is MAXED toward the reach envelope and is ~the SAME for every tier — the
      // field reads "go anywhere". DIFFICULTY comes from COUNT, not a tighter spread:
      // Easy (many pieces) fills the wide area = abundant, safe to roam; Hard / deep-in
      // (few pieces) leaves the same wide spread SPARSE, so reaching a branch takes
      // timing + moving across/forward/back to stick the landing. A jump strafes ~65
      // laterally, so the radius tops out a touch past that (the edges are a committed,
      // demanding reach — not pointless like the old ±170, not a tight cluster either).
      radiusX: [44, 78], // wide from early, ramps to the reach edge by the time the field opens
      radiusY: [30, 58], // vertical scatter (parallax + up/down reaches)
      zSpread: 54, // depth jitter around the front
      bouncyChance: 0.16, // chance a branch platform is a trampoline (at/above path height)
      bouncyDepthBoost: 0.55, // EXTRA trampoline chance for branches at the DEPTHS (lowest scatter):
      //                         a piece at the very bottom gets bouncyChance + this. If you fall
      //                         way under everything, these red pads are the bounce back into play.
      bouncyDepthPenalty: 0.45, // …but a depth-spawned bouncer is a SMALLER target the deeper it is
      //                           (w & len shrink by up to this fraction × depth, with jitter): the
      //                           rescue is there, but you have to aim for it. Clamped to a min size.
      gemChance: 0.5, // chance a branch carries a gem (reward exploring)
      powerupChance: 0.2, // chance a branch carries a powerup
    },

    // Pad size: BIG early (generous landings), shrinking modestly as DANGER rises
    // (× tier `hazard`). Gaps stay reachable regardless — they're sized off jumpReach,
    // not pad size.
    pad: {
      lenLo: [48, 14],
      lenHi: [70, 20],
      widthLo: [16, 7],
      widthHi: [23, 10],
    },

    // MOTION — moving boards. The big "more moving parts, earlier" system. A board gets at most ONE
    // motion (mutually exclusive). CRITICAL-PATH motion is restricted to types that keep the LANDING
    // SPOT reachable at every phase — lift (Y, the player is auto-carried), turntable-spin (round
    // pads: rotation only, landing spot fixed), and a bounded steerable slide (X, the player steers to
    // track it). The richer/uncatchable types (wag arc, full orbit) are BRANCH-ONLY, where falling
    // off costs an optional reward, not the run — because the engine carries riders on Y only (no
    // horizontal carry), so a horizontally-moving MANDATORY board would slide out from under a
    // statically-landed player. (Council-of-7 verdict, code-verified in player.js.)
    motion: {
      floor: 0.18,          // ambient floor — even at openness 0 (after the intro) this fraction of
      //                       boards MOVE (a gentle lift), so the world is ALIVE early on every tier
      //                       (Easy included — "calm but never sleepy"). NOT on safe/runway boards.
      firstNonSafeQuiet: 3, // no MOVING critical board in the first N non-safe steps (onboarding grace)
      // Type unlock by GENERATION distance (cursor.z, not playerZ — the generator runs ~800m ahead),
      // indexed by tier rank [Easy, Med, Hard]. Harder types unlock later; on Easy they're far out
      // (but not impossible deep in a run). lift/spin/slide can ride the CRITICAL path; wag/orbit are
      // BRANCH-only regardless of unlock.
      unlock: {
        lift:  [0, 0, 0],
        spin:  [400, 250, 0],
        slide: [350, 200, 0],
        wag:   [700, 450, 250],
        orbit: [1200, 700, 400],
      },
      liftAmpFrac: 0.6,    // a lift's amplitude = this fraction of the REMAINING rise headroom (so its
      //                      highest phase stays within jump reach of the previous board — reach-safe).
      slideAmpFrac: 0.6,   // a slide's amplitude = this fraction of the remaining lateral headroom.
      minAmp: 1.0,         // below this a lift/slide is pointless → skip motion (keeps a clean board).
      maxVel: 16,          // CAP on a board's peak velocity (units/sec). peak ≈ amp·2π/period. Above
      //                      this a rising lift outruns the down-ray collision (dt caps at 1/30,
      //                      tolerance ~0.6u) and the ball CLIPS THROUGH the board as it rises into it.
      //                      16 keeps amp·2π/period·(1/30) < 0.6 with margin. Lift amp is clamped to it.
      spinAmp: [0.5, 1.4], // turntable angular amplitude (radians), on the openness ramp.
      branchAmp: [10, 26], // orbit/wag positional amplitude for BRANCH boards (off-path, unconstrained).
    },

    // Hazards — frequency rides the DANGER ramp, output scaled by tier `hazard`
    // (and capped by hazardCeil).
    hazard: {
      obstacleChance: [0.18, 0.7], // barrier / spikes / pillars / overhead
      // (board MOTION moved to its own system — see gen.motion + each tier's motionChance/motionPeriod.
      //  It rides the OPENNESS ramp now, not danger, so movement appears EARLY.)
      sharpTurnChance: [0.08, 0.38], // the path takes a hard lateral jog
      obstacleMoveChance: [0.0, 0.55], // chance a barrier/spike PATROLS along its board
      obstacleMoveAmp: [2, 6.5], // patrol half-range (clamped to fit the board)
      leanChance: [0.05, 0.4], // boards banked left/right; frequency rides danger
      leanAmount: [0.03, 0.22], // the bank's steepness; magnitude grows with openness×drama
    },

    // Drama — the spectacle. Spawn frequency + intensity ride OPENNESS/DANGER, scaled
    // by tier `drama` (Easy calmer, Hard wilder).
    ramp: {
      chance: [0.22, 0.32], // tilted boards you roll up/down (and launch off the top)
      lenBoost: [1.5, 1.0], // ramps run longer than a normal pad (esp. early — relaxed climbs)
      slope: [0.22, 0.42], // rise/run (tan of the ramp angle)
    },
    curve: {
      chance: [0.05, 0.25], // boards curved across their width
      amount: [0.04, 0.14], // parabola steepness, random per board: gentle slope → dramatic half-pipe
    },
    yaw: {
      // A board whose HEADING is turned, so the safe ground veers off diagonally in a
      // straight line — you roll +z but must STRAFE to track it. Capped so
      // forwardSpeed*tan(yaw) stays under sideSpeed (you can always keep up).
      chance: [0.04, 0.32],
      amount: [0.06, 0.28], // tan of the heading angle (~15° at peak)
      lenBoost: 1.4, // yawed boards run longer — a real diagonal runway
    },
    roundGeoChance: [0.04, 0.4], // hex/round pads: rare & small early, common later

    // Tunnels — a short run of glowing rings you roll through. Kept short so the exit
    // is always visible past it. Frequency rides danger × drama.
    tunnel: {
      chance: [0.05, 0.2],
      cooldown: 6, // min normal steps between tunnels
      length: 34,
      rings: 7,
      radius: 4,
    },

    // Spline ribbons — one LONG undulating + meandering heightfield you roll ALONG to
    // the far end before jumping off. A pure heightfield (single surface height per
    // x,z) so the straight-down collision raycast tracks it. Frequency rides danger ×
    // drama; size/intensity rides openness × drama. Everything is clamped by maxSlope
    // so the surface never nears vertical (no fall-through).
    spline: {
      chance: [0.14, 0.4], // chance a non-safe step becomes a ribbon
      cooldown: 7, // min normal steps between ribbons (a real cool-off so they don't chain)
      length: [70, 320], // ribbon length — short-but-interesting early, epic deep in
      width: [22, 12], // WIDE early (easy to stay on), narrower deeper
      segZ: 120, // tessellation along the length (smooth hills even when long)
      segX: 8, // tessellation across the width
      ampY: [7.0, 20.0], // hill/valley height (peak rise)
      wavesY: [1.5, 3.0], // hill+valley cycles along the ribbon (modest = long-wavelength sweeps, not chop)
      meanderX: [8.0, 22.0], // sideways drift of the centerline (peak) — winding but keyboard-manageable
      wavesX: [0.5, 1.2], // left/right swings along the ribbon
      maxSlope: 0.9, // HARD CAP on |dy/dz| (~42°) — steep, dramatic, but above the normal.y>0.1 collision cutoff
    },

    // Item spawn chances not covered above.
    items: {
      flipperChance: 0.03, // chance a non-safe main-path board is a flipper. RARE on purpose: each
      //                      flipper forces a straight+flat landing runway (~300m) so the long arc
      //                      always lands — at 0.08 they fired every ~12 boards and the runways
      //                      TILED the whole run into straight corridors. 0.03 makes the cannon a
      //                      genuine event, not the texture of the level.
      boostChance: 0.1, // chance a non-safe main-path board is an accel plate
      goodChance: [0.6, 0.25], // chance a pickup is GOOD — powerdowns are the majority (dodgeable obstacles), more so deeper in (rides danger)
      gemChance: 0.85, // chance a main-path board carries a gem. HIGH on purpose: a near-continuous
      //                  trail of coins traces the reachable route — an extra "go this way" hint.
    },

    // Rune plates — DISABLED (the aura-cloud floating pickups cover powerups now).
    // Kept wired so they can be re-enabled by raising runeChance.
    rune: {
      chance: [0, 0],
      loadFactor: 0.4, // each active effect cuts the rune chance by this (1 - n*factor)
    },

    // Easy / Medium / Hard — the whole difficulty system is THESE THREE LINES.
    //   pace    — run speed.  hazard — hazard MAGNITUDE (how busy hazards get).
    //   danger  — how FAST hazards ramp in with distance (the new lever: Hard used to
    //             feel like "smooth sailing" for the first ~2km because the danger ramp
    //             barely moved that early — this makes Hard get dangerous SOONER, not
    //             just busier at the plateau).  openness — how fast the field opens.
    //   sprawl  — how WIDE the route/decor roam.  density — how MANY branches (forgiveness).
    //   drama   — spectacle (splines/ramps/curves/yaw/tunnels).
    // diffFloor / diffSpan — the per-board DIFFICULTY BUDGET cap on the CRITICAL path:
    //   criticalCap(z) = diffFloor + danger(z) * diffSpan  (a 0..~1 ceiling boardDifficulty() must
    //   stay under). Easy starts low & rises gently; Hard starts higher & climbs further. The cap
    //   STRIPS decoration (obstacle → motion amp → tilt) once a board's rated difficulty hits it —
    //   it NEVER relaxes the reachability budgets (gaps stay solvable). See gen/difficulty.js.
    //   rank        — 0/1/2 (Easy/Med/Hard); indexes the motion type-unlock distances below.
    //   motionChance— [early, late] chance a non-safe board MOVES, on the DANGER ramp (slow). Early
    //                 aliveness comes from gen.motion.floor (a gentle ambient lift on every tier);
    //                 the extra frequency ramps in slowly so Hard isn't 40%-movers by ~540m. Easier
    //                 tiers plateau LOWER. (Was on openness → too many movers too early on Hard.)
    //   motionPeriod— [early, late] seconds per motion cycle (ramped on DANGER in pickMotion). SLOWER
    //                 early & on easier tiers (period is a master difficulty knob); 2–4s keeps a
    //                 catch window recurring within an airtime for an auto-roller.
    tiers: [
      { name: "Easy",   rank: 0, pace: 0.875, hazard: 0.8, danger: 0.85, openness: 0.9, sprawl: 1.0,  density: 1.6,  drama: 0.7, diffFloor: 0.15, diffSpan: 0.35, motionChance: [0.10, 0.20], motionPeriod: [5.0, 4.0] },
      { name: "Medium", rank: 1, pace: 1.0,  hazard: 1.0, danger: 1.0,  openness: 1.0, sprawl: 1.45, density: 1.0,  drama: 1.0, diffFloor: 0.25, diffSpan: 0.5,  motionChance: [0.13, 0.28], motionPeriod: [4.5, 3.5] },
      { name: "Hard",   rank: 2, pace: 1.15, hazard: 1.7, danger: 1.6,  openness: 1.2, sprawl: 2.1,  density: 0.45, drama: 1.4, diffFloor: 0.35, diffSpan: 0.6,  motionChance: [0.16, 0.40], motionPeriod: [4.0, 3.0] },
    ],
    defaultDifficulty: 1, // index into tiers (Medium)
  },
};

// The zones the run passes through. Every entry is a real, equal zone (no special
// baseline) — a run STARTS in a random one (ZoneSeq below) and flows zone→zone, each
// an announced arrival. Each zone drives every surface at once (ground skin, side
// buildings, sky, run-shape) so it feels like a different world, not a re-tint.
//   fog / sun     — scene fog colour + key-light tint (the overall wash)
//   skylineHue/Spread/Sat/skyline — the side-building window-glow colour + how it cycles.
//                 Spread WIDE + Sat moderate = a lively multi-hue city (Neon City home);
//                 Spread TIGHT + Sat high = one HARD locked colour (Cobalt reads cobalt).
//   skylineVar    — {density, heightScale, gapScale} so even two same-STYLE skylines
//                 (e.g. two "towers" zones) get visibly different walls.
//   moon / nebula — far backdrop body tints
//   bloom         — extra bloom while in this zone
//   accent        — the zone's signature colour (entry title card + the colour-flare)
//   tagline       — the line under the big name on the entry card
//   skylineStyle  — SHAPE of the side buildings: "towers"|"mesas"|"spires"|"monoliths"
//   skin          — the GROUND skin, baked in the zone's colour (this is what makes the
//                 TRACK read as the zone): {pattern, neon, neon2?, panel?}. See
//                 textures.js makeSkinTexture for patterns. THIS replaced the old albedo
//                 tint — the colour is now painted into the texture, not multiplied on.
//   boardMat      — surface of normal decks {roughness, metalness, glow}. `glow` is how
//                 hard the skin SELF-ILLUMINATES (emissive map): high = the deck reads as
//                 NEON and blooms (Neon City, Void, Cobalt); low = nearly matte
//                 (Sunset Dunes). The contrast between blazing and matte zones is a big
//                 part of the differentiation. Special plates keep their own glow.
//   genBias       — how the zone PLAYS: {tunnel, ramp, curve, yaw} frequency multipliers
//                 so each zone has a signature SHAPE (ramps in dunes, tunnels+curves in
//                 ice, twists in void). Capped at 1 → never breaks reachability.
export const BIOMES = [
  // 0 — NEON CITY: the HOME / default look — the classic neon-dusk city with a DYNAMIC
  // multi-hue skyline (the lively cycling window glow). A real named zone you start in,
  // flash into, and return to. Its identity is that SHIFTING colour — vs the themed
  // zones below, which each lock HARD to one colour. Wide skylineSpread = the dynamism;
  // moderate skylineSat keeps it rich without going garish.
  {
    name: "Neon City",
    fog: 0x141a33,
    sun: 0xfff2d6,
    skylineHue: 0.83,
    skylineSpread: 0.18, // WIDE — the signature dynamic multi-hue skyline (cyan↔magenta)
    skylineSat: 0.66,
    skyline: 0xff4bd6,
    moon: 0xbfe3ff,
    nebula: 0x6a7bff,
    bloom: 0.02,
    accent: 0x36d6ff,
    tagline: "where it all begins",
    skylineStyle: "towers",
    skylineVar: { density: 1.2, heightScale: 1.12, gapScale: 0.85 }, // dense, tall downtown
    skin: { pattern: "grid", neon: 0x36e6ff, neon2: 0xff4bd6, panel: 0x123a6e },
    // glow = how hard the skin SELF-ILLUMINATES (emissive map). High here → the grid
    // actually reads as NEON and blooms. (See platforms _addBoard.)
    boardMat: { roughness: 0.34, metalness: 0.18, glow: 0.95 },
    genBias: { tunnel: 1, ramp: 1, curve: 1, yaw: 1 },
  },
  // 1 — SUNSET DUNES: warm amber desert. Matte sandstone planks, golden light. HARD amber.
  {
    name: "Sunset Dunes",
    fog: 0x351a10,
    sun: 0xffae55,
    skylineHue: 0.06,
    skylineSpread: 0.04,
    skylineSat: 0.9,
    skyline: 0xffb04a,
    moon: 0xffcf9a,
    nebula: 0xff9a5a, // coral-amber (was rose-pink) — keeps the whole sky in the warm family
    bloom: 0.08,
    accent: 0xff8a2a,
    tagline: "into the warm horizon",
    skylineStyle: "mesas",
    skylineVar: { heightScale: 0.85 },
    skin: { pattern: "planks", neon: 0xffb24a, neon2: 0xffd24a, panel: 0x3a1c04 }, // gold, off the orange flipper pad
    boardMat: { roughness: 0.92, metalness: 0.02, glow: 0.34 }, // matte, low glow — sun-baked desert, NOT neon (the contrast sells it)
    genBias: { tunnel: 0.5, ramp: 1.8, curve: 0.8, yaw: 1.4 },
  },
  // 2 — ICE CAVERNS: cold crystalline cyan-white. Glassy veined decks, high gloss. HARD icy.
  {
    name: "Ice Caverns",
    fog: 0x0a2a3e,
    sun: 0xd6f0ff,
    skylineHue: 0.52,
    skylineSpread: 0.05,
    skylineSat: 0.62,
    skyline: 0xbdf2ff,
    moon: 0xeaffff,
    nebula: 0x6ad6ff,
    bloom: 0.12,
    accent: 0x7fe6ff, // a touch more saturated than the pale skyline so the entry flash POPS
    tagline: "the frozen deep",
    skylineStyle: "spires",
    skylineVar: { heightScale: 1.15 },
    skin: { pattern: "veins", neon: 0xd6faff, neon2: 0x6fd0ff, panel: 0x0a3850 },
    boardMat: { roughness: 0.12, metalness: 0.45, glow: 0.7 }, // glassy ice — bright cold cracks
    genBias: { tunnel: 2.0, ramp: 0.8, curve: 1.8, yaw: 0.9 },
  },
  // 3 — THE VOID: eerie violet nothingness. Dark rock glowing from within. HARD violet.
  {
    name: "The Void",
    fog: 0x0a0614,
    sun: 0xb06bff,
    skylineHue: 0.74,
    skylineSpread: 0.05,
    skylineSat: 0.8,
    skyline: 0xb060ff,
    moon: 0xcaa6ff,
    nebula: 0x7a3bff,
    bloom: 0.2,
    accent: 0xb060ff,
    tagline: "beyond the edge",
    fovKick: -5, // the camera NARROWS on entry (claustrophobic squeeze) instead of the usual widen
    skylineStyle: "none", // NO buildings — the void is truly empty (no city flanking the track)
    cloudLevel: 0,        // …and no nebula clouds either — empty sky. (The glowing floor stays — it's nice.)
    skylineVar: {},
    skin: { pattern: "pebbles", neon: 0xc070ff, neon2: 0x7a3bff, panel: 0x1c0a3e }, // glowing void-rubble
    boardMat: { roughness: 0.5, metalness: 0.2, glow: 1.0 }, // strongest inner glow — lit slabs floating in the dark
    genBias: { tunnel: 1.4, ramp: 0.7, curve: 1.2, yaw: 1.6 },
  },
  // 4 — COBALT GROOVE (after the track): deep electric cobalt-blue, a tiled plaza that
  // reads like a lit dancefloor. HARD cobalt — tight hue + high saturation so the whole
  // scene (skyline windows, city-light floor) reads unmistakably cobalt, not generic city.
  {
    name: "Cobalt Groove",
    fog: 0x06102e,
    sun: 0x9cc0ff,
    skylineHue: 0.62,
    skylineSpread: 0.025,
    skylineSat: 0.95,
    skyline: 0x2f6bff,
    moon: 0xbcd0ff,
    nebula: 0x2848c8,
    bloom: 0.1,
    accent: 0x2f6bff,
    tagline: "deep in the groove",
    skylineStyle: "towers",
    skylineVar: { density: 0.9, heightScale: 1.0, gapScale: 1.15 }, // distinct from Neon City's dense downtown
    skin: { pattern: "plaza", neon: 0x3f8bff, neon2: 0x00d0ff, panel: 0x0a2060 },
    boardMat: { roughness: 0.28, metalness: 0.3, glow: 0.92 }, // electric cobalt dancefloor
    genBias: { tunnel: 1.1, ramp: 1.0, curve: 1.5, yaw: 1.1 },
  },
  // 5 — VELVET HORIZON (after the track): lush magenta-rose twilight, brick-lit walls.
  // Magenta-PRIMARY (vs Neon City's cyan-leaning dynamic mix), HARD rose.
  {
    name: "Velvet Horizon",
    fog: 0x270a24,
    sun: 0xffb0e0,
    skylineHue: 0.9,
    skylineSpread: 0.05,
    skylineSat: 0.85,
    skyline: 0xff5fb0,
    moon: 0xffc0e6,
    nebula: 0xc04ba0,
    bloom: 0.12,
    accent: 0xff4fa0,
    tagline: "the velvet hour",
    skylineStyle: "mesas",
    skylineVar: { heightScale: 1.05 },
    // Ground neon pushed to a true MAGENTA (+ a warm peach accent) so the deck never
    // shares the rose-PINK of the bouncy pads (0xff5f9e) — readability fix. The sky/fog
    // stay rose, so the zone still reads "velvet". Magenta (~hue .87) also sits clear of
    // the Void's violet (~.76), keeping the two distinct.
    skin: { pattern: "brick", neon: 0xf45fe0, neon2: 0xffb070, panel: 0x36092c },
    boardMat: { roughness: 0.4, metalness: 0.18, glow: 0.78 }, // warm magenta glow
    genBias: { tunnel: 0.8, ramp: 1.3, curve: 1.4, yaw: 1.0 },
  },
];

// Per-RUN zone sequence. Every zone order is a FRESH FULL SHUFFLE each run, so both the STARTING
// zone and the order that follows are random — no fixed "always opens on Neon City / home every 3"
// pattern. Each zone fills one band; the shuffled cycle repeats seamlessly if a run outlasts it.
// Test hooks: `enabled` limits which zones can appear; `forced` pins the WHOLE run to one zone.
export const ZoneSeq = {
  zoneLen: 1250,  // metres each zone fills — long enough to settle in and vibe
  homeIndex: 0,   // Neon City — only used as the fallback if `enabled` filters everything out
  enabled: null,  // Set of zone indices allowed in the rotation (null = all)
  forced: null,   // pin the whole run to this zone index (testing, cheat key C)
  _seq: [],       // this run's zone order
  _cycleLen: 0,

  // Build this run's order: a fresh Fisher–Yates shuffle of ALL zones. The first entry is therefore
  // a RANDOM starting zone, and the rest follow in a random order. Math.random is fine here (per-run;
  // never on the tested generation path).
  build() {
    let all = BIOMES.map((_, i) => i);
    if (this.enabled && this.enabled.size) all = all.filter((i) => this.enabled.has(i));
    if (!all.length) all = [this.homeIndex];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    this._seq = all;
    this._cycleLen = this._seq.length * this.zoneLen;
  },

  zoneAt(z) {
    if (this.forced != null) return this.forced;
    if (!this._seq.length) this.build();
    let p = z % this._cycleLen;
    if (p < 0) p += this._cycleLen;
    return this._seq[Math.floor(p / this.zoneLen) % this._seq.length];
  },
};

export function biomeAt(z) {
  return ZoneSeq.zoneAt(z);
}

// Peak height of a full jump and the air time it grants — the basis for every
// "is the next stepping stone reachable?" calculation in the generator.
export function jumpReach() {
  // Asymmetric gravity: float UP on riseGravity, fall DOWN on the full gravity.
  // Peak height and total air time reflect BOTH so the generator sizes gaps/rises
  // to what the ball can actually clear.
  const v = CONFIG.player.jumpSpeed,
    gUp = CONFIG.player.riseGravity,
    gDown = CONFIG.player.gravity;
  const h = (v * v) / (2 * gUp); // peak rise (taller than a symmetric jump)
  const airTime = v / gUp + Math.sqrt((2 * h) / gDown); // slow rise + faster fall back to launch height
  return { height: h, airTime };
}

// Linear interpolate an [lo, hi] pair by a 0..1 ramp value.
export function ramp(pair, t) {
  return pair[0] + (pair[1] - pair[0]) * t;
}

// Eased 0..1 curve: gentle at the start (and near the peak), steeper in the middle.
// Keeps the opening calm so the game eases the player in.
export function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
