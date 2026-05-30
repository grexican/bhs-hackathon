import * as THREE from "three";

// Procedural canvas textures themed on the original game's architecture pack
// (bricks, laminated wood, marble, tiling, pebbles, "round dot rubber"). The
// real game shipped 4 MB .tga files per material; here we redraw that look in
// code so the web build stays tiny and loads instantly.

function makeCanvas(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, ctx: c.getContext("2d") };
}

function fill(ctx, color, size) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
}

// Sprinkle soft noise so flat colors don't look like plastic.
function grain(ctx, size, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = Math.random() * 2 + 0.5;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

const PAINTERS = {
  // Red brick wall — staggered rows with mortar lines.
  brick(ctx, s) {
    fill(ctx, "#7c4a3a", s);
    const rows = 8, rh = s / rows, bw = s / 4;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (bw / 2);
      for (let x = -bw; x < s; x += bw) {
        ctx.fillStyle = `hsl(${10 + Math.random() * 14}, ${45 + Math.random() * 15}%, ${38 + Math.random() * 10}%)`;
        ctx.fillRect(x + offset + 2, r * rh + 2, bw - 4, rh - 4);
      }
    }
    grain(ctx, s, 600, 0.25);
  },

  // Laminated wood planks running lengthwise.
  wood(ctx, s) {
    fill(ctx, "#9c6b3f", s);
    const planks = 5, pw = s / planks;
    for (let p = 0; p < planks; p++) {
      ctx.fillStyle = `hsl(${28 + Math.random() * 10}, 50%, ${40 + Math.random() * 12}%)`;
      ctx.fillRect(p * pw, 0, pw - 2, s);
      ctx.strokeStyle = "rgba(60,35,15,0.5)";
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(p * pw + Math.random() * pw, 0);
        ctx.bezierCurveTo(p * pw + Math.random() * pw, s / 3, p * pw + Math.random() * pw, 2 * s / 3, p * pw + Math.random() * pw, s);
        ctx.stroke();
      }
    }
  },

  // Polished marble with soft grey veining.
  marble(ctx, s) {
    fill(ctx, "#e8eaf0", s);
    ctx.strokeStyle = "rgba(120,130,150,0.5)";
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = Math.random() * 2 + 0.5;
      ctx.beginPath();
      let x = Math.random() * s, y = 0;
      ctx.moveTo(x, y);
      while (y < s) { x += (Math.random() - 0.5) * 40; y += 20; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    grain(ctx, s, 200, 0.06);
  },

  // Green checker tiling with grout.
  tile(ctx, s) {
    fill(ctx, "#1f6f5c", s);
    const n = 4, t = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const lit = (x + y) % 2 === 0;
      ctx.fillStyle = lit ? "#2f9c7f" : "#247a64";
      ctx.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
    }
    grain(ctx, s, 300, 0.12);
  },

  // Lacquered pebbles — clustered rounded stones.
  pebble(ctx, s) {
    fill(ctx, "#5d6470", s);
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = Math.random() * 10 + 6;
      const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
      const l = 50 + Math.random() * 30;
      g.addColorStop(0, `hsl(210, 12%, ${l + 15}%)`);
      g.addColorStop(1, `hsl(210, 14%, ${l - 20}%)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  },

  // Grey concrete / plasterboard.
  concrete(ctx, s) {
    fill(ctx, "#8b8f98", s);
    grain(ctx, s, 1400, 0.18);
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = `rgba(60,60,70,${Math.random() * 0.1})`;
      ctx.beginPath(); ctx.moveTo(Math.random() * s, Math.random() * s);
      ctx.lineTo(Math.random() * s, Math.random() * s); ctx.stroke();
    }
  },

  // "Round dot rubber" — the bouncy board. Bright dots on a dark mat.
  rubber(ctx, s) {
    fill(ctx, "#1a1f2b", s);
    const n = 5, t = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const cx = x * t + t / 2, cy = y * t + t / 2;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, t * 0.36);
      g.addColorStop(0, "#ff6b9d");
      g.addColorStop(1, "#d11e57");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, t * 0.34, 0, Math.PI * 2); ctx.fill();
    }
  },

  // Speed-boost pad — glowing forward chevrons (green = "go fast").
  boost(ctx, s) {
    fill(ctx, "#0c2a18", s);
    ctx.fillStyle = "#39ff7a";
    ctx.shadowColor = "#39ff7a"; ctx.shadowBlur = 18;
    for (let i = 0; i < 4; i++) {
      const y = i * (s / 4) + 10;
      ctx.beginPath();
      ctx.moveTo(s * 0.2, y + 30); ctx.lineTo(s * 0.5, y);
      ctx.lineTo(s * 0.8, y + 30); ctx.lineTo(s * 0.8, y + 46);
      ctx.lineTo(s * 0.5, y + 16); ctx.lineTo(s * 0.2, y + 46);
      ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur = 0;
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
