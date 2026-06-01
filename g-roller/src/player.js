import * as THREE from "three";
import { CONFIG } from "./config.js";
import { iconCanvas } from "./icons.js";
import { POWERUP_DEFS } from "./platforms.js";

const ONE = new THREE.Vector3(1, 1, 1);

// Effects without a dedicated mesh get an orbiting glyph around the ball so you
// can always see what you've got running. (flight=wings, doublejump=board,
// shield=bubble are shown separately.)
// Only the effects you can't otherwise see/feel get an orbit glyph. The visible
// ones (morph wobble, trip rainbow, lowgrav float, flubber bounce, blackout dark,
// fog) are dropped here — they still show as countdown chips in the HUD.
const ORBIT_KEYS = ["magnet", "slow", "reverse", "surge"];
const ORBIT_RING_SEG = 48; // segments in a glyph's depletion ring

// Selectable ball skins (chosen in the ⚙️ panel). Each entry names a procedural
// `pattern` (drawn by ballTexture below) plus the colours that pattern needs.
// Every entry MUST keep a `name` (the menu reads it). Index 0 stays classic gold.
// `glassy` flags a marble where the WHOLE sphere is translucent glass (Galaxy:
// the star/nebula art glows from within). `glassZones` flags a marble where only
// the SOLID coloured zones (flames, stripe, dots) stay opaque and everything else
// is see-through glass — driven by an alpha mask the texture function also draws.
export const BALL_SKINS = [
  { name: "Classic Gold", pattern: "checker", light: "#ffd24a", dark: "#f2a922", line: "rgba(70,48,12,0.45)" },
  { name: "Racing Stripe", pattern: "stripes", light: "#f5f5f5", dark: "#d11321", accent: "#101010", glassZones: true },
  { name: "Galaxy",       pattern: "galaxy",  light: "#7b4bff", dark: "#04030f", accent: "#ffffff", glassy: true },
  { name: "Carbon",       pattern: "carbon",  light: "#454b54", dark: "#101216", accent: "#8a93a3" },
  { name: "Hazard",       pattern: "hazard",  light: "#fff200", dark: "#141414" },
  { name: "Magma",        pattern: "flames",  light: "#fff3a0", dark: "#140201", accent: "#ff7314", glassZones: true },
  { name: "Bubblegum",    pattern: "dots",    light: "#ffb0e8", dark: "#ff4fd0", accent: "#ffd6fb", glassZones: true },
];

// Tiny deterministic PRNG so "random" speckles (stars, carbon flecks) look the
// same every redraw and seam up nicely — seeded per skin pattern.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws a distinct 256x256 procedural pattern per skin and returns a sphere
// texture. Patterns are built to tile across the 256-wide wrap so the vertical
// seam isn't jarring (counts divide evenly; full-canvas fills hide it best).
//
// `mode` picks WHICH map this canvas becomes:
//   "color"    — the visible diffuse surface (default).
//   "alpha"    — a black/white mask for glass-zone skins: WHITE = solid/opaque,
//                BLACK = see-through glass. Fed to material.alphaMap so the gaps
//                between flames/stripes/dots actually vanish into the glass.
//   "emissive" — for the galaxy: the same dark star art, used as emissiveMap so
//                only the stars/nebula glow from within the marble.
function ballTexture(skin = BALL_SKINS[0], mode = "color") {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const alpha = mode === "alpha"; // drawing the opacity mask, not the colour

  switch (skin.pattern) {
    case "stripes": {
      // Racing livery: crisp white field, two bold red center stripes flanked by
      // sharp black pinstripes, plus a thin checkered band — clearly NOT fire.
      // In alpha mode the SOLID livery (stripes + pinstripes + checker band) is
      // white (opaque) and the white "field" is left black (transparent glass).
      if (alpha) { ctx.fillStyle = "#5a5a5a"; ctx.fillRect(0, 0, S, S); } // ~0.35 body so it stays visible over bright tiles
      else { ctx.fillStyle = skin.light; ctx.fillRect(0, 0, S, S); }
      // Two vertical red bands (tile cleanly: centered + wrapped at the seam halves).
      const stripeW = S * 0.16, gap = S * 0.06;
      const centers = [S * 0.5, 0]; // one mid-band, one straddling the wrap seam
      for (const cx of centers) {
        // Red core stripe.
        ctx.fillStyle = alpha ? "#fff" : skin.dark;
        ctx.fillRect(cx - stripeW / 2, 0, stripeW, S);
        // Black sharp pinstripes hugging each edge of the red.
        ctx.fillStyle = alpha ? "#fff" : skin.accent;
        ctx.fillRect(cx - stripeW / 2 - gap, 0, gap * 0.5, S);
        ctx.fillRect(cx + stripeW / 2 + gap * 0.5, 0, gap * 0.5, S);
      }
      // A thin checkered accent band across the equator (race-flag flavour).
      const cb = 12, by = S * 0.5 - cb / 2;
      for (let x = 0; x < S; x += cb) {
        if (alpha) ctx.fillStyle = "#fff"; // whole band stays solid in the marble
        else ctx.fillStyle = (x / cb) % 2 === 0 ? skin.accent : skin.light;
        ctx.fillRect(x, by, cb, cb);
      }
      break;
    }
    case "galaxy": {
      // Near-solid star-marble: near-black void, layered nebula clouds and bright
      // glowing stars. The SAME composition is reused three ways:
      //   color    — the visible dark surface.
      //   emissive — stars/nebula glow from within.
      //   alpha    — brightness → opacity, clamped to [0.8, 1]: bright stars/nebula
      //              are fully opaque, the darkest void is only ~20% see-through.
      //              (alphaMap reads the green channel, so we draw the brightness as
      //              grey on a 0.8 floor; void=204/255≈0.8, peaks=255=1.0.)
      if (alpha) {
        // Floor = 0.8 opacity everywhere; brightness is ADDED so only the lit bits
        // climb toward fully opaque. Cap so nothing dips below the 0.8 floor.
        ctx.fillStyle = "#cccccc"; ctx.fillRect(0, 0, S, S); // 204 ≈ 0.8
      } else {
        ctx.fillStyle = skin.dark; ctx.fillRect(0, 0, S, S);
      }
      const rnd = mulberry32(7);
      // Soft coloured nebula blobs (additive) so depth reads inside the glass.
      const clouds = [
        ["rgba(123,75,255,0.55)", 0.6, 0.4],
        ["rgba(255,90,200,0.40)", 0.35, 0.65],
        ["rgba(60,160,255,0.35)", 0.78, 0.72],
      ];
      ctx.globalCompositeOperation = "lighter";
      for (const [col, fx, fy] of clouds) {
        const cx = fx * S, cy = fy * S, rad = S * (0.3 + rnd() * 0.2);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        // Alpha pass: same blobs as grey brightness so nebula lifts opacity (not hue).
        rg.addColorStop(0, alpha ? "rgba(255,255,255,0.4)" : col);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
      }
      ctx.globalCompositeOperation = "source-over";
      // Stars: small bright cores with a faint halo so they glow. The emissive
      // pass pushes brighter/bigger halos so the sparkle truly blooms from within.
      const starCount = mode === "emissive" ? 300 : 260;
      for (let i = 0; i < starCount; i++) {
        const x = rnd() * S, y = rnd() * S, r = rnd() * 1.7 + 0.4;
        const hot = rnd() > 0.85; // a few big "lens-flare" stars
        const rr = hot ? r + 2 : r;
        const haloR = rr * (mode === "emissive" ? 4 : 3);
        const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
        halo.addColorStop(0, "rgba(255,255,255,0.95)");
        halo.addColorStop(0.4, "rgba(180,200,255,0.45)");
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(x, y, haloR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = skin.accent;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "carbon": {
      // Premium carbon-fibre twill: tight 2x2 weave of strongly beveled cells with
      // deep black valleys and bright edge catches, a faint blue-grey iridescence
      // baked into the weave, and a sharp specular sheen band raking across it.
      ctx.fillStyle = "#0a0c10"; ctx.fillRect(0, 0, S, S);
      const cell = 16;
      for (let y = 0; y < S; y += cell) for (let x = 0; x < S; x += cell) {
        // 2x2 twill: shift the diagonal direction every other 2-cell block.
        const block = (Math.floor(x / cell) + Math.floor(y / cell));
        const woven = block % 2 === 0;
        const grad = ctx.createLinearGradient(x, y, x + cell, y + cell);
        // Stronger contrast: bright tow highlight → mid grey → near-black valley.
        if (woven) { grad.addColorStop(0, "#9aa3b2"); grad.addColorStop(0.45, skin.light); grad.addColorStop(1, "#05060a"); }
        else { grad.addColorStop(0, "#05060a"); grad.addColorStop(0.55, skin.dark); grad.addColorStop(1, "#9aa3b2"); }
        ctx.fillStyle = grad; ctx.fillRect(x, y, cell - 1, cell - 1);
        // Sharp specular catch on the lit edge of each tow for that woven glint.
        ctx.fillStyle = "rgba(190,205,230,0.35)";
        if (woven) ctx.fillRect(x, y, cell - 1, 1.5);
        else ctx.fillRect(x, y + cell - 2.5, cell - 1, 1.5);
      }
      // Faint blue-grey iridescence: a wide diagonal sheen tinted cool, laid in
      // "lighter" so it lifts the weave toward steel-blue without washing it out.
      ctx.save();
      ctx.translate(S / 2, S / 2); ctx.rotate(Math.PI / 5); ctx.translate(-S, -S);
      const irid = ctx.createLinearGradient(0, 0, 0, S * 2);
      irid.addColorStop(0.30, "rgba(0,0,0,0)");
      irid.addColorStop(0.50, "rgba(120,150,200,0.18)");
      irid.addColorStop(0.70, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = irid; ctx.fillRect(0, 0, S * 2, S * 2);
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      // Sharp specular sheen band raking the surface (tight, bright accent line).
      ctx.save();
      ctx.translate(S / 2, S / 2); ctx.rotate(-Math.PI / 4); ctx.translate(-S, -S);
      const sg = ctx.createLinearGradient(0, S * 0.92, 0, S * 1.08);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(0.5, skin.accent);
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55; ctx.fillStyle = sg; ctx.fillRect(0, 0, S * 2, S * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      break;
    }
    case "hazard": {
      // Hi-vis hazmat chevrons — bright glowing yellow bands, matte black bands.
      // Color pass: near-pure bright yellow field, black diagonal bands.
      // Emissive pass: yellow zones bright (they GLOW), black bands stay dark so the
      // chevrons read matte while only the hi-vis yellow lights up.
      const emissive = mode === "emissive";
      ctx.fillStyle = emissive ? "#fff44d" : skin.light;
      ctx.fillRect(0, 0, S, S);
      ctx.save();
      ctx.translate(S / 2, S / 2); ctx.rotate(-Math.PI / 4); ctx.translate(-S, -S);
      const w = S * 2, bands = 12, bw = w / bands;
      // Black bands: truly black in the emissive map so they don't glow at all.
      ctx.fillStyle = emissive ? "#000000" : skin.dark;
      for (let i = 0; i < bands; i += 2) ctx.fillRect(i * bw, 0, bw, w);
      ctx.restore();
      break;
    }
    case "flames": {
      // Magma: an ISOTROPIC molten field — charred crust with glowing lava cracks
      // scattered across the WHOLE canvas, so it reads as fire all the way around
      // with NO directional "from one edge" look and NO pole convergence. The hot
      // lava (cracks + pools) stays SOLID; the charred crust is see-through glass.
      // Three passes:
      //   color    — charred crust + shocking deep-red→orange→white-hot veins/pools.
      //   alpha    — white where the lava is (solid), black on the crust (glass).
      //   emissive — lava veins/pools bright hot-orange/yellow on PURE BLACK, so the
      //              molten zones genuinely emit light (bloom) and the crust stays dark.
      const emissive = mode === "emissive";
      const rnd = mulberry32(13);
      if (alpha) {
        ctx.fillStyle = "#3a3a3a"; ctx.fillRect(0, 0, S, S); // charred crust keeps a small body (~0.23) so magma isn't see-through over tiles
      } else if (emissive) {
        // Emissive map: everything that isn't lava emits nothing → pure black crust.
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, S, S);
        // Faint deep-glow embers under the crust so cooling lava still smoulders.
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const cx = rnd() * S, cy = rnd() * S, rad = S * (0.16 + rnd() * 0.12);
          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          rg.addColorStop(0, "rgba(150,40,2,0.6)"); rg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
        }
        ctx.globalCompositeOperation = "source-over";
      } else {
        // Charred basalt crust, very dark and roughly even (no top/bottom bias).
        ctx.fillStyle = skin.dark; ctx.fillRect(0, 0, S, S);
        // A few faint warm "deep glow" blobs under the crust for subtle depth.
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const cx = rnd() * S, cy = rnd() * S, rad = S * (0.16 + rnd() * 0.12);
          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          rg.addColorStop(0, "rgba(150,32,2,0.8)"); rg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // Wrap-aware stroke: draw a vein, then repeat it shifted ±S in x and ±S in y
      // so cracks that run off one edge continue on the opposite edge (clean tile,
      // no seam, no pole). Used for both the color and alpha passes.
      const drawVein = (pts, width, paint) => {
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
          for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x + ox, pts[k].y + oy);
          paint(width);
        }
      };

      // Build a network of meandering lava veins spread evenly over the canvas.
      const veins = [];
      const V = 14;
      for (let i = 0; i < V; i++) {
        const pts = [{ x: rnd() * S, y: rnd() * S }];
        const segs = 5 + Math.floor(rnd() * 4);
        let ang = rnd() * Math.PI * 2;
        for (let s = 0; s < segs; s++) {
          ang += (rnd() - 0.5) * 1.4;
          const len = 14 + rnd() * 22;
          const last = pts[pts.length - 1];
          pts.push({ x: last.x + Math.cos(ang) * len, y: last.y + Math.sin(ang) * len });
        }
        veins.push({ pts, w: 5 + rnd() * 7 });
      }

      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const { pts, w } of veins) {
        if (alpha) {
          // Mask: solid white core a touch wider than the visible glow.
          drawVein(pts, w + 2, (width) => { ctx.strokeStyle = "#fff"; ctx.lineWidth = width; ctx.stroke(); });
        } else if (emissive) {
          // Emissive: same layered ramp but on black — deep-orange halo, bright orange
          // body, near-white-hot yellow core. This is the light the lava throws off.
          drawVein(pts, w + 6, (width) => { ctx.strokeStyle = "#c41e00"; ctx.lineWidth = width; ctx.stroke(); });
          drawVein(pts, w + 1, (width) => { ctx.strokeStyle = "#ff7a14"; ctx.lineWidth = width; ctx.stroke(); });
          drawVein(pts, w * 0.45, (width) => { ctx.strokeStyle = "#fff0a0"; ctx.lineWidth = width; ctx.stroke(); });
        } else {
          // Color: shocking molten ramp — deep-red halo, blazing orange body, a
          // near-white-hot yellow core for searing contrast against the black crust.
          drawVein(pts, w + 6, (width) => { ctx.strokeStyle = "rgba(200,24,0,0.92)"; ctx.lineWidth = width; ctx.stroke(); });
          drawVein(pts, w + 2, (width) => { ctx.strokeStyle = "#ff4a08"; ctx.lineWidth = width; ctx.stroke(); });
          drawVein(pts, w + 1, (width) => { ctx.strokeStyle = skin.accent; ctx.lineWidth = width; ctx.stroke(); });
          drawVein(pts, w * 0.4, (width) => { ctx.strokeStyle = skin.light; ctx.lineWidth = width; ctx.stroke(); });
        }
      }

      // A scatter of glowing molten pools (filled blobs) for hot "pockets",
      // wrap-repeated like the veins so they never bunch at a seam/pole.
      const P = 10;
      for (let i = 0; i < P; i++) {
        const px = rnd() * S, py = rnd() * S, pr = 6 + rnd() * 10;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const cx = px + ox, cy = py + oy;
          if (alpha) {
            ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill();
          } else if (emissive) {
            // White-hot pool centers fading through orange to deep-red on black.
            const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, pr);
            rg.addColorStop(0, "#fff4b0"); rg.addColorStop(0.45, "#ff7a14"); rg.addColorStop(1, "rgba(120,16,0,0.5)");
            ctx.fillStyle = rg;
            ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill();
          } else {
            // White-hot core → blazing orange → deep-red rim for incandescent pools.
            const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, pr);
            rg.addColorStop(0, "#fffce0"); rg.addColorStop(0.35, skin.light); rg.addColorStop(0.7, skin.accent); rg.addColorStop(1, "rgba(200,24,0,0.7)");
            ctx.fillStyle = rg;
            ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      break;
    }
    case "dots": {
      // Glossy bubblegum marble: the candy dots stay SOLID, the field between them
      // is see-through glass. Color pass paints a pink field + shiny beads; alpha
      // pass paints those same dots white on black so only the beads are opaque.
      const rnd = mulberry32(21);
      // Field alpha ~0.4 (grey, not black) so the ball keeps a visible pink BODY over
      // bright tiles instead of going fully see-through and vanishing into the board.
      if (alpha) { ctx.fillStyle = "#666"; ctx.fillRect(0, 0, S, S); }
      else {
        const bg = ctx.createLinearGradient(0, 0, 0, S);
        bg.addColorStop(0, skin.light); bg.addColorStop(1, skin.dark);
        ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
      }
      const step = 28; // denser packing — bolder neon-bead look
      for (let gy = 0; gy * step <= S; gy++) for (let gx = 0; gx * step <= S; gx++) {
        const ox = (gy % 2) * step / 2;
        const cx = gx * step + ox, cy = gy * step;
        const r = 9 + rnd() * 7; // bigger, varied beads
        if (alpha) {
          // Mask: a slightly fatter white disc so the bead's edge isn't cut off.
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2); ctx.fill();
          continue;
        }
        // Candy body with a radial shade for roundness.
        const rg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
        rg.addColorStop(0, skin.accent); rg.addColorStop(1, "#ff2ccf"); // neon magenta-pink edge — makes the beads pop
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        // Soft specular highlight dot.
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    default: {
      // Classic Gold: a lacquered, beveled gold checker. Each cell is filled with a
      // top-left→bottom-right gradient (lighter corner catches the light, darker
      // corner sinks) so the squares read as inset/embossed tiles, not flat paint.
      // A soft diagonal highlight sweep + crisp dark grout lines finish the sheen.
      const n = 8, t = S / n;
      // Base: a subtle vertical gold gradient under everything so the whole ball
      // has depth even before the cells (warm light top, richer gold bottom).
      const baseG = ctx.createLinearGradient(0, 0, 0, S);
      baseG.addColorStop(0, "#ffe9a0");
      baseG.addColorStop(0.5, skin.light);
      baseG.addColorStop(1, "#f0a82a");
      ctx.fillStyle = baseG; ctx.fillRect(0, 0, S, S);
      // Beveled cells: dark squares get a rich-but-bright warm-gold gradient, light
      // squares a near-white gold — both lit from the top-left so tiles look domed.
      // Shadows stay WARM GOLD (no muddy brown) so the whole ball reads lustrous.
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dark = (x + y) % 2 === 0;
        const x0 = x * t, y0 = y * t;
        const g = ctx.createLinearGradient(x0, y0, x0 + t, y0 + t);
        if (dark) { g.addColorStop(0, "#ffd24a"); g.addColorStop(0.55, skin.dark); g.addColorStop(1, "#d68f1c"); }
        else { g.addColorStop(0, "#fff6cc"); g.addColorStop(0.55, skin.light); g.addColorStop(1, "#f0ab2c"); }
        ctx.fillStyle = g; ctx.fillRect(x0, y0, t, t);
        // Inset bevel: bright top+left edge, shadowed bottom+right edge per cell.
        ctx.fillStyle = "rgba(255,248,210,0.5)";
        ctx.fillRect(x0, y0, t, 2); ctx.fillRect(x0, y0, 2, t);
        ctx.fillStyle = "rgba(120,72,12,0.38)";
        ctx.fillRect(x0, y0 + t - 2, t, 2); ctx.fillRect(x0 + t - 2, y0, 2, t);
      }
      // Crisp grout lines between cells.
      ctx.strokeStyle = skin.line; ctx.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(S, i * t); ctx.stroke();
      }
      // Soft diagonal highlight sweep across the whole face for a lacquered sheen.
      ctx.save();
      ctx.translate(S / 2, S / 2); ctx.rotate(-Math.PI / 4); ctx.translate(-S, -S);
      const sweep = ctx.createLinearGradient(0, S * 0.7, 0, S * 1.25);
      sweep.addColorStop(0, "rgba(255,255,255,0)");
      sweep.addColorStop(0.5, "rgba(255,255,255,0.45)");
      sweep.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = sweep; ctx.fillRect(0, 0, S * 2, S * 2);
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  return new THREE.CanvasTexture(c);
}

// The rolling ball. Owns its own kinematic physics: we move it by hand each
// frame (no physics engine) to match the Unity PlayerController feel, plus
// riding moving platforms and bumping into obstacles.
export class Player {
  constructor(scene) {
    this.radius = CONFIG.playerRadius;

    const group = new THREE.Group();
    // ONE MeshPhysicalMaterial for every skin. It extends MeshStandardMaterial, so
    // emissive writes in updateVisuals keep working, but it also gives us real glass
    // (transmission, ior, clearcoat) that setSkin dials in per skin. Opaque skins
    // just set transmission 0 / transparent false and it behaves like the old standard.
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 32, 24),
      new THREE.MeshPhysicalMaterial({
        map: ballTexture(), roughness: 0.4, metalness: 0.15,
        transmission: 0, ior: 1.4, clearcoat: 0.25, clearcoatRoughness: 0.3,
      })
    );
    ball.castShadow = true;
    this._ball = ball;
    group.add(ball);

    // A shield bubble that we toggle on when the shield powerup is active.
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.5, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.28, emissive: 0x35e0ff, emissiveIntensity: 0.5 })
    );
    this.shieldMesh.visible = false;
    group.add(this.shieldMesh);

    // Effect indicators that ride on the ball. They live on the (non-rolling)
    // group so they stay upright while only the ball spins underneath.
    this._wings = this._makeWings();
    this._board = this._makeBoard();
    this._orbit = new THREE.Group();
    group.add(this._wings, this._board, this._orbit);
    this._orbitSprites = {};
    this._orbitRings = {}; // depletion ring (THREE.Line) per active orbit glyph
    this._emojiTex = {};
    this._vt = 0;

    this.mesh = group;
    scene.add(group);

    this.vel = new THREE.Vector3();
    // Floor detection by raycasting straight down against the platform meshes —
    // exact surface height for flat, ramp AND curved boards, no analytic model.
    this._ray = new THREE.Raycaster();
    this._down = new THREE.Vector3(0, -1, 0);
    this._rayOrigin = new THREE.Vector3();
    this._candMeshes = [];
    this.grounded = false;
    this.jumpCount = 0;
    this.lastGroundedY = 0;
    this._ridePlat = null;
    this._seenPresses = 0;
    this._coyote = 0;     // grace time left to still jump after leaving a ledge
    this._jumpBuffer = 0; // time left on a remembered jump press
    this._controlledJump = false; // true only for player jumps (so auto-bounces aren't chopped)
    this.airJumps = 0;
    this._t = 0;
    this._skinIndex = 0;
    this._skinGlow = 0; // base emissive for glowing skins (galaxy marble); 0 otherwise
  }

  // Swap the ball's skin to BALL_SKINS[index] (wraps). Disposes the old canvas
  // map(s) so we don't leak one per change, then dials the SINGLE physical
  // material into one of three looks:
  //   • glassy  (Galaxy) — whole sphere is translucent glass, star/nebula art
  //     glows from within via emissiveMap.
  //   • glassZones (Magma/Racing/Bubblegum) — solid coloured zones stay opaque,
  //     the rest is see-through glass via an alphaMap (white=solid, black=glass).
  //   • opaque  (Classic/Carbon/Hazard) — plain solid ball; ALL glass props reset.
  // Getting that reset right is the whole game: every glass prop set in one branch
  // must be cleared in the opaque branch, or a glass→opaque switch keeps see-through.
  setSkin(index) {
    const n = BALL_SKINS.length;
    this._skinIndex = ((index % n) + n) % n;
    const skin = BALL_SKINS[this._skinIndex];
    const mat = this._ball.material;

    // Dispose every old map before reassigning so we never leak GPU textures.
    if (mat.map) mat.map.dispose();
    if (mat.emissiveMap) mat.emissiveMap.dispose();
    if (mat.alphaMap) mat.alphaMap.dispose();
    mat.emissiveMap = null;
    mat.alphaMap = null;
    mat.map = ballTexture(skin, "color");

    // A little extra premium sheen on every skin (subtle clearcoat lacquer).
    mat.clearcoat = 0.3;
    mat.clearcoatRoughness = 0.25;
    mat.envMapIntensity = 1.2;

    if (skin.glassy) {
      // Galaxy: a near-SOLID star-marble, not a glass orb. The brightness-driven
      // alphaMap (floor 0.8) makes only the DARKEST void slightly see-through (~20%)
      // while stars/nebula stay fully opaque. The star canvas drives emissiveMap so
      // the sparkles/nebula still glow from within. Transmission is OFF — the faint
      // see-through is pure alpha, so it reads as a solid marble with a dark shimmer.
      mat.emissiveMap = ballTexture(skin, "emissive");
      mat.alphaMap = ballTexture(skin, "alpha");
      mat.emissive.setHex(0xffffff);
      this._skinGlow = 1.2; // base emissive kept up even with no blackout (updateVisuals)
      mat.emissiveIntensity = this._skinGlow;
      mat.transparent = true;   // needed so the alphaMap's dark-void dip shows
      mat.transmission = 0;     // no glass refraction — it's a near-solid marble now
      mat.thickness = 0;
      mat.ior = 1.45;
      mat.opacity = 1;
      mat.metalness = 0.0;
      mat.roughness = 0.25;
      mat.side = THREE.FrontSide; // solid marble: only front faces, no glass shell
    } else if (skin.glassZones) {
      // Solid zones opaque, the rest glass: the alphaMap (white=solid, black=glass)
      // drives per-pixel transparency, and transmission turns those clear pixels into
      // refracting glass rather than a flat hole. Most of these aren't lit from within
      // (blackout still adds its cool ember on top in updateVisuals) — but Magma is.
      mat.alphaMap = ballTexture(skin, "alpha");
      mat.transparent = true;
      mat.transmission = 0.5; // less see-through, so glass-zone balls stay visible over bright tiles (not just glowing over the void)
      mat.thickness = this.radius * 1.4;
      mat.ior = 1.45;
      mat.opacity = 1;
      mat.metalness = 0.05;
      mat.roughness = 0.12;
      mat.side = THREE.DoubleSide;

      if (skin.pattern === "flames") {
        // Magma GLOWS like molten lava — same mechanism as Hazard: an emissiveMap
        // lights only the lava veins/pools (hot orange-yellow) while the charred
        // crust stays black, a warm-orange `emissive` tints that emission, and a
        // steady high `_skinGlow` is held up every frame by updateVisuals so the
        // lava actually emits light and blooms. The glassZones alphaMap is untouched.
        mat.emissiveMap = ballTexture(skin, "emissive");
        mat.emissive.setHex(0xff5a14);
        this._skinGlow = 0.95;
        mat.emissiveIntensity = this._skinGlow;
      } else {
        // Racing/Bubblegum: no inner light (emissiveMap was already nulled above).
        mat.emissive.setHex(0x000000);
        this._skinGlow = 0;
        mat.emissiveIntensity = 0;
      }
    } else {
      // Opaque reset — clear EVERY glass prop the glass branches set, so the ball is
      // a normal solid sphere again (FrontSide, no transmission/alpha). Start from a
      // clean slate, then let a couple of opaque skins opt into glow/metal below.
      mat.emissive.setHex(0x000000);
      this._skinGlow = 0;
      mat.emissiveIntensity = 0;
      mat.transparent = false;
      mat.transmission = 0;
      mat.thickness = 0;
      mat.ior = 1.4;
      mat.opacity = 1;
      mat.metalness = 0.15;
      mat.roughness = 0.4;
      mat.side = THREE.FrontSide;

      if (skin.pattern === "hazard") {
        // Hi-vis hazmat: the yellow zones GLOW. An emissiveMap (yellow bright, black
        // chevrons dark) makes only the yellow light up; the chevrons stay matte. A
        // persistent yellow base glow (via _skinGlow) is held up by updateVisuals.
        mat.emissiveMap = ballTexture(skin, "emissive");
        mat.emissive.setHex(0xfff200);
        this._skinGlow = 0.85; // modest, steady hi-vis glow (kept across frames)
        mat.emissiveIntensity = this._skinGlow;
      } else if (skin.pattern === "checker") {
        // Classic Gold: a metallic surface with NO env map renders dark/muddy ("shit
        // brown"), so keep metalness MODEST and lean on the bright baked-in gold art
        // instead. A faint warm `emissive` (held steady via a small `_skinGlow` so
        // updateVisuals doesn't recolour it cool) gives lustre under the dark scene
        // without an environment map. Lower roughness keeps the lacquered sheen.
        mat.metalness = 0.4;
        mat.roughness = 0.25;
        mat.emissive.setHex(0x4a3206);
        this._skinGlow = 0.18;
        mat.emissiveIntensity = this._skinGlow;
      }
    }
    mat.needsUpdate = true;
    return this._skinIndex;
  }

  reset() {
    this.mesh.position.set(0, this.radius, 0);
    this._ball.rotation.set(0, 0, 0);
    this._ball.scale.set(1, 1, 1);
    this._wings.visible = false;
    this._board.visible = false;
    for (const k of Object.keys(this._orbitSprites)) {
      this._orbit.remove(this._orbitSprites[k]);
      delete this._orbitSprites[k];
    }
    for (const k of Object.keys(this._orbitRings)) {
      this._removeOrbitRing(k);
    }
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.jumpCount = -1; // first landing bumps it to 0, matching the original
    this.lastGroundedY = 0;
    this._ridePlat = null;
    this._coyote = 0;
    this._jumpBuffer = 0;
    this.airJumps = 0;
  }

  get position() { return this.mesh.position; }

  // ctx = { forwardSpeed, steerMult, invuln, shield }
  // Returns { died, landed, hit, pos }.
  update(dt, input, ctx, field) {
    const p = this.mesh.position;
    const v = this.vel;
    this.shieldMesh.visible = ctx.shield;

    // Ride a moving platform's VERTICAL motion (so you go up/down with it), but
    // NOT its horizontal motion — a sideways-sliding board slides out from under
    // you, so you have to actively steer to stay on it or you'll roll off the edge.
    if (this._ridePlat && this._ridePlat.mesh.parent) {
      p.y += this._ridePlat.dy;
    }

    // --- Jump: ground jump, optional mid-air jump (double-jump), or flight ---
    this._t += dt;

    // Buffer a fresh press for a short window so a jump pressed just before/at
    // landing still fires the moment we touch down.
    if (input.jumpPresses !== this._seenPresses) {
      this._seenPresses = input.jumpPresses;
      this._jumpBuffer = CONFIG.jumpBufferTime;
    }
    this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);

    // Coyote time: count "grounded" as true for a moment after leaving a ledge.
    const canGroundJump = this.grounded || this._coyote > 0;

    let jumped = false;
    if (ctx.flight && input.jumpHeld) {
      v.y = CONFIG.flightLift; this.grounded = false; // hold jump to soar
    } else if ((this._jumpBuffer > 0 || input.jumpHeld) && canGroundJump) {
      // Fire on a buffered press OR simply because the button is HELD — so holding
      // jump auto-hops the instant you touch down (or within coyote time as you roll
      // off an edge). This is the grace for "I was a few frames late to the button."
      v.y = CONFIG.jumpSpeed; this.grounded = false; this.airJumps = 0;
      this._coyote = 0; this._jumpBuffer = 0; jumped = true; this._controlledJump = true;
    } else if (this._jumpBuffer > 0 && this.airJumps < ctx.maxAirJumps) {
      v.y = CONFIG.jumpSpeed; this.airJumps++; this._jumpBuffer = 0; jumped = true; this._controlledJump = true; // double jump
    } else if (this._controlledJump && !input.jumpHeld && v.y > 0 && !this.grounded) {
      // "Hold for height" only chops a jump the PLAYER initiated — auto-launches
      // (trampolines, flubber) keep their full velocity so they go big.
      v.y /= CONFIG.quickDescentDivisor;
    }

    // Steering (steerMult flips for the "reverse" powerdown). When morphed, the
    // ball rolls weird — loosen control and add a wobble that fights your line.
    let steer = -input.steer * ctx.steerMult;
    if (ctx.morph) {
      // Haphazard wobble: three non-harmonic sines plus a smoothed random walk, so
      // it never settles into a predictable rhythm — it genuinely fights your line.
      this._morphDrift = ((this._morphDrift || 0) + (Math.random() - 0.5) * dt * 9) * 0.99;
      const wob = 0.45 * Math.sin(this._t * 9.0)
                + 0.30 * Math.sin(this._t * 5.3 + 2.1)
                + 0.25 * Math.sin(this._t * 14.7 + 0.7)
                + this._morphDrift;
      steer = steer * 0.55 + wob * (CONFIG.morphWobble / CONFIG.sideSpeed); // less of your own control, too
    }
    v.x = steer * CONFIG.sideSpeed;
    v.z = ctx.forwardSpeed;
    v.y -= CONFIG.gravity * (ctx.gravityScale || 1) * dt; // low-grav powerup floats you

    const prevBottom = p.y - this.radius;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    // --- Land on platforms (flat, ramp, or curved; pass through from below) ---
    let landed = null;
    const prevRide = this._ridePlat;
    this.grounded = false;
    this._ridePlat = null;
    this.onBoost = false; // true while standing on an acceleration plate (read by game)
    if (v.y <= 0) {
      const newBottom = p.y - this.radius;
      const floor = this._floorBelow(field, p.x, p.z, prevBottom, newBottom, prevRide);
      if (floor) {
        const best = floor.plat, bestTop = floor.y;
        let fresh = !prevRide;
        if (best.type === "bouncy") {
          // Trampoline: a MASSIVE auto-launch (not chopped — see _controlledJump).
          v.y = CONFIG.jumpSpeed * CONFIG.bounceBoost; this.airJumps = 0; this._controlledJump = false;
        } else if (best.type === "flipper") {
          // Flipper: hinged springboard. Big vertical AND a forward blast (added in
          // game._onLanded). Kicks the plate's flip animation. SENDS you — survive the landing.
          v.y = CONFIG.jumpSpeed * CONFIG.flipperVertical; this.airJumps = 0; this._controlledJump = false;
          best._flipT = CONFIG.flipperFlipTime; fresh = true; landed = "flipper";
        } else if (ctx.flubber) {
          // Flubber powerdown: auto-bounce off ANY surface, a bit higher than a
          // jump — you have to steer in the air to stay on course.
          p.y = bestTop + this.radius; v.y = CONFIG.jumpSpeed * CONFIG.flubberBounce; this.airJumps = 0;
          this._controlledJump = false; fresh = true; landed = "flubber";
        } else {
          p.y = bestTop + this.radius; v.y = 0; this.grounded = true; this._ridePlat = best; this.airJumps = 0;
          this._controlledJump = false;
          if (best.type === "boost") this.onBoost = true; // game ramps speed while you ride it
          // Curved board: drift toward the middle (concave) or off the sides (convex).
          if (best.curve) p.x += -CONFIG.curveForce * best.curve * (p.x - best.pos.x) * dt;
          // Banked board: a constant downhill drag toward the low edge (leanX>0 lifts
          // the +x side, so you slide toward -x). Steer against it or roll off the side.
          if (best.leanX) p.x += -CONFIG.leanForce * best.leanX * dt;
        }
        this.lastGroundedY = bestTop;
        // Only report a fresh landing (not every grounded frame) so landing
        // sounds don't fire continuously while you ride a board.
        if (fresh && landed === null) { this.jumpCount += 1; landed = best.type; }
        else if (landed === "flubber" || landed === "flipper") this.jumpCount += 1;
      }
    }
    // Launch off the top of an up-ramp: keep some of the climb as a hop (clamped
    // so a fast steep ramp doesn't fling you like a full jump).
    if (!this.grounded && prevRide && prevRide.slopeZ > 0 && prevRide !== this._ridePlat && v.y <= 0) {
      v.y = Math.max(v.y, Math.min(prevRide.slopeZ * v.z * CONFIG.rampLaunch, CONFIG.jumpSpeed * 0.8));
    }

    // --- Obstacle collision + near-miss detection ---
    let hit = null, nearMiss = false;
    const r = this.radius;
    for (const plat of field.platforms) {
      if (!plat.obstacles.length) continue;
      if (Math.abs(p.z - plat.pos.z) > plat.hz + 4) continue;
      for (const o of plat.obstacles) {
        const ox = plat.pos.x + o.lx, oy = plat.pos.y + o.ly, oz = plat.pos.z + o.lz;
        const dx = Math.abs(p.x - ox), dy = Math.abs(p.y - oy), dz = Math.abs(p.z - oz);
        if (dz > o.hz + r || dy > o.hy + r) continue;     // not alongside it
        if (dx <= o.hx + r) {
          if (!ctx.invuln) { hit = { platform: plat, obstacle: o }; break; }
        } else if (dx <= o.hx + r + CONFIG.nearMissMargin && !o._nm) {
          o._nm = true; nearMiss = true; // grazed it — counts once per obstacle
        }
      }
      if (hit) break;
    }

    // Morph powerdown: squash-and-stretch the ball so it visibly rolls weird.
    if (ctx.morph) {
      const s = 1 + Math.sin(this._t * 12) * 0.35;
      this._ball.scale.set(s, 2 - s, 1 / s);
    } else if (this._ball.scale.x !== 1) {
      this._ball.scale.lerp(ONE, Math.min(1, dt * 6));
    }

    this._roll(dt);

    // Refresh coyote time from this frame's grounded state (read next frame).
    if (this.grounded) this._coyote = CONFIG.coyoteTime;
    else this._coyote = Math.max(0, this._coyote - dt);

    // Die only once we're below the lowest floor still drawn nearby — so there's
    // truly nothing left to land on (not just below the last pad we stood on).
    const floor = field.lowestTopNear(p.z);
    const died = !this.grounded && p.y < floor - CONFIG.fallMargin;
    return { died, landed, hit, nearMiss, jumped, pos: p };
  }

  // Exact floor under (x,z): raycast straight down against the platform surface
  // meshes and return the highest one the player's feet have reached. Works for
  // flat, ramp and curved boards with no analytic model (the previous analytic
  // version mis-tilted ramps). Preserves pass-through-from-below via prevBottom.
  _floorBelow(field, x, z, prevBottom, newBottom, prevRide) {
    const meshes = this._candMeshes;
    meshes.length = 0;
    const Z = this.radius + 4;
    for (const plat of field.platforms) {
      if (Math.abs(z - plat.pos.z) > plat.hz + Z) continue;
      if (Math.abs(x - plat.pos.x) > plat.hx + this.radius * 0.5) continue;
      const m = plat.surfaceMesh;
      if (m) { m.updateMatrixWorld(); meshes.push(m); }
    }
    if (!meshes.length) return null;

    this._rayOrigin.set(x, prevBottom + 1000, z);
    this._ray.set(this._rayOrigin, this._down);
    this._ray.far = Infinity;
    const hits = this._ray.intersectObjects(meshes, false); // sorted top -> down

    for (const h of hits) {
      // Ignore undersides (steep ramp / curve back faces).
      if (h.face) {
        const ny = h.face.normal.clone().transformDirection(h.object.matrixWorld).y;
        if (ny <= 0.1) continue;
      }
      const top = h.point.y;
      const plat = h.object.userData.platform;
      if (plat === prevRide) {
        // The board we're already riding: stick to it, with slack so we hug a
        // rising ramp instead of clipping through its near edge.
        if (newBottom <= top + 0.7) return { plat, y: top };
        continue;
      }
      // Any other board: land ONLY if we crossed down onto it this frame — i.e.
      // our feet were at/above its surface last frame. This stops the warp
      // (snapping UP onto a higher pad that merely shares our x/z) and still
      // lets us pass through a board from below.
      if (prevBottom >= top - 0.6 && newBottom <= top + 0.05) return { plat, y: top };
    }
    return null;
  }

  _roll(dt) {
    // Spin only the ball, so the wings / board / orbiting glyphs stay upright.
    this._ball.rotation.x += (this.vel.z * dt) / this.radius;
    this._ball.rotation.z += (this.vel.x * dt) / this.radius;
  }

  // --- On-ball effect indicators -------------------------------------------

  // Called every frame with the live effects state so you can read what's
  // active straight off the ball. `e` is the game's effects object (seconds
  // remaining per timed effect, or a bool for shield).
  updateVisuals(e, dt, fracs = {}) {
    this._vt += dt;
    const t = this._vt;
    // Fast blink in the final 5 seconds so you know an effect's about to end.
    const blink = (rem) => (rem > 0 && rem < 5 ? 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 16)) : 1);

    // Flight -> flapping wings.
    this._wings.visible = e.flight > 0;
    if (e.flight > 0) {
      const flap = Math.sin(t * 11) * 0.5;
      this._wings.userData.r.rotation.z = -0.15 + flap;
      this._wings.userData.l.rotation.z = 0.15 - flap;
      const o = 0.85 * blink(e.flight);
      this._wings.userData.r.material.opacity = o;
      this._wings.userData.l.material.opacity = o;
    }

    // Double jump -> a translucent board hovers under you in mid-air, ready to
    // kick off of, and vanishes once you've spent the air jump.
    const showBoard = e.doublejump > 0 && !this.grounded && this.airJumps < 1;
    this._board.visible = showBoard;
    if (showBoard) {
      this._board.rotation.y += dt * 1.6;
      this._board.material.opacity = 0.45 * blink(e.doublejump);
    }

    // Blackout powerdown: the world goes dark, so give the ball a faint cool ember
    // — *barely* visible, kept dim enough to stay under the bloom threshold. The
    // galaxy marble keeps its own glowing star emissive (white + emissiveMap), so
    // don't recolour it — just add the blackout ember on top of its base glow.
    const bm = this._ball.material;
    const base = this._skinGlow || 0;
    const ballGlow = base + (e.blackout > 0 ? 0.4 : 0);
    if (!base) bm.emissive.setHex(0x5a78a8); // only the non-glowing skins tint cool
    bm.emissiveIntensity += (ballGlow - bm.emissiveIntensity) * Math.min(1, dt * 4);

    this._updateOrbit(e, t, blink, fracs);
  }

  // Orbiting glyphs around the ball for the effects without a dedicated mesh.
  // Each glyph carries a depletion ring that sweeps closed as the effect runs out.
  _updateOrbit(e, t, blink, fracs = {}) {
    const active = ORBIT_KEYS.filter((k) => e[k] > 0);
    for (const k of Object.keys(this._orbitSprites)) {
      if (!active.includes(k)) { this._orbit.remove(this._orbitSprites[k]); delete this._orbitSprites[k]; }
    }
    for (const k of Object.keys(this._orbitRings)) {
      if (!active.includes(k)) this._removeOrbitRing(k);
    }
    active.forEach((k, i) => {
      let s = this._orbitSprites[k];
      if (!s) { s = this._emojiSprite(k); this._orbit.add(s); this._orbitSprites[k] = s; }
      let ring = this._orbitRings[k];
      if (!ring) { ring = this._makeOrbitRing(); this._orbit.add(ring); this._orbitRings[k] = ring; }
      const ang = t * 1.3 + (i / active.length) * Math.PI * 2;
      const rr = this.radius * 2.4;
      const x = Math.cos(ang) * rr, y = this.radius * 1.5, z = Math.sin(ang) * rr;
      s.position.set(x, y, z);
      const op = blink(e[k]);
      s.material.opacity = op;
      // Ride along with the glyph and reveal only the remaining sweep. setDrawRange
      // just changes how many existing vertices draw — no GPU re-upload per frame.
      ring.position.set(x, y, z);
      const frac = Math.max(0, Math.min(1, fracs[k] ?? 0));
      ring.geometry.setDrawRange(0, Math.ceil(ORBIT_RING_SEG * frac) + 1);
      ring.material.opacity = op;
    });
  }

  // Build one depletion ring: a circle of points as a Line, started at the top
  // (-π/2) and wound clockwise so setDrawRange peels it back like a clock hand.
  _makeOrbitRing() {
    const pts = [];
    for (let i = 0; i <= ORBIT_RING_SEG; i++) {
      const a = -Math.PI / 2 + (i / ORBIT_RING_SEG) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 1, depthWrite: false });
    return new THREE.Line(geo, mat);
  }

  // Remove a ring from the orbit group and dispose its (non-cached) geometry +
  // material so we don't leak GPU resources when the effect expires or resets.
  _removeOrbitRing(k) {
    const ring = this._orbitRings[k];
    if (!ring) return;
    this._orbit.remove(ring);
    ring.geometry.dispose();
    ring.material.dispose();
    delete this._orbitRings[k];
  }

  // Angelic layered wings for the flight powerup. Each side is ONE mesh (so the
  // update loop can flap it via rotation.z and fade it via .material.opacity),
  // built from overlapping feather planes that share that one material. The mesh
  // pivots at its root (inner edge, near the ball) so the flap reads as a real
  // wingbeat. Right side is the master; the left is a scale.x=-1 mirror of it.
  _makeWings() {
    const g = new THREE.Group();

    // One soft, glowing material shared across every feather of a side, so a
    // single opacity write in updateVisuals fades the whole wing at once.
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfff4d2, emissive: 0xffc24d, emissiveIntensity: 0.55,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      roughness: 0.35, metalness: 0.0, depthWrite: false,
    });

    // Build a single teardrop feather as a smooth Shape: a rounded root that
    // tapers to a soft point, mirrored top/bottom for a leaf silhouette.
    const feather = () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(0.35, 0.14, 0.78, 0.16, 1.0, 0.05);
      s.bezierCurveTo(0.78, -0.04, 0.4, -0.07, 0, 0);
      return new THREE.ShapeGeometry(s);
    };
    const featherGeo = feather();

    // Three layered rows of feathers sweeping back and up — long primaries on
    // top, shorter coverts tucked beneath — to give the wing depth and a swept,
    // angelic fan rather than a flat blade.
    const rows = [
      { count: 6, baseLen: 2.2, spread: 0.34, lift: 0.55, z: 0.00, fade: 0.6 },
      { count: 5, baseLen: 1.7, spread: 0.40, lift: 0.30, z: 0.06, fade: 0.75 },
      { count: 4, baseLen: 1.2, spread: 0.46, lift: 0.08, z: 0.12, fade: 1.0 },
    ];

    // The master mesh carries the material; extra feathers are added as plain
    // meshes parented to it so they inherit its transform, flap, and opacity.
    const root = new THREE.Mesh(featherGeo, mat);
    for (const row of rows) {
      for (let i = 0; i < row.count; i++) {
        const f = new THREE.Mesh(featherGeo, mat);
        const t = i / (row.count - 1); // 0 at the front, 1 at the swept tip
        // Sweep the fan back and arc it upward toward the tip.
        const ang = row.spread + t * 0.9;
        f.position.set(0.15 + t * 0.55, row.lift + t * 0.5, row.z);
        f.rotation.z = ang;
        const len = row.baseLen * (1 - t * 0.35);
        f.scale.set(len, 0.55 + t * 0.25, 1);
        root.add(f);
      }
    }

    const r = root;
    r.position.set(this.radius * 0.45, this.radius * 0.35, 0);
    r.rotation.z = -0.15;
    const l = r.clone();
    l.position.set(-this.radius * 0.45, this.radius * 0.35, 0);
    l.scale.x = -1; // mirror onto the left side
    l.rotation.z = 0.15;
    // clone() shares the material by reference; give the left its own so the two
    // sides can be faded independently (the update loop writes each separately).
    l.material = mat.clone();
    l.traverse((o) => { if (o.isMesh) o.material = l.material; });

    g.add(r, l);
    g.userData = { r, l };
    g.visible = false;
    return g;
  }

  _makeBoard() {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.2, 2.6),
      new THREE.MeshStandardMaterial({
        color: 0xc6ff3a, emissive: 0x88ff00, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.45, roughness: 0.5,
      })
    );
    m.position.set(0, -this.radius - 0.45, 0);
    m.visible = false;
    return m;
  }

  // A camera-facing vector glyph for an active effect orbiting the ball. Drawn
  // (not emoji) and tinted by the effect's own color, cached per key.
  _emojiSprite(key) {
    let tex = this._emojiTex[key];
    if (!tex) {
      const def = POWERUP_DEFS[key];
      tex = new THREE.CanvasTexture(iconCanvas(key, def ? def.color : 0xffffff));
      this._emojiTex[key] = tex;
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    s.scale.set(1.1, 1.1, 1);
    return s;
  }
}
