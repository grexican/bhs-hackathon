# G-Roller — Planning / Backlog

Ideas we've decided to do later (parked here on purpose so the current pass stays
focused on the moment-to-moment experience). Pull any of these forward anytime.

## Known bugs

### Ramp collision doesn't follow the slant
Ramps are visually tilted (`_addBoard` rotates the mesh by `atan(slopeZ)`) but the
player falls through instead of rolling up/down. The ground-follow in
`player.js` uses `_topAt` (which adds `slopeZ * (z - pos.z)`), so the math is
there — likely the `wasAbove`/landing-tolerance logic doesn't hug the rising
surface, or the entry handoff from the previous board is off. Currently DISABLED
via `rampChance: [0,0]`. Re-enable and fix together (curved boards are fine).

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

## Backlog (from the design review — considered, not scheduled)

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
