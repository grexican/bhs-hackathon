# G-Roller — Design System

A surreal **neon-dusk endless runner**. You roll a glossy glass-marble ball through
a city floating high above the clouds: dark near-black void below dotted with
distant city lights, a moon and parallax skyline, bloom on everything that glows.
Premium, moody, neon-on-dark. Every surface should feel like a lit slab hanging in
that void — never a flat literal material.

---

## Core palette

All values are already live in the code; this just names them.

### Dark bases (the void everything floats in)
| Token | Hex | Where |
|---|---|---|
| Void black | `#0a0614` | The Void biome fog, deepest backdrop |
| Sky dusk | `#141a33` | Default scene fog / Neon City |
| Panel base | `#0a0d18` | Platform slab body (textures.js) |
| Panel hi / lo | `#141a2e` / `#070912` | Slab gradient ends |
| Obstacle body | `#2a2f3d` | Barriers, posts, pillars |
| Smoke grey | `#494d55` | Fog powerdown tint (under bloom threshold) |

### Neon accents (the life of the world)
| Token | Hex | Used by |
|---|---|---|
| Gem cyan | `#33d0ff` / `#66f0ff` | Gems, shield `#35e0ff`, concrete slabs |
| Hot rose | `#ff1f5a` / `#ff3d7f` | Bouncy plates, brick slabs, danger |
| Boost green | `#39ff7a` / `#1fbf4c` | Boost pads, "go" |
| Amber / gold | `#ffc24a` / `#ffd23b` / `#ff7a1c` | UI accents, edge-lights, wood slabs, flipper |
| Violet | `#8a5bff` / `#6a3bff` / `#b98bff` | Tunnels, marble slabs, Void sun |
| Periwinkle | `#6aa8ff` / `#bfd0ff` | Pebble slabs, rising motes, far city lights |
| Magenta | `#ff4bd6` | Morph/psychedelic powerdowns |

### UI / HUD vars
Gold, cyan, and pink are the three HUD accent families (combo gold, info cyan,
warning/powerdown pink/rose). Keep HUD text on dark, never on a light panel.

---

## Surfaces & materials

- **One slab family.** Every platform texture = shared near-black panel base
  (vertical gradient + fine grain) **+ one neon accent** that identifies the
  material. This is what makes biomes read distinct yet unified.
  - `concrete` → cyan rim + faint grid (the baseline city slab)
  - `brick` → rose neon mortar in a running bond
  - `tile` → teal grout grid, faint lit checker
  - `wood` → amber plank seams + grain streaks
  - `marble` → violet branching light-veins (matches the glass ball)
  - `pebble` → dark stones with periwinkle rim-light
  - `rubber` (bouncy) → hot-pink studs + frame
  - `boost` → green forward chevrons + frame
- **Neon as light-lines, not fills.** Edges glow via a wide soft halo under a
  tight bright core (`neonLine`/`neonFrame`), drawn into the *diffuse* map so they
  read as lit edges without self-blooming and clashing.
- **Glass is the hero material.** The ball is `MeshPhysicalMaterial` with real
  transmission/clearcoat. Marble slabs echo that glass language.
- Platform standard material: `roughness ~0.85` (matte slab), `metalness 0.05`.
  Self-lit plates (boost/bouncy/flipper) carry their glow on `material.emissive`,
  not the texture.

## Emissive & bloom

- Bloom is **tightly thresholded** (`strength 0.6`, `threshold 0.72`): only the
  brightest pixels flare — gems, pickups, boost/bouncy/flipper plates, tunnel
  rings, glowing ball skins. Textured slabs stay crisp.
- Keep ambient/structural neon **below** the bloom threshold; reserve real bloom
  for gameplay-meaningful glow (pickups, hazards, launch plates) so the player's
  eye is always drawn to what matters.
- Fog powerdown cranks bloom (`+0.7`) so lights halo like real fog.

## Lighting & fog

- Hemisphere light `#bcd0ff` over `#202840` (cool sky, warm-dark ground), sun
  `#fff2d6` warm key from upper-left. Moody, low-key — the scene is dark by design.
- Per-biome **fog + sun retint** is the main mood lever (Neon City blue → Sunset
  rose → Ice cyan → Void violet). Fog near/far define how far you see.
- Blackout powerdown dims sky + lights toward black, leaving only emissive edges.

## Typography & HUD

- HUD lives on the dark scene, no panels behind it. Emoji glyphs telegraph every
  pickup (color + shape + glyph). Combo/score in gold, info in cyan, warnings in
  rose. Countdown chips fast-blink in their final 5s.

## Motion

- Everything **drifts**: clouds, skyline parallax, hue-cycling skyline, rising
  motes, slow moon rotation. Nothing is static — the world breathes.
- Game-feel motion is **eased, generous, floaty**: big jump, coyote time, jump
  buffer, eased speed ramps. Surreal-calm, not twitchy.
- Pickups bob + spin; grounded ones bob only slightly so they never sink in.

---

## Punch-list — things that still don't match the system

1. **Classic Gold ball skin is basic/boring.** It's the index-0 default but it's a
   flat lacquered checker — it doesn't read as the glass-marble hero material the
   other skins (Galaxy, Magma, Carbon) established. Consider reworking it as a
   *glass/amber* marble (gold flecks suspended in glass, faint inner amber glow via
   emissive) so the default skin sells the aesthetic on the start screen.
2. **Per-zone "vibe" is too weak.** Biomes only swap fog color, sun color, and the
   texture palette. The four zones (Neon City / Sunset Dunes / Ice Caverns / Void)
   should feel like *different places*: tie each biome's neon-accent family to its
   slabs more strongly, retint the skyline/moon/cloud hue per biome (not just a
   slow global cycle), and give each a signature bloom/fog level. Right now you can
   cross a biome boundary and barely notice.
3. **Skyline hue cycles independently of biome.** `background.js` slowly rainbow-
   cycles the skyline/nebula regardless of zone — it should be *driven by* the
   active biome so the backdrop reinforces the zone instead of fighting it.
4. **Disabled atmosphere layers.** Mist decks + rising motes are coded but hidden
   (`visible = false`) because additive blending read as too busy. They're dead
   weight until re-tuned (lower opacity, non-additive) or removed — decide one way.
5. **Obstacle materials are generic dark+emissive boxes.** Barriers/pillars/posts
   are `#2a2f3d` with a flat emissive tint. They work but don't share the slab's
   neon-edge language — consider a thin neon rim so hazards read as part of the
   same built world.
6. **Tunnel violet vs. marble violet.** Both use violet; make sure the tunnel
   (`#6a3bff`) stays clearly the "portal" violet and marble slabs the "stone"
   violet so they don't blur together when a tunnel sits on marble.
