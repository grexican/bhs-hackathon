import * as THREE from "three";

// Procedural canvas textures for the floating neon-dusk city. These used to be
// literal architecture swatches (red brick, laminated wood, grey concrete) left
// over from a plainer build. They now read as ONE family of dark city slabs:
// every material shares a near-black panel base + faint grain, then layers on its
// own NEON ACCENT (edge frame, grid, seams, studs, veining) so biomes still read
// distinct but unified. Drawn once in code so the web build stays tiny.
//
// The platform material uses these as a diffuse `map` (not emissive), so the
// neon lines don't self-bloom — they read as crisp lit edges that catch the
// scene's lights and sit just under the bloom threshold. Bright self-lit plates
// (boost/bouncy/flipper) still drive their glow via material.emissive elsewhere.

// Shared palette — pulled straight from the rest of the game so the slabs belong
// in the same world as the ball skins, sky and pickups.
const BASE = {
  void: "#0a0d18",     // near-black panel body (kin to sky #141a33 / void #0a0614)
  panelHi: "#141a2e",  // slightly lifted top of the base gradient
  panelLo: "#070912",   // sunk bottom of the base gradient
  seam: "rgba(8,10,18,0.9)", // dark grout between cells
};
// Per-material neon accent (the one colour that tells biomes apart). All drawn
// from the live game palette: gem-cyan, brick-rose, tile-teal, amber, marble-
// violet, pebble-blue, rubber-pink, boost-green.
const NEON = {
  concrete: "#5ad6ff", // cool cyan — the default Neon City slab
  brick:    "#ff3d7f", // hot rose — warm masonry reimagined as a glowing grid
  tile:     "#2fe6c0", // teal — wet tiled plaza
  wood:     "#ff9a3c", // amber — boardwalk planks lit along their seams
  marble:   "#b98bff", // violet — veined glass marble (Void/Ice luxury)
  pebble:   "#6aa8ff", // periwinkle — scattered glowing stones
};

function makeCanvas(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, ctx: c.getContext("2d") };
}

// The shared foundation every slab starts from: a vertical near-black gradient so
// the panel has depth, plus fine grain so it never looks like flat plastic.
function panelBase(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, BASE.panelHi);
  g.addColorStop(0.5, BASE.void);
  g.addColorStop(1, BASE.panelLo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  grain(ctx, s, 900, 0.22);
}

// Sprinkle soft dark noise so flat colours don't look like plastic.
function grain(ctx, size, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = Math.random() * 1.6 + 0.4;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

// Draw a glowing neon stroke: a soft wide halo underneath a tight bright core, so
// the edge reads as emissive light without needing a real emissive map.
function neonLine(ctx, color, x1, y1, x2, y2, core = 2) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.18; ctx.lineWidth = core * 3.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.globalAlpha = 0.95; ctx.lineWidth = core;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

// A glowing inset frame just in from the tile edge — the signature "lit city
// slab" border shared by most materials so the whole set feels related.
function neonFrame(ctx, s, color, inset = 7, core = 2.2) {
  const a = inset, b = s - inset;
  neonLine(ctx, color, a, a, b, a, core);
  neonLine(ctx, color, b, a, b, b, core);
  neonLine(ctx, color, b, b, a, b, core);
  neonLine(ctx, color, a, b, a, a, core);
}

// BOLD readability grid for the GLASS ground tiles. The tile body is see-through
// (you glimpse the city-lights floor far below), so the grid is what keeps the
// platform unmistakably readable: bright, thick neon cell divisions + a heavy
// outer edge frame. Drawn opaque/near-opaque so the lattice always reads as a
// solid lit cage even when the surface behind it is transparent. n = cells/side.
function boldGrid(ctx, s, color, n = 3) {
  const t = s / n;
  ctx.save();
  ctx.lineCap = "square";
  // Inner cell divisions: a wide soft halo under a thick bright core, so each
  // grid line glows like a lit seam (matches the neon family) but stays heavy.
  for (let i = 1; i < n; i++) {
    const p = i * t;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.28; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
  ctx.restore();
  // Heavy outer edge frame so the tile's extent/edges are crystal clear.
  neonFrame(ctx, s, color, 5, 6);
  neonFrame(ctx, s, color, 5, 2.4);
}

// Alpha companion to boldGrid: WHITE where the grid lines + frame are (opaque),
// near-black in the cell interiors (see-through). Used as the material's
// `alphaMap` so the bright lattice stays solid while the cells show the floor
// through them — the lines carry readability, the body is glass. baseCell is the
// cell's residual opacity (a faint glass tint, never fully invisible).
function gridAlphaCanvas(s = 256, n = 3, baseCell = 0.34) {
  const { c, ctx } = makeCanvas(s);
  // Cell interior: a dim grey = partly transparent glass body.
  const v = Math.round(baseCell * 255);
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(0, 0, s, s);
  const t = s / n;
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "square";
  // Grid lines + frame painted opaque-white so they survive as the solid lattice.
  for (let i = 1; i < n; i++) {
    const p = i * t;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
  }
  ctx.lineWidth = 11;
  ctx.strokeRect(5, 5, s - 10, s - 10); // heavy outer edge stays fully opaque
  return c;
}

const PAINTERS = {
  // Default slab: a dark panel rimmed by a cyan light-line with a faint inner
  // grid — the cleanest member of the family, the "Neon City" baseline.
  concrete(ctx, s) {
    panelBase(ctx, s);
    const n = 2, t = s / n;
    ctx.save();
    ctx.strokeStyle = NEON.concrete; ctx.globalAlpha = 0.1; ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(s, i * t); ctx.stroke();
    }
    ctx.restore();
    boldGrid(ctx, s, NEON.concrete, 3); // glass tile: bold readable grid carries the surface
  },

  // Masonry reimagined: dark blocks separated by glowing rose mortar lines in a
  // staggered running bond — the heat of the old brick survives as neon grout.
  brick(ctx, s) {
    panelBase(ctx, s);
    const rows = 5, rh = s / rows, bw = s / 2.5;
    ctx.save();
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      neonLine(ctx, NEON.brick, 0, y, s, y, 1.4);            // horizontal mortar
      const offset = (r % 2) * (bw / 2);
      for (let x = offset; x < s + bw; x += bw) {
        neonLine(ctx, NEON.brick, x, y, x, y + rh, 1.2);     // vertical joints
      }
    }
    ctx.restore();
    boldGrid(ctx, s, NEON.brick, 3); // glass tile: bold readable grid over the masonry
  },

  // Wet boardwalk: dark planks running lengthwise, each seam an amber light-line
  // with the occasional brighter "lit" plank. The grain of the old wood becomes
  // long thin highlight streaks instead of brown lacquer.
  wood(ctx, s) {
    panelBase(ctx, s);
    const planks = 5, pw = s / planks;
    ctx.save();
    for (let p = 0; p <= planks; p++) {
      neonLine(ctx, NEON.wood, p * pw, 0, p * pw, s, 1.6); // seam between planks
    }
    // A few faint lengthwise grain streaks catching the seam light.
    ctx.strokeStyle = NEON.wood; ctx.globalAlpha = 0.07; ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * s;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 8, s); ctx.stroke();
    }
    ctx.restore();
    boldGrid(ctx, s, NEON.wood, 3); // glass tile: bold readable grid over the planks
  },

  // Veined glass marble: dark stone shot through with branching violet light-
  // veins, so it reads as the same kind of glowing glass as the marble ball skin.
  marble(ctx, s) {
    panelBase(ctx, s);
    ctx.save();
    for (let i = 0; i < 9; i++) {
      let x = Math.random() * s, y = 0;
      const pts = [{ x, y }];
      while (y < s) { x += (Math.random() - 0.5) * 46; y += 18; pts.push({ x, y }); }
      ctx.strokeStyle = NEON.marble;
      ctx.globalAlpha = 0.16; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts) ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts) ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    ctx.restore();
    boldGrid(ctx, s, NEON.marble, 3); // glass tile: bold readable grid over the veins
  },

  // Lit plaza tiling: a clean grid of dark tiles, every grout line a teal light-
  // line, with the diagonal tiles faintly brighter so it reads as a wet checker.
  tile(ctx, s) {
    panelBase(ctx, s);
    const n = 4, t = s / n;
    ctx.save();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = NEON.tile; ctx.globalAlpha = 0.06;
        ctx.fillRect(x * t, y * t, t, t); // faint lit checker
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i <= n; i++) {
      neonLine(ctx, NEON.tile, i * t, 0, i * t, s, 1.3);
      neonLine(ctx, NEON.tile, 0, i * t, s, i * t, 1.3);
    }
    ctx.restore();
    boldGrid(ctx, s, NEON.tile, 4); // glass tile: thicken the plaza grid to match the 4-cell checker
  },

  // Scattered glowing stones: dark pebbles, each with a soft periwinkle rim-light
  // catch, clustered on the dark panel — the gravel of the Void, lit from above.
  pebble(ctx, s) {
    panelBase(ctx, s);
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = Math.random() * 9 + 5;
      const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
      g.addColorStop(0, "rgba(40,48,66,0.9)");
      g.addColorStop(1, "rgba(8,10,18,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // Thin rim-light arc on the upper-left of each stone.
      ctx.strokeStyle = NEON.pebble; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r - 1, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    boldGrid(ctx, s, NEON.pebble, 3); // glass tile: bold readable grid over the stones
  },

  // Bouncy board — concentric pink "shockwave" rings rippling out from the centre,
  // like a struck trampoline mat. Reads as SPRINGY at a glance (vs the old flat
  // studs). The material self-glows pink on top of this.
  rubber(ctx, s) {
    panelBase(ctx, s);
    const cx = s / 2, cy = s / 2;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i <= 5; i++) {
      const r = (i / 5) * s * 0.46;
      ctx.strokeStyle = "#ff5f9e";
      ctx.globalAlpha = 0.18; ctx.lineWidth = 9;                 // soft halo
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.lineWidth = 2.4;               // bright core
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = "#ffc0da";
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill(); // bright hit-point
    ctx.restore();
    neonFrame(ctx, s, "#ff4f8a", 6, 2);
  },

  // Flipper / launch pad — bold ORANGE chevrons firing FORWARD (down in canvas),
  // same neon-arrow language as the green boost pad but a different job: this one
  // FLINGS you. Distinct colour + the hinge-kick animation sell the launch.
  flipper(ctx, s) {
    panelBase(ctx, s);
    ctx.fillStyle = "#ffb24a";
    ctx.shadowColor = "#ff7a1c"; ctx.shadowBlur = 24;
    for (let i = 0; i < 3; i++) {
      const y = i * (s / 3) + 12;
      ctx.beginPath();
      ctx.moveTo(s * 0.15, y + 24); ctx.lineTo(s * 0.5, y + 66);
      ctx.lineTo(s * 0.85, y + 24); ctx.lineTo(s * 0.85, y);
      ctx.lineTo(s * 0.5, y + 42); ctx.lineTo(s * 0.15, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
    neonFrame(ctx, s, "#ff7a1c", 6, 2.4);
  },

  // Speed-boost pad — glowing forward chevrons (green = "go fast") on the dark
  // panel. The brightest texture in the set; the boost material adds emissive too.
  boost(ctx, s) {
    panelBase(ctx, s);
    ctx.fillStyle = "#39ff7a";
    ctx.shadowColor = "#39ff7a"; ctx.shadowBlur = 22;
    for (let i = 0; i < 4; i++) {
      const y = i * (s / 4) + 10;
      // Chevrons point DOWN in the canvas, which maps to "forward" on the board.
      ctx.beginPath();
      ctx.moveTo(s * 0.2, y + 16); ctx.lineTo(s * 0.5, y + 46);
      ctx.lineTo(s * 0.8, y + 16); ctx.lineTo(s * 0.8, y);
      ctx.lineTo(s * 0.5, y + 30); ctx.lineTo(s * 0.2, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
    neonFrame(ctx, s, "#39ff7a", 6, 2);
  },

  // Rune plate — a glowing ring-and-spokes sigil on the dark panel, the way a
  // magic floor-rune looks. Painted in near-WHITE so the board's per-rune
  // emissive (cyan = good, amber = bad) tints the whole glow; the glyph of the
  // effect is dropped on top as a separate sprite by the platform builder.
  rune(ctx, s) {
    panelBase(ctx, s);
    const cx = s / 2, cy = s / 2;
    ctx.strokeStyle = "#eef4ff";
    ctx.shadowColor = "#eef4ff"; ctx.shadowBlur = 26;
    // Two concentric rings.
    for (const r of [s * 0.4, s * 0.27]) {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    // Radiating spokes between the rings — the "engraved sigil" look.
    ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.27, cy + Math.sin(a) * s * 0.27);
      ctx.lineTo(cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.4);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    neonFrame(ctx, s, "#eef4ff", 6, 2);
  },
};

// How many grid cells each ground texture is divided into — the alpha lattice
// has to line up with the painter's own grid. `tile` is a 4-cell plaza; the rest
// share the default 3-cell bold grid.
const GRID_CELLS = { tile: 4 };

// Build one base texture per material, cached. Platforms clone these (cheap —
// the clone shares the bitmap) and set their own tiling repeat. Ground materials
// also get a matching `alphaMap` (`<name>Alpha`) so the GLASS tiles keep their
// bright grid lattice solid while the cells go see-through.
export function makeTextureLibrary() {
  const lib = {};
  for (const [name, paint] of Object.entries(PAINTERS)) {
    const { c, ctx } = makeCanvas(256);
    paint(ctx, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    lib[name] = tex;
  }
  // One alpha lattice per ground texture: lines/frame opaque, cells transparent.
  for (const name of GROUND_TEXTURES) {
    const a = new THREE.CanvasTexture(gridAlphaCanvas(256, GRID_CELLS[name] || 3));
    a.wrapS = a.wrapT = THREE.RepeatWrapping;
    a.anisotropy = 4;
    lib[`${name}Alpha`] = a;
  }
  return lib;
}

// Material keys used for ordinary, safe-to-land platforms.
export const GROUND_TEXTURES = ["brick", "wood", "marble", "tile", "pebble", "concrete"];

// ===========================================================================
// Per-ZONE board SKINS (config-driven). Instead of every zone sharing the fixed
// texture library (same dark panels, same colours — which is why zones read the
// same), each zone supplies a `skin` { pattern, neon, neon2, panel } and we bake a
// dedicated ground texture in THAT zone's colour. So the track itself is the zone's
// colour, with the zone's pattern — the single strongest "different world" cue.
//   pattern — "grid" | "brick" | "planks" | "veins" | "pebbles" | "plaza" | "circuit"
//   neon    — the primary glow colour baked into the lines/accents
//   neon2   — optional second glow (e.g. City's cyan grid with magenta cross-lines)
//   panel   — optional hex tint blended into the near-black panel base (warms/cools it)
// ===========================================================================
const hexCss = (n) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");

// Panel base with an optional colour wash so the slab body itself reads warm (dunes)
// or cool (ice/void), not just the neon lines.
function tintedPanel(ctx, s, panelHex) {
  panelBase(ctx, s);
  if (panelHex != null) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = hexCss(panelHex);
    ctx.fillRect(0, 0, s, s);
    ctx.restore();
  }
}

// Each pattern draws its motif in the zone's neon colour (c1) with an optional accent
// (c2). They mirror the look of the original named painters but take the colour as a
// parameter, so the SAME pattern can be any zone's colour.
const SKIN_PATTERNS = {
  // NEON CITY's signature deck: a patterned-NEON grid — glowing two-tone (cyan + magenta) division
  // lines plus glowing inset neon squares in each cell, so the home-zone boards read as lit neon
  // panels (the "more neon" the zone name promises). Deliberately distinct from the AMBER emergency
  // wireframe that only appears during a blackout — this is colourful, always-on surface detail.
  grid(ctx, s, c1, c2) {
    const n = 2, t = s / n;
    ctx.save();
    // Glowing division lines (halo + bright core), alternating the two zone hues.
    for (let i = 1; i < n; i++) {
      neonLine(ctx, c1, i * t, 0, i * t, s, 1.5);
      neonLine(ctx, c2 || c1, 0, i * t, s, i * t, 1.5);
    }
    // Inset neon squares — the patterned-neon surface detail, alternating cyan / magenta per cell.
    const inset = s * 0.14;
    for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
      const col = (gx + gy) % 2 === 0 ? c1 : (c2 || c1);
      const x0 = gx * t + inset, y0 = gy * t + inset, sz = t - inset * 2;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.16; ctx.lineWidth = 5; ctx.strokeRect(x0, y0, sz, sz);   // soft halo
      ctx.globalAlpha = 0.85; ctx.lineWidth = 1.4; ctx.strokeRect(x0, y0, sz, sz); // bright core
    }
    ctx.restore();
  },
  // A finer "circuit" lattice: a tight grid + a few brighter trace runs. Reads techy.
  circuit(ctx, s, c1, c2) {
    ctx.save();
    ctx.globalAlpha = 0.12; ctx.lineWidth = 1; ctx.strokeStyle = c1;
    for (let i = 1; i < 6; i++) {
      const p = (i / 6) * s;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const y = Math.random() * s;
      neonLine(ctx, c2 || c1, 0, y, s, y + (Math.random() - 0.5) * 30, 1.2);
    }
  },
  brick(ctx, s, c1) {
    const rows = 5, rh = s / rows, bw = s / 2.5;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      neonLine(ctx, c1, 0, y, s, y, 1.4);
      const offset = (r % 2) * (bw / 2);
      for (let x = offset; x < s + bw; x += bw) neonLine(ctx, c1, x, y, x, y + rh, 1.2);
    }
  },
  planks(ctx, s, c1) {
    const planks = 5, pw = s / planks;
    for (let p = 0; p <= planks; p++) neonLine(ctx, c1, p * pw, 0, p * pw, s, 1.6);
    ctx.save(); ctx.strokeStyle = c1; ctx.globalAlpha = 0.07; ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) { const x = Math.random() * s; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 8, s); ctx.stroke(); }
    ctx.restore();
  },
  veins(ctx, s, c1) {
    ctx.save();
    for (let i = 0; i < 9; i++) {
      let x = Math.random() * s, y = 0; const pts = [{ x, y }];
      while (y < s) { x += (Math.random() - 0.5) * 46; y += 18; pts.push({ x, y }); }
      ctx.strokeStyle = c1;
      ctx.globalAlpha = 0.16; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const pt of pts) ctx.lineTo(pt.x, pt.y); ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const pt of pts) ctx.lineTo(pt.x, pt.y); ctx.stroke();
    }
    ctx.restore();
  },
  plaza(ctx, s, c1) {
    const n = 4, t = s / n;
    ctx.save();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if ((x + y) % 2 === 0) { ctx.fillStyle = c1; ctx.globalAlpha = 0.06; ctx.fillRect(x * t, y * t, t, t); }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i <= n; i++) { neonLine(ctx, c1, i * t, 0, i * t, s, 1.3); neonLine(ctx, c1, 0, i * t, s, i * t, 1.3); }
    ctx.restore();
  },
  pebbles(ctx, s, c1) {
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = Math.random() * 9 + 5;
      const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
      g.addColorStop(0, "rgba(40,48,66,0.9)"); g.addColorStop(1, "rgba(8,10,18,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c1; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r - 1, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },
};

// Build a ground texture for a zone skin. Cheap (one 256² canvas); platforms cache one
// per zone and clone it (sharing the bitmap) for each board's tiling repeat.
export function makeSkinTexture({ pattern = "grid", neon = 0x5ad6ff, neon2 = null, panel = null } = {}) {
  const { c, ctx } = makeCanvas(256);
  tintedPanel(ctx, 256, panel);
  const c1 = hexCss(neon), c2 = neon2 != null ? hexCss(neon2) : c1;
  (SKIN_PATTERNS[pattern] || SKIN_PATTERNS.grid)(ctx, 256, c1, c2);
  boldGrid(ctx, 256, c1, pattern === "plaza" ? 4 : 3); // the bold readable cell grid, in the zone's colour
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
