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
    neonFrame(ctx, s, NEON.concrete, 8, 2);
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
    neonFrame(ctx, s, NEON.marble, 9, 1.6);
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
  },

  // "Round dot rubber" — the bouncy board. Bright pink studs on the dark panel.
  // Kept punchy (the material below also self-glows) but now sits on the shared
  // base with a hot frame so it belongs to the family.
  rubber(ctx, s) {
    panelBase(ctx, s);
    const n = 5, t = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const cx = x * t + t / 2, cy = y * t + t / 2;
      const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, t * 0.5);
      halo.addColorStop(0, "rgba(255,107,157,0.45)");
      halo.addColorStop(1, "rgba(255,107,157,0)");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, t * 0.5, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, t * 0.34);
      g.addColorStop(0, "#ff8fb6");
      g.addColorStop(1, "#d11e57");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, t * 0.32, 0, Math.PI * 2); ctx.fill();
    }
    neonFrame(ctx, s, "#ff4f8a", 6, 2);
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
};

// Build one base texture per material, cached. Platforms clone these (cheap —
// the clone shares the bitmap) and set their own tiling repeat.
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
  return lib;
}

// Material keys used for ordinary, safe-to-land platforms.
export const GROUND_TEXTURES = ["brick", "wood", "marble", "tile", "pebble", "concrete"];
