// Custom vector iconography for every powerup / powerdown.
//
// We used to render emoji onto a canvas, but Windows draws many emoji (anything
// with a variation selector, like a shield or dove) as blank "tofu" squares —
// so players literally couldn't tell the pickups apart. Instead we now DRAW each
// glyph by hand with crisp strokes/fills on a big 128px canvas, tinted by the
// effect's own color. One consistent bold style, instantly recognizable, sharp
// at any in-world or HUD size. Every call site (floating pickups, rune plates,
// orbit glyphs, HUD chips, badges, toasts) routes through here.

const SIZE = 128; // canvas resolution — big so glyphs stay sharp when scaled down

// Turn a THREE hex number (0x9fe0ff) or a CSS string into a "#rrggbb" string.
function toCss(color) {
  if (typeof color === "number") return "#" + color.toString(16).padStart(6, "0");
  return color || "#ffffff";
}

// Draw one glyph centered in a SIZE×SIZE box. Each `draw` works in a coordinate
// space where the icon roughly fills a 100×100 area centered on (0,0); we scale
// and translate so it lands nicely on whatever canvas size we render to.
const ICONS = {
  // GOOD --------------------------------------------------------------------
  // Shield (aegis): classic heraldic shield outline with a center bar.
  shield(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(38, -32);
    ctx.lineTo(38, 6);
    ctx.quadraticCurveTo(38, 38, 0, 50);
    ctx.quadraticCurveTo(-38, 38, -38, 6);
    ctx.lineTo(-38, -32);
    ctx.closePath();
    fillStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(0, 30);
    ctx.lineWidth = 9;
    stroke(ctx);
  },
  // Slow-motion: a turtle (dome shell on stubby legs + little head).
  slow(ctx) {
    // shell
    ctx.beginPath();
    ctx.arc(0, -2, 30, Math.PI, 0);
    ctx.closePath();
    fillStroke(ctx);
    // shell scutes
    ctx.beginPath();
    ctx.moveTo(-14, -16); ctx.lineTo(-14, -2);
    ctx.moveTo(14, -16); ctx.lineTo(14, -2);
    ctx.moveTo(-30, -2); ctx.lineTo(30, -2);
    ctx.lineWidth = 6;
    stroke(ctx);
    // head
    ctx.beginPath();
    ctx.arc(38, 0, 10, 0, Math.PI * 2);
    fillStroke(ctx);
    // legs
    ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-20, -2); ctx.lineTo(-24, 16);
    ctx.moveTo(18, -2); ctx.lineTo(22, 16);
    stroke(ctx);
  },
  // Gem magnet: horseshoe magnet with two poles.
  magnet(ctx) {
    ctx.lineWidth = 16; ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.arc(0, -6, 30, Math.PI, 0, false); // the "U" arch (drawn upside-down U)
    stroke(ctx);
    // the two straight prongs hanging down
    ctx.beginPath();
    ctx.moveTo(-30, -6); ctx.lineTo(-30, 34);
    ctx.moveTo(30, -6); ctx.lineTo(30, 34);
    stroke(ctx);
    // pole tips (filled blocks)
    ctx.beginPath();
    ctx.rect(-38, 30, 16, 14);
    ctx.rect(22, 30, 16, 14);
    fillStroke(ctx);
  },
  // Double jump: two stacked up-chevrons (extra mid-air leap).
  doublejump(ctx) {
    ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const dy of [-16, 18]) {
      ctx.beginPath();
      ctx.moveTo(-32, dy + 14);
      ctx.lineTo(0, dy - 16);
      ctx.lineTo(32, dy + 14);
      stroke(ctx);
    }
  },
  // Low gravity: crescent moon (floaty moon-gravity).
  lowgrav(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.arc(18, -6, 38, 0, Math.PI * 2, true);
    fillStroke(ctx);
  },
  // Flight: a single soaring wing (fly & soar).
  flight(ctx) {
    ctx.beginPath();
    ctx.moveTo(-44, 14);
    ctx.quadraticCurveTo(-6, -34, 46, -22);
    ctx.quadraticCurveTo(8, -8, 18, 8);
    ctx.quadraticCurveTo(-4, -2, 4, 18);
    ctx.quadraticCurveTo(-20, 8, -44, 14);
    ctx.closePath();
    fillStroke(ctx);
    // feather lines
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-22, 8); ctx.quadraticCurveTo(0, -10, 28, -16);
    stroke(ctx);
  },

  // BAD ---------------------------------------------------------------------
  // Reverse: two curved arrows chasing each other in a loop (controls flipped).
  reverse(ctx) {
    ctx.lineWidth = 11; ctx.lineCap = "round";
    // top arc, arrow pointing right
    ctx.beginPath();
    ctx.arc(0, 0, 32, Math.PI * 0.9, Math.PI * 1.85);
    stroke(ctx);
    arrowHead(ctx, 30, -10, 0.5);
    // bottom arc, arrow pointing left
    ctx.beginPath();
    ctx.arc(0, 0, 32, Math.PI * -0.1, Math.PI * 0.85);
    stroke(ctx);
    arrowHead(ctx, -30, 10, Math.PI + 0.5);
  },
  // Surge: a bold lightning bolt (forced speed-up).
  surge(ctx) {
    ctx.beginPath();
    ctx.moveTo(10, -46);
    ctx.lineTo(-26, 6);
    ctx.lineTo(-2, 6);
    ctx.lineTo(-10, 46);
    ctx.lineTo(28, -8);
    ctx.lineTo(2, -8);
    ctx.closePath();
    fillStroke(ctx);
  },
  // Splat: a goo blob with droplets (gunk on the screen).
  splat(ctx) {
    ctx.beginPath();
    const pts = [42, 18, 30, 40, 0, 30, -34, 42, -40, 16, -30, -8, -38, -34, -6, -30, 16, -42, 22, -16, 44, -6];
    blob(ctx, pts);
    fillStroke(ctx);
    // flung droplets
    for (const [dx, dy, r] of [[-46, 30, 7], [48, 34, 6], [10, -50, 6]]) {
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); fillStroke(ctx);
    }
  },
  // Morph: a spiral / warp (wobbly steering).
  morph(ctx) {
    ctx.lineWidth = 11; ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const a = i / 100 * Math.PI * 3.2;
      const r = 4 + (i / 100) * 40;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    stroke(ctx);
  },
  // Flubber: three bubbles (auto-bounce / springy goo).
  flubber(ctx) {
    for (const [dx, dy, r] of [[-16, 8, 26], [20, 16, 18], [12, -22, 14]]) {
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); fillStroke(ctx);
      // highlight glint
      ctx.beginPath(); ctx.arc(dx - r * 0.35, dy - r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill();
    }
  },
  // Blackout: a dark moon over a power-off ring (lights out).
  blackout(ctx) {
    ctx.lineWidth = 11; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 4, 34, Math.PI * 0.62, Math.PI * 2.38); // open ring (power symbol)
    stroke(ctx);
    ctx.beginPath();
    ctx.moveTo(0, -38); ctx.lineTo(0, 0); // vertical power stroke
    stroke(ctx);
  },
  // Fog: a cloud with haze lines (distance is gone).
  fog(ctx) {
    cloud(ctx, 0, -8);
    ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-34, 28); ctx.lineTo(30, 28);
    ctx.moveTo(-26, 44); ctx.lineTo(38, 44);
    stroke(ctx);
  },
  // Rain: a cloud with falling drops (downpour on the windshield).
  rain(ctx) {
    cloud(ctx, 0, -16);
    ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath();
    for (const dx of [-24, -2, 20]) {
      ctx.moveTo(dx, 22); ctx.lineTo(dx - 8, 44);
    }
    stroke(ctx);
  },
  // Trip: a rainbow swirl (psychedelic colors). Drawn multi-colour, ignores tint.
  trip(ctx) {
    const cols = ["#ff3b6b", "#ffb13b", "#ffe93b", "#54e36a", "#3bb0ff", "#a94bff"];
    ctx.lineWidth = 9; ctx.lineCap = "round";
    cols.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(0, 22, 14 + i * 7, Math.PI, 0);
      ctx.stroke();
    });
  },
};

// --- tiny drawing helpers ---------------------------------------------------

// Fill with the tinted glyph color, then outline in the same darker stroke.
function fillStroke(ctx) {
  ctx.fill();
  ctx.lineWidth = ctx.lineWidth && ctx.lineWidth > 6 ? ctx.lineWidth : 7;
  ctx.stroke();
}
function stroke(ctx) { ctx.stroke(); }

// A small filled arrowhead (triangle) at (x,y), rotated by `ang` radians.
function arrowHead(ctx, x, y, ang) {
  const s = 14;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-s, -s * 0.7);
  ctx.lineTo(-s, s * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Trace a closed blob through a flat [x0,y0,x1,y1,...] point list using smooth
// quadratic curves between midpoints — gives an organic splat outline.
function blob(ctx, p) {
  const n = p.length / 2;
  const mx = (i) => (p[(i % n) * 2] + p[((i + 1) % n) * 2]) / 2;
  const my = (i) => (p[(i % n) * 2 + 1] + p[((i + 1) % n) * 2 + 1]) / 2;
  ctx.moveTo(mx(n - 1), my(n - 1));
  for (let i = 0; i < n; i++) ctx.quadraticCurveTo(p[i * 2], p[i * 2 + 1], mx(i), my(i));
  ctx.closePath();
}

// A puffy three-lobe cloud centered around (cx, cy).
function cloud(ctx, cx, cy) {
  ctx.beginPath();
  ctx.arc(cx - 22, cy + 4, 18, 0, Math.PI * 2);
  ctx.arc(cx, cy - 8, 24, 0, Math.PI * 2);
  ctx.arc(cx + 24, cy + 2, 19, 0, Math.PI * 2);
  ctx.rect(cx - 38, cy, 76, 16);
  fillStroke(ctx);
}

// Draw glyph `key` onto a 2D context that's `size` px square, tinted `color`.
export function drawIcon(ctx, key, size = SIZE, color = "#ffffff") {
  const fn = ICONS[key];
  ctx.clearRect(0, 0, size, size);
  if (!fn) return;
  const css = toCss(color);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 128, size / 128); // glyphs are authored in a 128px space
  ctx.fillStyle = css;
  ctx.strokeStyle = "#0a0e1c"; // dark outline keeps glyphs readable on any backdrop
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // subtle glow so the icon pops against busy scenery / bloom
  ctx.shadowColor = css;
  ctx.shadowBlur = size * 0.06;
  fn(ctx);
  ctx.restore();
}

// Cache one rendered <canvas> per key+color so we don't redraw every frame.
const _canvasCache = {};
export function iconCanvas(key, color = "#ffffff") {
  const cacheKey = key + "|" + toCss(color);
  let c = _canvasCache[cacheKey];
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = SIZE;
    drawIcon(c.getContext("2d"), key, SIZE, color);
    _canvasCache[cacheKey] = c;
  }
  return c;
}

// Cache a data-URL per key+color for use in DOM (HUD chips, badges, toasts).
const _urlCache = {};
export function iconDataURL(key, color = "#ffffff") {
  const cacheKey = key + "|" + toCss(color);
  let u = _urlCache[cacheKey];
  if (!u) {
    u = iconCanvas(key, color).toDataURL();
    _urlCache[cacheKey] = u;
  }
  return u;
}

// A ready-to-drop <img> string for innerHTML, sized for inline use in the HUD.
export function iconImg(key, color = "#ffffff", px = 20) {
  return `<img class="pu-icon" src="${iconDataURL(key, color)}" width="${px}" height="${px}" alt="${key}" />`;
}
