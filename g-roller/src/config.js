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
    forwardSpeed: 24, // starting auto-run speed (eases up from here)
    maxForwardSpeed: 63,
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
    bounce: { boost: 1.7 }, // launch velocity = player.jumpSpeed * this
    // Flipper plate (orange): a hinged springboard that sends you up AND forward.
    flipper: {
      vertical: 1.75, // launch v.y = player.jumpSpeed * this (big air — it's a CANNON)
      forward: 95, // forward speed BLAST injected on launch
      maxSpeed: 150, // the flipper launch can fling you this fast (vs the normal ~111 ceiling)
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
    // Death: game over only once you fall this far below the LOWEST landable surface
    // still drawn near you. Deep, so a near-miss is a long recoverable plunge.
    fallMargin: 42,
    fallDeathHang: 10, // hard cap (s) on the fall-death cinematic
    starterLength: 64,
    starterWidth: 18,
    // Base auto-run speed nudges up slowly with distance (keeps the early game relaxed).
    speedRampEvery: 20, // metres between nudges
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
    dangerDistance: 8000, // metres for hazards to peak — long & gentle so a run is a "mood", not a panic
    hazardCeil: 0.92, // global cap on any hazard chance after the tier's `hazard` mult (so Hard stays < 100%)
    safeStraight: 2, // the first N steps run straight ahead (ease-in) before anything opens up

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
      lateralFrac: [0.35, 0.85], // how much of the reachable strafe a step may use
      riseFrac: [0.35, 0.85], // how much of the reachable rise a step may use
      dropDepth: [-4, -10], // how far a step may drop
      // Spread is wide even at the START (high low-ends) so the field reads as "go
      // anywhere" from the first jump, not a tight cluster that slowly opens up.
      bandX: [55, 120], // how far the path may wander left/right (× tier sprawl)
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
      // SPREAD is kept inside JUMP REACH so a branch is a real ALTERNATE ROUTE, not
      // unreachable backdrop. One jump strafes ~65 units laterally (jumpReach), so the
      // radius (× the gentled sprawl factor below) tops out around there even on Hard —
      // the farthest branch is a committed jump, most are comfortable. Was [40,110]×1.55
      // ≈ ±170 on Hard, which flung every branch out of bounds ("might as well not move
      // for it").
      radiusX: [22, 50], // how wide the cloud scatters (× gentled sprawl) — within reach
      radiusY: [16, 40], // how tall the cloud scatters (× gentled sprawl; parallax layers)
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

    // Hazards — frequency rides the DANGER ramp, output scaled by tier `hazard`
    // (and capped by hazardCeil).
    hazard: {
      obstacleChance: [0.18, 0.7], // barrier / spikes / pillars / overhead
      movingChance: [0.2, 0.7], // boards that slide/lift
      moveAmp: [4, 12], // how far movers travel
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
      flipperChance: 0.08, // chance a non-safe main-path board is a flipper (rare, not gated by tier)
      boostChance: 0.1, // chance a non-safe main-path board is an accel plate
      goodChance: [0.6, 0.25], // chance a pickup is GOOD — powerdowns are the majority (dodgeable obstacles), more so deeper in (rides danger)
      gemChance: 0.4, // chance a main-path board carries a gem
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
    tiers: [
      { name: "Easy", pace: 0.92, hazard: 0.8, danger: 0.85, openness: 0.9, sprawl: 1.0, density: 1.6, drama: 0.7 },
      { name: "Medium", pace: 1.0, hazard: 1.0, danger: 1.0, openness: 1.0, sprawl: 1.45, density: 1.0, drama: 1.0 },
      { name: "Hard", pace: 1.15, hazard: 1.7, danger: 1.6, openness: 1.2, sprawl: 2.1, density: 0.45, drama: 1.4 },
    ],
    defaultDifficulty: 1, // index into tiers (Medium)
  },
};

// The zones the run passes through. Every entry is a real, equal zone (no special
// baseline) — a run STARTS in a random one (ZoneSeq below) and flows zone→zone, each
// an announced arrival. Each zone drives every surface at once (ground skin, side
// buildings, sky, run-shape) so it feels like a different world, not a re-tint.
//   fog / sun     — scene fog colour + key-light tint (the overall wash)
//   skylineHue/Spread/skyline — the side-building window-glow colour + how it cycles
//   moon / nebula — far backdrop body tints
//   bloom         — extra bloom while in this zone
//   accent        — the zone's signature colour (entry title card + the colour-flare)
//   tagline       — the line under the big name on the entry card
//   skylineStyle  — SHAPE of the side buildings: "towers"|"mesas"|"spires"|"monoliths"
//   skin          — the GROUND skin, baked in the zone's colour (this is what makes the
//                 TRACK read as the zone): {pattern, neon, neon2?, panel?}. See
//                 textures.js makeSkinTexture for patterns. THIS replaced the old albedo
//                 tint — the colour is now painted into the texture, not multiplied on.
//   boardMat      — surface FEEL of normal decks {roughness, metalness, emissive,
//                 emissiveIntensity}: matte sand vs glossy ice vs glowing void. (No
//                 tint — the skin carries colour.) Special plates keep their own glow.
//   genBias       — how the zone PLAYS: {tunnel, ramp, curve, yaw} frequency multipliers
//                 so each zone has a signature SHAPE (ramps in dunes, tunnels+curves in
//                 ice, twists in void). Capped at 1 → never breaks reachability.
export const BIOMES = [
  // 0 — THE CONSTRUCT: a stark chrome/blueprint world — crisp white circuitry on near-
  // black. The ACHROMATIC zone (its identity is the absence of colour), so it still
  // reads distinct among the saturated zones, but it's a real, announced zone like any
  // other — it can be where a run starts.
  {
    name: "The Construct",
    fog: 0x141821,
    sun: 0xe6edf6,
    skylineHue: 0.58,
    skylineSpread: 0.05,
    skyline: 0xd6e2f2,
    moon: 0xdce6f2,
    nebula: 0x8aa0c0,
    bloom: 0.04,
    accent: 0xd6e6f6,
    tagline: "inside the machine",
    skylineStyle: "towers",
    skin: { pattern: "circuit", neon: 0xd6e2f2, neon2: 0x9fb8d8, panel: 0x0b0f18 },
    boardMat: { roughness: 0.3, metalness: 0.35, emissive: 0x0c141f, emissiveIntensity: 0.1 },
    genBias: { tunnel: 1, ramp: 1, curve: 1, yaw: 1 },
  },
  // 1 — NEON CITY: the vivid home zone. Cyan circuitry shot through with hot magenta —
  // the floor-light + window colours of the base game, turned up.
  {
    name: "Neon City",
    fog: 0x0e0a26,
    sun: 0xfff2d6,
    skylineHue: 0.83,
    skylineSpread: 0.16,
    skyline: 0xff3df0,
    moon: 0xbfe3ff,
    nebula: 0x6a7bff,
    bloom: 0.06,
    accent: 0x00e6ff,
    tagline: "neon never sleeps",
    skylineStyle: "towers",
    skin: { pattern: "circuit", neon: 0x00e6ff, neon2: 0xff3df0, panel: 0x0a0d22 },
    boardMat: { roughness: 0.32, metalness: 0.2, emissive: 0x0a1830, emissiveIntensity: 0.14 },
    genBias: { tunnel: 1, ramp: 1, curve: 1, yaw: 1 },
  },
  // 2 — SUNSET DUNES: warm amber desert. Matte sandstone planks, golden light.
  {
    name: "Sunset Dunes",
    fog: 0x351a10,
    sun: 0xffae55,
    skylineHue: 0.06,
    skylineSpread: 0.06,
    skyline: 0xffb04a,
    moon: 0xffcf9a,
    nebula: 0xff6a8a,
    bloom: 0.08,
    accent: 0xff8a2a,
    tagline: "into the warm horizon",
    skylineStyle: "mesas",
    skin: { pattern: "planks", neon: 0xff8a2a, neon2: 0xffd24a, panel: 0x231006 },
    boardMat: { roughness: 0.92, metalness: 0.02, emissive: 0x2a1000, emissiveIntensity: 0.14 },
    genBias: { tunnel: 0.5, ramp: 1.8, curve: 0.8, yaw: 1.4 },
  },
  // 3 — ICE CAVERNS: cold crystalline cyan-white. Glassy veined decks, high gloss.
  {
    name: "Ice Caverns",
    fog: 0x0a2a3e,
    sun: 0xd6f0ff,
    skylineHue: 0.52,
    skylineSpread: 0.08,
    skyline: 0xbdf2ff,
    moon: 0xeaffff,
    nebula: 0x6ad6ff,
    bloom: 0.12,
    accent: 0xbdf2ff,
    tagline: "the frozen deep",
    skylineStyle: "spires",
    skin: { pattern: "veins", neon: 0xbdf2ff, neon2: 0x6fd0ff, panel: 0x07202e },
    boardMat: { roughness: 0.12, metalness: 0.45, emissive: 0x103a52, emissiveIntensity: 0.26 },
    genBias: { tunnel: 2.0, ramp: 0.8, curve: 1.8, yaw: 0.9 },
  },
  // 4 — THE VOID: eerie violet nothingness. Dark rock glowing from within.
  {
    name: "The Void",
    fog: 0x0a0614,
    sun: 0xb06bff,
    skylineHue: 0.74,
    skylineSpread: 0.1,
    skyline: 0xb060ff,
    moon: 0xcaa6ff,
    nebula: 0x7a3bff,
    bloom: 0.2,
    accent: 0xb060ff,
    tagline: "beyond the edge",
    skylineStyle: "monoliths",
    skin: { pattern: "pebbles", neon: 0xb060ff, neon2: 0xff5fd0, panel: 0x0a0614 }, // scattered glowing void-rubble
    boardMat: { roughness: 0.5, metalness: 0.2, emissive: 0x3a1f7a, emissiveIntensity: 0.42 },
    genBias: { tunnel: 1.4, ramp: 0.7, curve: 1.2, yaw: 1.6 },
  },
  // 5 — COBALT GROOVE (after the track): deep electric cobalt-blue, a tiled plaza that
  // reads like a lit dancefloor. Distinct from the icy white-cyan by being saturated +
  // deep, with a checkerboard rhythm.
  {
    name: "Cobalt Groove",
    fog: 0x081230,
    sun: 0xaecbff,
    skylineHue: 0.62,
    skylineSpread: 0.07,
    skyline: 0x3a7bff,
    moon: 0xbcd0ff,
    nebula: 0x3050d0,
    bloom: 0.1,
    accent: 0x3a7bff,
    tagline: "deep in the groove",
    skylineStyle: "towers",
    skin: { pattern: "plaza", neon: 0x2f6bff, neon2: 0x00d0ff, panel: 0x060c22 },
    boardMat: { roughness: 0.28, metalness: 0.3, emissive: 0x0a1a44, emissiveIntensity: 0.2 },
    genBias: { tunnel: 1.1, ramp: 1.0, curve: 1.5, yaw: 1.1 },
  },
  // 6 — VELVET HORIZON (after the track): lush magenta-rose twilight, brick-lit walls.
  // Magenta-PRIMARY (vs Neon City's cyan-primary with a magenta accent), so the two
  // never read the same.
  {
    name: "Velvet Horizon",
    fog: 0x270a24,
    sun: 0xffb0e0,
    skylineHue: 0.9,
    skylineSpread: 0.08,
    skyline: 0xff5fb0,
    moon: 0xffc0e6,
    nebula: 0xc04ba0,
    bloom: 0.12,
    accent: 0xff4fa0,
    tagline: "the velvet hour",
    skylineStyle: "mesas",
    skin: { pattern: "brick", neon: 0xff4fa0, neon2: 0xffa0d6, panel: 0x1c0816 },
    boardMat: { roughness: 0.4, metalness: 0.18, emissive: 0x2e0a22, emissiveIntensity: 0.2 },
    genBias: { tunnel: 0.8, ramp: 1.3, curve: 1.4, yaw: 1.0 },
  },
];

// Per-RUN zone sequence. Zones no longer sit at fixed distances in a fixed order: the
// run OPENS on the neutral baseline (zone 0), then crosses the THEMED zones in a
// RANDOMISED order (so you don't always hit the same one next), each filling one band.
// Test hooks: `enabled` limits which themed zones can appear (cheat toggles, like the
// powerup picker); `forced` pins the WHOLE run to one zone so you can study it.
export const ZoneSeq = {
  zoneLen: 1250,  // metres each zone fills — long enough to settle in and vibe
  enabled: null,  // Set of zone indices allowed in the random rotation (null = all)
  forced: null,   // pin the whole run to this zone index (testing, cheat key C)
  _seq: [],       // this run's zone order (every zone, shuffled)
  _cycleLen: 0,

  // Reshuffle every zone into a fresh random order for this run (call from game reset).
  // No special baseline — the run STARTS in whatever lands first (_seq[0]), and zones
  // flow zone→zone, each an announced arrival. Math.random is fine here (per-run only,
  // never on the unit-tested generator path).
  build() {
    let pool = BIOMES.map((_, i) => i);
    if (this.enabled && this.enabled.size) pool = pool.filter((i) => this.enabled.has(i));
    if (!pool.length) pool = BIOMES.map((_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this._seq = pool;
    this._cycleLen = pool.length * this.zoneLen;
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
