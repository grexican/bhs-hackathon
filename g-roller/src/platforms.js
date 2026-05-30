import * as THREE from "three";
import { CONFIG, jumpReach, ramp, smoothstep } from "./config.js";
import { makeTextureLibrary, GROUND_TEXTURES } from "./textures.js";

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Telegraphed pickups: each has its own color, shape and glyph so you always
// know what you're about to touch. GOOD = cool colors, BAD (powerdowns) = warm.
// weight = spawn frequency: simpler / milder effects are common, powerful or
// harsh ones (flight, trip) are rare.
const POWERUP_DEFS = {
  shield:     { color: 0x9fe0ff, shape: "ring",  icon: "🛡️", good: true,  weight: 5 },
  slow:       { color: 0x2fd9c0, shape: "ico",   icon: "🐢", good: true,  weight: 5 },
  magnet:     { color: 0x4a78ff, shape: "ring",  icon: "🧲", good: true,  weight: 4 },
  doublejump: { color: 0xc6ff3a, shape: "knot",  icon: "⏫", good: true,  weight: 3 },
  flight:     { color: 0xffd24a, shape: "octa",  icon: "🕊️", good: true,  weight: 1.3 },
  reverse:    { color: 0xff9f1c, shape: "box",   icon: "🔄", good: false, weight: 5 },
  surge:      { color: 0xff3b3b, shape: "cone",  icon: "⚡", good: false, weight: 3 },
  splat:      { color: 0x8a5a2b, shape: "box",   icon: "💦", good: false, weight: 3 },
  morph:      { color: 0xff4bd6, shape: "ico",   icon: "🌀", good: false, weight: 2.5 },
  trip:       { color: 0xa94bff, shape: "tetra", icon: "🌈", good: false, weight: 1.3 },
};
const GOOD_POWERUPS = Object.keys(POWERUP_DEFS).filter((k) => POWERUP_DEFS[k].good);
const BAD_POWERUPS = Object.keys(POWERUP_DEFS).filter((k) => !POWERUP_DEFS[k].good);

// Pick a pickup type from a list, weighted by its spawn frequency.
function weightedPick(keys) {
  let total = 0;
  for (const k of keys) total += POWERUP_DEFS[k].weight;
  let r = Math.random() * total;
  for (const k of keys) { r -= POWERUP_DEFS[k].weight; if (r <= 0) return k; }
  return keys[keys.length - 1];
}

// One floating board. The root is an unscaled Group at the board's center so we
// can hang correctly-sized obstacles off it; the visual shape is a scaled child.
// Stores half-extents (hx/hy/hz) so landing is a simple box test.
class Platform {
  constructor(group, hx, hy, hz, type) {
    this.mesh = group; this.hx = hx; this.hy = hy; this.hz = hz;
    this.type = type;            // "normal" | "bouncy" | "boost"
    this.obstacles = [];         // {hx,hy,hz, lx,ly,lz, kind}
    this.mover = null;           // {dirX, dirY, amp, speed, phase, baseX, baseY}
    this.dx = 0; this.dy = 0;    // movement applied this frame (so riders move too)
    this.slopeZ = 0;             // ramp: top rises this much per unit of z
    this.curve = 0;              // curved board: + concave (funnels in), - convex (rolls off)
    this._tex = null;
    this._geo = null;            // own geometry to dispose (curved boards only)
  }
  get pos() { return this.mesh.position; }
  get topY() { return this.mesh.position.y + this.hy; }
}

// Owns the whole platform world: a guaranteed-reachable main path plus bonus
// branches, obstacles, moving boards, powerups, and a difficulty curve.
export class PlatformField {
  constructor(scene) {
    this.scene = scene;
    this.platforms = [];
    this.gems = [];
    this.powerups = [];
    this.tex = makeTextureLibrary();

    this._geoBox = new THREE.BoxGeometry(1, 1, 1);
    this._geoCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
    this._geoHex = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    this._gemGeo = new THREE.OctahedronGeometry(0.55);
    this._ringGeo = new THREE.TorusGeometry(CONFIG.tunnelRadius, 0.35, 12, 32);

    this._time = 0;
    this._difficulty = 0;  // hazard ramp (slow)
    this._spreadD = 0;     // spread ramp (fast)
    this.itemMultiplier = 1; // cheat code bumps this to spawn extra gems/powerups
    this._stepIndex = 0;
    this._stepsSinceTunnel = 0;
    this._cursor = { x: 0, y: 0, z: 0 };
    this._drift = { x: 0, y: 0 };  // wandering target the critical path heads toward
    this._driftSteps = 0;
  }

  reset() {
    for (const p of this.platforms) this._disposePlatform(p);
    for (const g of this.gems) this.scene.remove(g.mesh);
    for (const u of this.powerups) this.scene.remove(u.mesh);
    this.platforms.length = 0;
    this.gems.length = 0;
    this.powerups.length = 0;
    this._time = 0;
    this._difficulty = 0;
    this._spreadD = 0;
    this._stepIndex = 0;
    this._stepsSinceTunnel = 0;
    this._drift = { x: 0, y: 0 };
    this._driftSteps = CONFIG.safeStraight;

    const starter = this._addBoard({
      x: 0, y: -0.5, z: CONFIG.starterLength / 2 - 4,
      w: CONFIG.starterWidth, len: CONFIG.starterLength, hy: 0.5,
      geoType: "box", type: "normal", texName: "concrete",
    });
    this._cursor = { x: 0, y: 0, z: starter.pos.z + starter.hz };
  }

  // --- Construction helpers -------------------------------------------------

  _texFor(name, w, len) {
    const t = this.tex[name].clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, w / 4), Math.max(1, len / 4));
    return t;
  }

  _addBoard({ x, y, z, w, len, hy, geoType, type, texName, slopeZ = 0, curve = 0 }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const tex = this._texFor(texName, w, len);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: type === "bouncy" ? 0.4 : 0.85,
      metalness: 0.05,
      emissive: type === "bouncy" ? 0xff1f5a : type === "boost" ? 0x1fdd5a : 0x000000,
      emissiveIntensity: type === "bouncy" ? 0.5 : type === "boost" ? 0.6 : 0,
    });

    let visual, ownGeo = null;
    if (curve) {
      // Curved board: a parabolic surface across its width.
      ownGeo = this._makeCurvedGeo(w, len, curve);
      mat.side = THREE.DoubleSide;
      visual = new THREE.Mesh(ownGeo, mat);
    } else {
      const geo = geoType === "cyl" ? this._geoCyl : geoType === "hex" ? this._geoHex : this._geoBox;
      visual = new THREE.Mesh(geo, mat);
      visual.scale.set(w, hy * 2, len);
      if (slopeZ) visual.rotation.x = Math.atan(slopeZ); // tilt into a ramp
    }
    visual.castShadow = true;
    visual.receiveShadow = true;
    group.add(visual);
    this.scene.add(group);

    const p = new Platform(group, w / 2, hy, len / 2, type);
    p._tex = tex;
    p._geo = ownGeo;
    p.slopeZ = slopeZ;
    p.curve = curve;
    this.platforms.push(p);
    return p;
  }

  // A flat plane bent into a parabola across its width (x). +curve = concave
  // (valley, funnels you to the middle); -curve = convex (dome, rolls you off).
  _makeCurvedGeo(w, len, curve) {
    const g = new THREE.PlaneGeometry(w, len, 16, 1);
    g.rotateX(-Math.PI / 2); // lay flat in the xz-plane, facing up
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      pos.setY(i, curve * px * px);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  // Hang an obstacle off a platform. "barrier" = a low wall you jump; "spikes" =
  // a hazard strip on one side you steer around. Always leaves a way past.
  _addObstacle(p, kind) {
    let lx, ly, lz, hx, hy, hz, mesh;
    if (kind === "barrier") {
      hx = p.hx * 0.82; hy = 0.7; hz = 0.4;
      lx = 0; lz = rand(-p.hz * 0.3, p.hz * 0.4); ly = p.hy + hy;
      mesh = new THREE.Mesh(this._geoBox, new THREE.MeshStandardMaterial({
        color: 0x2a2f3d, emissive: 0xff2d55, emissiveIntensity: 0.5, roughness: 0.6,
      }));
      mesh.scale.set(hx * 2, hy * 2, hz * 2);
      mesh.position.set(lx, ly, lz);
      p.mesh.add(mesh);
    } else { // spikes on one side
      const side = chance(0.5) ? 1 : -1;
      hx = p.hx * 0.4; hy = 0.85; hz = p.hz * 0.55;
      lx = side * p.hx * 0.5; lz = rand(-p.hz * 0.2, p.hz * 0.2); ly = p.hy + hy;
      mesh = new THREE.Group();
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0x901010, emissiveIntensity: 0.5, roughness: 0.4 });
      const cols = 3, rows = 3;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.5, 8), spikeMat);
        cone.position.set((i - 1) * hx * 0.6, p.hy + 0.75, lz + (j - 1) * hz * 0.5);
        cone.castShadow = true;
        mesh.add(cone);
      }
      mesh.position.x = lx;
      p.mesh.add(mesh);
    }
    p.obstacles.push({ hx, hy, hz, lx, ly, lz, kind, mesh });
  }

  _makeMover(p, big) {
    // Slide distance grows with difficulty (gentle wander early, big swings late).
    const base = ramp(CONFIG.moveAmp, this._difficulty);
    const amp = big ? base * 1.3 : rand(base * 0.6, base);
    // Direction: mostly horizontal/vertical, sometimes a crazy diagonal.
    const roll = Math.random();
    let dirX, dirY;
    if (roll < 0.42) { dirX = 1; dirY = 0; }                 // horizontal slide
    else if (roll < 0.74) { dirX = 0; dirY = 1; }            // vertical lift
    else {                                                    // diagonal!
      dirX = 0.707 * (chance(0.5) ? 1 : -1);
      dirY = 0.707 * (chance(0.5) ? 1 : -1);
    }
    p.mover = { dirX, dirY, amp, speed: rand(0.7, 1.5), phase: rand(0, Math.PI * 2), baseX: p.pos.x, baseY: p.pos.y };
  }

  // A short glowing ring tunnel. The floor is a normal (landable) flat platform;
  // the rings are see-through decor positioned below camera height, so the
  // third-person view still sees the exit past the end of the tunnel.
  _spawnTunnel(forwardSpeed) {
    const reach = jumpReach();
    const maxGap = forwardSpeed * reach.airTime * CONFIG.pathGapSafety;
    const gap = clamp(rand(4, maxGap * 0.4), 3, maxGap);
    const len = CONFIG.tunnelLength;
    const w = 11;
    const band = ramp(CONFIG.bandX, this._spreadD);
    const x = clamp(this._cursor.x, -band, band);
    const y = this._cursor.y; // flat all the way through
    const z = this._cursor.z + gap + len / 2;

    const p = this._addBoard({ x, y, z, w, len, hy: 0.5, geoType: "box", type: "normal", texName: "concrete" });
    this._addTunnelRings(p, len);
    this._cursor = { x, y, z: z + len / 2 };
    this._stepsSinceTunnel = 0;
    this._stepIndex++;

    // A line of gems down the middle as a reward for taking the tunnel.
    for (let k = 0; k < 4; k++) this._addGem(x, y + 1.4, z - len / 2 + (k + 0.7) * (len / 5));
  }

  _addTunnelRings(p, len) {
    const count = CONFIG.tunnelRings;
    const spacing = len / count;
    const r = CONFIG.tunnelRadius;
    for (let k = 0; k < count; k++) {
      const hue = ((k / count) * 0.55 + 0.55) % 1; // gradient purple -> cyan down the tube
      const col = new THREE.Color().setHSL(hue, 0.8, 0.6);
      const ring = new THREE.Mesh(this._ringGeo, new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3,
        transparent: true, opacity: 0.7,
      }));
      ring.position.set(0, r - 1.4, -p.hz + (k + 0.5) * spacing);
      p.mesh.add(ring);
    }
  }

  _addGem(x, y, z) {
    const mesh = new THREE.Mesh(this._gemGeo, new THREE.MeshStandardMaterial({
      color: 0x66f0ff, emissive: 0x33d0ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3,
    }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.gems.push({ mesh, baseY: y, phase: rand(0, Math.PI * 2), collected: false });
  }

  // Floating power pickup, telegraphed by color + shape + a glyph sprite so you
  // can read it from a distance. Early on pickups are almost all good; powerdowns
  // ramp in with difficulty.
  _addPowerup(x, y, z, d = 0) {
    const good = chance(ramp(CONFIG.goodPowerupChance, d));
    const type = weightedPick(good ? GOOD_POWERUPS : BAD_POWERUPS);
    const def = POWERUP_DEFS[type];

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this._powerGeo(def.shape), new THREE.MeshStandardMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.3,
    }));
    group.add(mesh);
    group.add(this._iconSprite(def.icon)); // floating glyph above the shape
    group.position.set(x, y, z);
    this.scene.add(group);
    this.powerups.push({ mesh: group, type, good, baseY: y, phase: rand(0, Math.PI * 2), collected: false });
  }

  // Cached geometry per pickup shape.
  _powerGeo(shape) {
    if (!this._pgeo) this._pgeo = {};
    if (this._pgeo[shape]) return this._pgeo[shape];
    let g;
    if (shape === "ring") g = new THREE.TorusGeometry(0.7, 0.22, 12, 20);
    else if (shape === "ico") g = new THREE.IcosahedronGeometry(0.8);
    else if (shape === "knot") g = new THREE.TorusKnotGeometry(0.48, 0.17, 64, 8);
    else if (shape === "octa") g = new THREE.OctahedronGeometry(0.85);
    else if (shape === "box") g = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    else if (shape === "cone") g = new THREE.ConeGeometry(0.7, 1.4, 8);
    else g = new THREE.TetrahedronGeometry(0.95);
    this._pgeo[shape] = g;
    return g;
  }

  // A camera-facing emoji glyph that hovers above a pickup. Material is cached.
  _iconSprite(emoji) {
    if (!this._iconCache) this._iconCache = {};
    let mat = this._iconCache[emoji];
    if (!mat) {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const ctx = c.getContext("2d");
      ctx.font = "46px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(emoji, 32, 36);
      mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false });
      this._iconCache[emoji] = mat;
    }
    const s = new THREE.Sprite(mat);
    s.scale.set(1.5, 1.5, 1);
    s.position.set(0, 1.5, 0);
    return s;
  }

  // Pickups either sit just above the pad (collected while rolling) or float
  // clearly overhead (an obvious jump) — never in the ambiguous in-between.
  _floatY(top) {
    return top + (chance(0.5) ? rand(0.9, 1.3) : rand(4.3, 5.6));
  }

  // Does a candidate box overlap any nearby existing platform?
  _overlaps(x, y, z, hx, hy, hz) {
    for (const p of this.platforms) {
      if (Math.abs(p.pos.z - z) > p.hz + hz + 40) continue;
      if (Math.abs(p.pos.x - x) <= p.hx + hx + 1 &&
          Math.abs(p.pos.y - y) <= p.hy + hy + 1.5 &&
          Math.abs(p.pos.z - z) <= p.hz + hz + 1) return true;
    }
    return false;
  }

  // --- Path generation ------------------------------------------------------

  _randGeo() {
    // Mix up the shape AND thickness so boards aren't all identical slabs.
    const roll = Math.random();
    if (roll < 0.45) return { geoType: "box", hy: 0.6 };
    if (roll < 0.62) return { geoType: "box", hy: rand(1.3, 2.4) }; // thick block
    if (roll < 0.74) return { geoType: "box", hy: 0.28 };           // thin slab
    if (roll < 0.88) return { geoType: "cyl", hy: rand(0.5, 1.0) }; // round pad
    return { geoType: "hex", hy: rand(0.5, 1.0) };                  // hex pad
  }

  // Extend the world by one step: lay the next GUARANTEED-REACHABLE critical
  // platform (it wanders toward a roaming target — up, over and across — but
  // every step stays within jump reach), then strew a cloud of branch platforms
  // around it so the field sprawls into a journey with many possible routes.
  _extendPath(forwardSpeed) {
    const hd = this._difficulty;   // hazard ramp (slow)
    const reach = jumpReach();
    const maxRise = reach.height * CONFIG.pathRiseSafety;
    const maxGap = forwardSpeed * reach.airTime * CONFIG.pathGapSafety;
    const maxLateral = CONFIG.sideSpeed * reach.airTime * CONFIG.pathLateralSafety;

    // The first few pads run straight ahead (spread pinned to 0); after that the
    // field opens up fast on the SPREAD ramp while hazards stay on the slow one.
    const safe = this._stepIndex < CONFIG.safeStraight;

    // Occasionally the next stretch is a glowing ring tunnel.
    if (!safe && this._stepsSinceTunnel >= CONFIG.tunnelCooldown && chance(ramp(CONFIG.tunnelChance, hd))) {
      this._spawnTunnel(forwardSpeed);
      return;
    }
    this._stepsSinceTunnel++;

    const sd = safe ? 0 : this._spreadD;
    const dd = safe ? 0 : hd;
    const band = ramp(CONFIG.bandX, sd);

    // Roaming target: every few steps, pick a new far-off (x, y) for the path to
    // head toward. This is what turns a straight line into a sweeping journey.
    if (!safe && --this._driftSteps <= 0) {
      this._driftSteps = randInt(CONFIG.driftEvery[0], CONFIG.driftEvery[1]);
      this._drift.x = clamp(rand(-band, band), -band, band);
      const vy = ramp(CONFIG.driftY, sd);
      this._drift.y = clamp(this._cursor.y + rand(-vy * 0.7, vy), -30, 55);
    }

    const g = this._randGeo();
    const round = g.geoType !== "box";
    const w = rand(ramp(CONFIG.padWidthLo, dd), ramp(CONFIG.padWidthHi, dd));
    let len = rand(ramp(CONFIG.padLenLo, dd), ramp(CONFIG.padLenHi, dd));
    if (round) len = Math.min(len, rand(8, 14));

    // Reachable step budgets (open up with SPREAD).
    const gap = clamp(rand(maxGap * ramp(CONFIG.gapFracLo, sd), maxGap * ramp(CONFIG.gapFracHi, sd)), 3, maxGap);
    const lateral = maxLateral * ramp(CONFIG.lateralFrac, sd);
    const dyUp = maxRise * ramp(CONFIG.riseFrac, sd);
    const dyDown = ramp(CONFIG.dropDepth, sd);

    // Bias the step toward the roaming target, then add randomness — but always
    // clamp to what a jump can actually clear, so the critical path stays solvable.
    let dx, dy;
    if (safe) {
      dx = rand(-1, 1) * 0.5;
      dy = rand(-1.2, 1.2);
    } else {
      const toX = clamp(this._drift.x - this._cursor.x, -lateral, lateral);
      const sharp = chance(ramp(CONFIG.sharpTurnChance, hd));
      dx = sharp ? clamp(toX + (chance(0.5) ? 1 : -1) * rand(lateral * 0.5, lateral), -lateral, lateral)
                 : toX * 0.6 + rand(-lateral, lateral) * 0.4;
      const toY = clamp(this._drift.y - this._cursor.y, dyDown, dyUp);
      dy = toY * 0.6 + rand(dyDown, dyUp) * 0.4;
    }

    const x = clamp(this._cursor.x + dx, -band - 4, band + 4);
    const y = this._cursor.y + dy;
    const z = this._cursor.z + gap + len / 2;

    const type = !safe && chance(0.1) ? "boost" : "normal";
    const texName = type === "boost" ? "boost" : pick(GROUND_TEXTURES);

    // Maybe make this a ramp (roll up/down + launch off the top) or a curved board.
    let slopeZ = 0, curve = 0, yCenter = y;
    if (!safe && type === "normal" && !round) {
      if (chance(ramp(CONFIG.rampChance, sd))) {
        slopeZ = (chance(0.5) ? 1 : -1) * rand(CONFIG.rampSlope[0], CONFIG.rampSlope[1]);
        yCenter = this._cursor.y + slopeZ * (len / 2); // near edge meets the incoming height
      } else if (chance(ramp(CONFIG.curveChance, sd))) {
        curve = (chance(0.6) ? 1 : -1) * CONFIG.curveAmount; // + concave (in), - convex (out)
      }
    }

    const p = this._addBoard({ x, y: yCenter, z, w, len, hy: g.hy, geoType: g.geoType, type, texName, slopeZ, curve });
    const exitY = slopeZ ? yCenter + slopeZ * (len / 2) : yCenter;
    this._cursor = { x, y: exitY, z: z + len / 2 };

    if (!safe) {
      // Keep movers and obstacles on plain flat boards (no ramps/curves).
      if (!slopeZ && !curve && chance(ramp(CONFIG.movingChance, hd))) this._makeMover(p, false);
      if (type === "normal" && !slopeZ && !curve && len > 12 && chance(ramp(CONFIG.obstacleChance, hd))) {
        this._addObstacle(p, chance(0.55) ? "barrier" : "spikes");
      }
    }
    // Item multiplier (1 normally, more with the cheat code) spawns extra
    // gems/powerups, spread sideways so they don't pile up.
    const py = p.pos.y;
    for (let k = 0; k < this.itemMultiplier; k++) {
      const ox = (k - (this.itemMultiplier - 1) / 2) * 3;
      if (chance(0.4)) this._addGem(x + ox, this._floatY(py + p.hy), z);
      if (chance(CONFIG.powerupChance)) this._addPowerup(x + ox, this._floatY(py + p.hy), z + rand(-len * 0.3, len * 0.3), hd);
    }

    if (!safe) this._scatterCloud(x, exitY, z, sd, hd);
    this._stepIndex++;
  }

  // Strew a handful of branch platforms around the front. They aren't on the
  // guaranteed path — they're the parallax sprawl: alternate routes, high
  // perches, low ledges. Overlap-checked so nothing spawns inside anything else.
  _scatterCloud(cx, cy, cz, sd, hd) {
    const n = Math.round(ramp(CONFIG.cloudCount, sd));
    const rx = ramp(CONFIG.cloudRadiusX, sd);
    const ry = ramp(CONFIG.cloudRadiusY, sd);
    for (let i = 0; i < n; i++) {
      const x = clamp(cx + rand(-rx, rx), -CONFIG.bandX[1] - 10, CONFIG.bandX[1] + 10);
      const y = clamp(cy + rand(-ry, ry), -32, 58);
      const z = cz + rand(-CONFIG.cloudZSpread * 0.55, CONFIG.cloudZSpread);
      const g = this._randGeo();
      const round = g.geoType !== "box";
      const w = rand(ramp(CONFIG.padWidthLo, hd) * 0.7, ramp(CONFIG.padWidthHi, hd));
      let len = rand(8, ramp(CONFIG.padLenHi, hd));
      if (round) len = Math.min(len, rand(8, 14));
      if (this._overlaps(x, y, z, w / 2, g.hy, len / 2)) continue;

      const bouncy = chance(0.16);
      const p = this._addBoard({
        x, y, z, w, len, hy: bouncy ? 0.5 : g.hy,
        geoType: bouncy ? "box" : g.geoType,
        type: bouncy ? "bouncy" : "normal",
        texName: bouncy ? "rubber" : pick(GROUND_TEXTURES),
      });
      for (let m = 0; m < this.itemMultiplier; m++) {
        const ox = (m - (this.itemMultiplier - 1) / 2) * 2.5;
        if (chance(0.5)) this._addGem(x + ox, this._floatY(y + p.hy), z); // reward exploring off-path
        if (chance(0.12)) this._addPowerup(x + ox, this._floatY(y + p.hy), z, hd);
      }
    }
  }

  _disposePlatform(p) {
    this.scene.remove(p.mesh);
    p.mesh.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    if (p._tex) p._tex.dispose();
    if (p._geo) p._geo.dispose();
  }

  // --- Per-frame ------------------------------------------------------------

  update(dt, playerZ, forwardSpeed) {
    this._time += dt;
    this._difficulty = smoothstep(playerZ / CONFIG.difficultyDistance);
    this._spreadD = smoothstep(playerZ / CONFIG.spreadDistance);

    while (this._cursor.z < playerZ + CONFIG.keepAheadDistance) this._extendPath(forwardSpeed);

    // Move the sliding platforms and record their per-frame delta so riders
    // (the player) can be carried along.
    for (const p of this.platforms) {
      if (!p.mover) { p.dx = 0; p.dy = 0; continue; }
      const m = p.mover;
      const o = Math.sin(this._time * m.speed + m.phase) * m.amp;
      const nx = m.baseX + o * m.dirX;
      const ny = m.baseY + o * m.dirY;
      p.dx = nx - p.pos.x; p.dy = ny - p.pos.y;
      p.pos.x = nx; p.pos.y = ny;
    }

    for (const g of this.gems) {
      if (g.collected) continue;
      g.mesh.rotation.y += dt * 2.2; g.mesh.rotation.x += dt * 1.1;
      g.mesh.position.y = g.baseY + Math.sin(this._time * 2.5 + g.phase) * 0.35;
    }
    for (const u of this.powerups) {
      if (u.collected) continue;
      u.mesh.rotation.y += dt * 1.6;             // spin the group; glyph sits on the y-axis so it stays put
      u.mesh.children[0].rotation.x += dt * 1.3; // tumble just the shape
      u.mesh.position.y = u.baseY + Math.sin(this._time * 2 + u.phase) * 0.4;
    }

    // Cull everything left behind.
    const cullZ = playerZ - CONFIG.cullBehindDistance;
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      const p = this.platforms[i];
      if (p.pos.z + p.hz < cullZ) { this._disposePlatform(p); this.platforms.splice(i, 1); }
    }
    for (let i = this.gems.length - 1; i >= 0; i--)
      if (this.gems[i].mesh.position.z < cullZ) { this.scene.remove(this.gems[i].mesh); this.gems.splice(i, 1); }
    for (let i = this.powerups.length - 1; i >= 0; i--)
      if (this.powerups[i].mesh.position.z < cullZ) { this.scene.remove(this.powerups[i].mesh); this.powerups.splice(i, 1); }
  }

  // Lowest platform top among the floors currently drawn around the player.
  // Death is measured against this so you never die while a tile you could have
  // landed on is still on screen below you. Returns -Infinity if none nearby.
  lowestTopNear(z) {
    let min = Infinity;
    for (const p of this.platforms) {
      if (p.pos.z < z - 25 || p.pos.z > z + 110) continue; // roughly what's on screen
      if (p.topY < min) min = p.topY;
    }
    return min === Infinity ? -Infinity : min;
  }

  // Pull uncollected gems toward the player while a magnet is active. The pull
  // is strong enough that gems accelerate in and catch up to the moving player
  // (instead of trailing behind in an uncatchable tail).
  attract(playerPos, dt) {
    const k = Math.min(1, dt * CONFIG.magnetPull);
    for (const g of this.gems) {
      if (g.collected) continue;
      if (g.mesh.position.distanceTo(playerPos) < CONFIG.magnetRadius) {
        g.mesh.position.lerp(playerPos, k);
      }
    }
  }

  harvestGems(playerPos, radius) {
    const grabbed = [];
    for (const g of this.gems) {
      if (g.collected) continue;
      if (g.mesh.position.distanceTo(playerPos) < radius + 1.1) {
        g.collected = true; g.mesh.visible = false; grabbed.push(g.mesh.position.clone());
      }
    }
    return grabbed;
  }

  harvestPowerups(playerPos, radius) {
    const grabbed = [];
    for (const u of this.powerups) {
      if (u.collected) continue;
      if (u.mesh.position.distanceTo(playerPos) < radius + 1.3) {
        u.collected = true; u.mesh.visible = false;
        grabbed.push({ type: u.type, good: u.good, pos: u.mesh.position.clone() });
      }
    }
    return grabbed;
  }

  // Remove an obstacle (e.g. after a shielded hit smashes through it).
  removeObstacle(platform, obstacle) {
    platform.mesh.remove(obstacle.mesh);
    const i = platform.obstacles.indexOf(obstacle);
    if (i >= 0) platform.obstacles.splice(i, 1);
  }
}
