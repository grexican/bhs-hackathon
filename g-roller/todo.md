# G-Roller — Planning / Backlog

Ideas we've decided to do later (parked here on purpose so the current pass stays
focused on the moment-to-moment experience). Pull any of these forward anytime.

## Fixed

### Ramp collision (FIXED properly — raycast)
Root cause (researcher #2, proven): a SIGN FLIP. Rotating the box by
`+atan(slopeZ)` about +X tilts the forward (+z) edge DOWN, but the analytic
`_topAt` raised it — so the collision plane was tilted the OPPOSITE way from the
mesh (off by up to ~9 units at the ends → clipping). Plus a cos(θ) center-height
offset and unrotated bounds. Fix: replaced the analytic surface with a downward
`THREE.Raycaster` against each platform's `surfaceMesh` (`_floorBelow` in
player.js) — exact height for flat, ramp AND curved boards, one path. Also negated
the ramp mesh rotation (`-atan(slopeZ)`) so slopeZ>0 = uphill forward. Re-enabled
at `rampChance: [0, 0.1]`.

## Deferred (explicitly)

### Momentum / speed expression
Let player input affect forward speed so terrain-reading becomes a skill axis
(right now `v.z = ctx.forwardSpeed` is fully on rails — only steering + jump timing
are skill).
- "Tuck" input: hold a key for a forward burst at the cost of `sideSpeed`.
- Down-ramp momentum: rolling down a `slopeZ < 0` board feeds a transient forward
  speed bonus (mirror of the up-ramp launch we already have via `rampLaunch`).
- ⚠️ Risk: the generator's reachability math (`jumpReach()` → `maxGap`/`maxRise`/
  `maxLateral`) is derived FROM `forwardSpeed`. Variable speed can break the
  "provably solvable" guarantee — needs careful tuning / a clamped bonus band.

### Daily runs (seeded)
A date-seeded "Daily Challenge" so everyone gets the same course and scores are
comparable; store best-of-day in localStorage.
- Gateway refactor: replace every `Math.random()` in `platforms.js` (the
  `rand/randInt/pick/chance` helpers) with an injected seedable PRNG (mulberry32)
  the field owns. `Game` passes a seed (date-string hash for daily, `Date.now()`
  for endless). Generator structure doesn't change.
- This same seedable-RNG refactor is the prerequisite for the Audiosurf swing idea.

## Greenlit — build next (specced this session)

### Difficulty differentiation (Hard ≈ Medium today — root cause found)
`difficultyMult` (Easy 0.55 / Med 1.0 / Hard 1.7) flows ONLY through `_hazRamp`,
which scales the ramp FLOOR and caps at `pair[1]`. So mult only changes how fast
hazards rise early — deep in a run every difficulty converges to the same ceiling,
making Hard and Medium identical on the plateau. Two-part fix:
1. Scale the whole ramp (floor AND ceiling) with a global safety cap:
   `_hazRamp(pair,d){ const lo=pair[0]*mult, hi=pair[1]*mult; return Math.min(ramp([lo,hi],d), CONFIG.hazardCeil); }`
2. Add real per-level levers beyond the single mult: `speedMult` (~0.92/1.0/1.12 —
   speed is THE runner difficulty knob and is currently untouched), maybe `gapMult`
   / narrower pads on Hard.

### Risk/reward multiplier under powerdowns ("multiplier during difficult times")
While powerdowns are active, crank the SCORE multiplier: each active powerdown adds
one, and every powerdown beyond the first adds an extra "stack" bonus on top — so
riding out three at once scores far more than three separately. Plan: a module-level
`BAD_EFFECTS` list + a `_dangerBonus()` in game.js folded into the score-mult used at
`this.score += speed*dt*scorePerMeter*mult` (line ~475), shown in the HUD. New config:
`powerdownMult`, `powerdownStackBonus`. NOT yet implemented.

### Cannon / launcher piece (slingshot/catapult)
A piece you roll INTO that funnels you to a centre, aims upward, and BLASTS you
forward + HIGH (significant air, like the red bouncy squares but a directed launch).
Goal: survive the landing. Likely a new board `type` ("cannon") with a capture +
auto-launch in player.js (reuse the trampoline/`bounceBoost` launch path, add a
forward component + bigger vertical). UX/aesthetic for the funnel still TBD. Spawn
rare, scale presence with difficulty. NOT yet implemented.

### Spline / wave ground (GREENLIT — feasibility study done, LOW–MED)
Undulating terrain is single-height-per-(x,z), which the down-raycast collision
already handles (same as ramps/curves) — ZERO physics/collision changes. Add a
`_makeWaveGeo` builder (displaced PlaneGeometry, `computeVertexNormals`) wired as a
new orthogonal board property next to slope/curve/lean, plus a `waveChance`.
Constraints: start/end flush at local y=0 so exit-height bookkeeping stays valid;
keep amplitude gentle so no face crosses the engine's near-vertical cutoff (else you
fall through). Full report: `tmp/marble-madness-feasibility.md`. NOT yet implemented.

## Backlog (from the design review — considered, not scheduled)

- **Snaking tubes / Marble-Madness ride (DEFERRED — revisit later)** — a tube that
  banks/rises/inverts breaks the engine's "always +z, collide downward" core; needs a
  separate parametric on-rails mode (CatmullRomCurve3, physics suspended, re-seed on
  exit) + a bespoke ride camera. HIGH effort, set-piece only. Note: the current "tube
  tunnel" is purely cosmetic (flat floor + decorative pipe you never touch). Full
  analysis in `tmp/marble-madness-feasibility.md`.

- **Missions / challenge cards** — 3 rotating objectives on the start screen
  ("roll 800 m", "40 gems in a run", "5 near-misses, no death"). Feeds off events
  we already emit. Retention/direction.
- **Ball skins + gem sink** — spend banked gems on skins / trail colors.
  `ballTexture()` is already procedural; parameterize its palette. Gives gems a
  purpose beyond score.
- **Guided onboarding** — replace the controls text-dump with show-don't-tell
  prompts during the `safeStraight` intro that fade once you do each action.
- **Active "power-fantasy" powerup** — e.g. a shockwave that smashes all visible
  obstacles (reuse the shielded-block smash path), or a brief phase-through.
- **Zen mode** — calm, no-death variant (hazard ramp pinned to 0), slow biomes,
  ambient music, persistent day/night; light lifetime-distance meta-progression.
- **Audiosurf mode (big swing)** — generate the course from music. Lighter version:
  sync generation to the existing Web Audio scheduler's beat. Full version: drop
  in an MP3, offline FFT/onset analysis → course. Strongest identity play; large.

## Done (moved out of backlog)
- Combo/score + multiplier + near-miss + audio riser
- Juice: camera lean, hit-stop
- Biomes (themed zones)
- Bloom post-processing + reduced-motion / accessibility
- Music-reactive effect layering (toggleable)
