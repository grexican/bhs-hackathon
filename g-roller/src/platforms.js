import * as THREE from "three";
import { CONFIG, jumpReach, ramp, smoothstep, BIOMES, biomeAt } from "./config.js";
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
export const POWERUP_DEFS = {
  shield:     { color: 0x9fe0ff, shape: "ring",  icon: "🛡️", good: true,  weight: 5 },
  slow:       { color: 0x2fd9c0, shape: "ico",   icon: "🐢", good: true,  weight: 5 },
  magnet:     { color: 0x4a78ff, shape: "ring",  icon: "🧲", good: true,  weight: 4 },
  doublejump: { color: 0xc6ff3a, shape: "knot",  icon: "⏫", good: true,  weight: 3 },
  lowgrav:    { color: 0x9affd6, shape: "octa",  icon: "🌙", good: true,  weight: 2.5 },
  flight:     { color: 0xffd24a, shape: "octa",  icon: "🕊️", good: true,  weight: 1.3 },
  reverse:    { color: 0xff9f1c, shape: "box",   icon: "🔄", good: false, weight: 5 },
  surge:      { color: 0xff3b3b, shape: "cone",  icon: "⚡", good: false, weight: 3 },
  splat:      { color: 0x8a5a2b, shape: "box",   icon: "💦", good: false, weight: 3 },
  morph:      { color: 0xff4bd6, shape: "ico",   icon: "🌀", good: false, weight: 2.5 },
  flubber:    { color: 0x6aff6a, shape: "ico",   icon: "🫧", good: false, weight: 2.5 },
  blackout:   { color: 0x44507a, shape: "octa",  icon: "🌑", good: false, weight: 2 },
  fog:        { color: 0x9aa6b5, shape: "box",   icon: "🌫️", good: false, weight: 2 },
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
    this.leanX = 0;              // sideways bank: top rises this much per unit of x (+ raises the +x edge); drags you to the low side
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

    // Glowing edge outlines for the BLACKOUT powerdown: every board gets a wireframe
    // child that lights up only when the lights cut out (emergency-aisle lighting).
    // One shared bright material (blooms) + shared edge geometry for the cached shapes;
    // curved boards get their own edge geometry. `blackout` toggles them all on/off.
    this._edgeMat = new THREE.LineBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0.2 });
    this._edgeGeoBox = new THREE.EdgesGeometry(this._geoBox);
    this._edgeGeoCyl = new THREE.EdgesGeometry(this._geoCyl);
    this._edgeGeoHex = new THREE.EdgesGeometry(this._geoHex);
    this.blackout = false;
    this._edgeVis = false; // last applied blackout state (so we only re-toggle on change)
    this._emissiveScale = 1; // blackout dims the pieces' OWN glow (emissive) down to ~0; 1 = normal
    this._gemGeo = new THREE.OctahedronGeometry(0.55);

    this._time = 0;
    this._difficulty = 0;  // hazard ramp (slow)
    this._spreadD = 0;     // spread ramp (fast)
    this.itemMultiplier = 1; // cheat code bumps this to spawn extra gems/powerups
    this.difficultyMult = 1; // Easy/Medium/Hard scales the floor of the hazard ramps
    // Cheat-mode test tool: which powerup types are allowed to spawn. Default = all.
    // Disable all but one and (with cheat's 5x items) it spawns constantly to test.
    this.enabledPowerups = new Set(Object.keys(POWERUP_DEFS));
    this._biomeTextures = BIOMES[0].textures;
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

  // Pick a ground texture from the current biome's palette.
  _groundTex() { return pick(this._biomeTextures || GROUND_TEXTURES); }

  _texFor(name, w, len) {
    const t = this.tex[name].clone();
    t.needsUpdate = true;
    if (name === "boost") {
      // Boost arrows: one column, tiled along the length so they always run
      // straight down the board (forward), never sideways.
      t.repeat.set(1, Math.max(1, Math.round(len / 7)));
    } else {
      t.repeat.set(Math.max(1, w / 4), Math.max(1, len / 4));
    }
    return t;
  }

  _addBoard({ x, y, z, w, len, hy, geoType, type, texName, slopeZ = 0, curve = 0, leanX = 0 }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const tex = this._texFor(texName, w, len);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: type === "bouncy" ? 0.4 : 0.85,
      metalness: 0.05,
      emissive: type === "bouncy" ? 0xff1f5a : type === "boost" ? 0x1fbf4c : 0x000000,
      emissiveIntensity: type === "bouncy" ? 0.5 : type === "boost" ? 0.32 : 0,
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
    }
    // Angle is independent of shape and curve — any board can tilt. NEGATIVE atan:
    // a +X rotation tilts the +z (forward) end DOWN, so we negate it to make
    // slopeZ>0 = uphill in the travel direction (matches the generator's exit-height
    // convention). Collision raycasts the real mesh, so the surface is always what
    // you see — a tilted curved/round/boost board all just work.
    if (slopeZ) visual.rotation.x = -Math.atan(slopeZ);
    // Sideways bank, independent of the ramp pitch above. A +z roll lifts the +x
    // edge and drops the -x edge; collision raycasts the real tilted mesh, so the
    // ball sits on the bank and player.js drags it toward the low (-x) side.
    if (leanX) visual.rotation.z = Math.atan(leanX);
    visual.castShadow = true;
    visual.receiveShadow = true;
    group.add(visual);

    // Emergency edge lighting (lit only during blackout). Child of `visual` so it
    // inherits the board's scale and slope automatically. Curved boards need their
    // own edge geometry; flat/round boards share the cached unit-shape edges.
    const edgeGeo = curve ? new THREE.EdgesGeometry(ownGeo)
      : geoType === "cyl" ? this._edgeGeoCyl
      : geoType === "hex" ? this._edgeGeoHex
      : this._edgeGeoBox;
    const edge = new THREE.LineSegments(edgeGeo, this._edgeMat);
    edge.visible = this.blackout;
    visual.add(edge);

    this.scene.add(group);

    const p = new Platform(group, w / 2, hy, len / 2, type);
    p._tex = tex;
    p._geo = ownGeo;
    p._edge = edge;
    p._edgeGeo = curve ? edgeGeo : null; // dispose curved edge geo with the board; shared ones stay
    p.slopeZ = slopeZ;
    p.curve = curve;
    p.leanX = leanX;
    visual.userData.platform = p; // raycast maps a hit back to its Platform
    p.surfaceMesh = visual;       // the one landable mesh (obstacles/tube added later aren't this)
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

  // Difficulty scales the FLOOR of a hazard ramp (obstacle/moving/sharp-turn): Easy
  // opens calmer, Hard busier. Clamped so a high multiplier can't push past the peak.
  _hazRamp(pair, d) {
    return ramp([Math.min(pair[0] * this.difficultyMult, pair[1]), pair[1]], d);
  }

  // Blackout can't dim pieces that light THEMSELVES — boost (green) and bouncy (red)
  // plates use emissive, which ignores scene lights, so they stay vivid. Scale ONLY
  // the plate-SURFACE glow in step with the blackout so those plates go indistinct
  // like the dark ones. Obstacles (spikes/barriers — separate child meshes) keep
  // their glow so hazards stay readable in the dark, and gems/powerups (not children
  // of a platform) keep glowing as beacons. Lazily records each base; scale=1 restores.
  // Runs every frame while dimmed so boards spawned mid-blackout are caught too.
  setEmissiveScale(scale) {
    if (scale >= 0.999 && this._emissiveScale >= 0.999) return; // nothing to do in normal light
    this._emissiveScale = scale;
    for (const p of this.platforms) {
      const m = p.surfaceMesh && p.surfaceMesh.material;
      if (!m || !m.isMeshStandardMaterial) continue;
      if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissiveIntensity;
      if (m.userData.baseEmissive > 0) m.emissiveIntensity = m.userData.baseEmissive * scale;
    }
  }

  // Hang an obstacle off a platform. Four kinds, each needing a different move:
  // "barrier" = low wall you JUMP; "spikes" = one-side strip you STEER around;
  // "overhead" = a bar you must roll UNDER (don't jump!); "pillars" = a slalom you
  // thread between. Always leaves a way past.
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
    } else if (kind === "overhead") {
      // A bar you must roll UNDER — DON'T jump here. Spans the width and floats with
      // a gap beneath: a grounded ball (r≈0.9) clears it, but any jump clips it.
      hx = p.hx * 0.9; hy = 0.45; hz = 0.5;
      lx = 0; lz = rand(-p.hz * 0.2, p.hz * 0.3); ly = p.hy + 2.6;
      mesh = new THREE.Group();
      const barMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3d, emissive: 0xffd23b, emissiveIntensity: 0.55, roughness: 0.5 });
      const bar = new THREE.Mesh(this._geoBox, barMat);
      bar.scale.set(hx * 2, hy * 2, hz * 2); bar.position.set(0, ly, lz); bar.castShadow = true;
      mesh.add(bar);
      for (const sx of [-1, 1]) { // posts so it reads as a gate to duck under
        const post = new THREE.Mesh(this._geoBox, barMat);
        post.scale.set(0.4, ly - p.hy, 0.4); post.position.set(sx * hx, p.hy + (ly - p.hy) / 2, lz);
        mesh.add(post);
      }
      p.mesh.add(mesh);
    } else if (kind === "pillars") {
      // A slalom: two tall narrow pillars with a clear lane between (and lanes on the
      // sides). Steer through or jump. Each pillar is its OWN collision box so the
      // gaps are real openings, not one wide wall.
      hx = p.hx * 0.16; hy = 1.7; hz = 0.5;
      lz = rand(-p.hz * 0.2, p.hz * 0.2); ly = p.hy + hy;
      const pmat = new THREE.MeshStandardMaterial({ color: 0x2a2f3d, emissive: 0xff7a1c, emissiveIntensity: 0.5, roughness: 0.5 });
      for (const sx of [-1, 1]) {
        const px = sx * p.hx * 0.42;
        const pillar = new THREE.Mesh(this._geoBox, pmat);
        pillar.scale.set(hx * 2, hy * 2, hz * 2); pillar.position.set(px, ly, lz); pillar.castShadow = true;
        p.mesh.add(pillar);
        p.obstacles.push({ hx, hy, hz, lx: px, ly, lz, kind, mesh: pillar });
      }
      return; // pushed each pillar as its own collision box
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
    this._addTunnelTube(p, len);
    this._cursor = { x, y, z: z + len / 2 };
    this._stepsSinceTunnel = 0;
    this._stepIndex++;

    // A line of gems down the middle as a reward for taking the tunnel.
    for (let k = 0; k < 4; k++) this._addGem(x, y + 0.6, z - len / 2 + (k + 0.7) * (len / 5)); // +0.8 in _addGem keeps these ~in the rings
  }

  // A full semi-transparent tube you roll through (kept short so the exit shows
  // through it in the third-person view).
  _addTunnelTube(p, len) {
    const r = CONFIG.tunnelRadius;
    const geo = new THREE.CylinderGeometry(r, r, len, 30, 1, true); // open-ended cylinder
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a5bff, emissive: 0x6a3bff, emissiveIntensity: 0.55,
      metalness: 0.3, roughness: 0.35, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const tube = new THREE.Mesh(geo, mat);
    tube.rotation.x = Math.PI / 2;   // align the tube axis with z (the travel direction)
    tube.position.set(0, r - 1.4, 0);
    p.mesh.add(tube);
    p._geo = geo; // dispose this geometry when the platform is culled
  }

  _addGem(x, top, z) {
    const mesh = new THREE.Mesh(this._gemGeo, new THREE.MeshStandardMaterial({
      color: 0x66f0ff, emissive: 0x33d0ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3,
    }));
    const y = top + 0.8; // grounded on the platform — pickups don't float anymore
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.gems.push({ mesh, baseY: y, phase: rand(0, Math.PI * 2), collected: false });
  }

  // Power pickup, telegraphed by color + shape + a glyph sprite so you can read it
  // from a distance. Powerdowns are the majority (they act like dodgeable obstacles)
  // and skew further that way with difficulty.
  // Pick a powerup type honoring the good/bad ratio, but only from types enabled in
  // the cheat test menu. Falls back to the other pool's enabled types; null if none.
  _pickPowerupType(d) {
    const good = chance(ramp(CONFIG.goodPowerupChance, d));
    const inPool = (list) => list.filter((k) => this.enabledPowerups.has(k));
    const first = inPool(good ? GOOD_POWERUPS : BAD_POWERUPS);
    const pool = first.length ? first : inPool(good ? BAD_POWERUPS : GOOD_POWERUPS);
    return pool.length ? weightedPick(pool) : null;
  }

  _addPowerup(x, top, z, d = 0) {
    const type = this._pickPowerupType(d);
    if (!type) return; // every type disabled in the cheat test menu → nothing spawns
    const def = POWERUP_DEFS[type];
    const good = def.good; // the picked type's own good/bad flag — used by the HUD + collect FX. Was a stray undefined ref since the _pickPowerupType refactor, which silently threw before the powerup could be tracked.

    // Everything spawns GROUNDED on the platform now (no floating pickups) — right
    // in the roll lane at ball-center height. You collect or dodge by where you
    // steer/jump, not by reaching up for floaters.
    const grounded = true;
    const y = top + 0.95;

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this._powerGeo(def.shape), new THREE.MeshStandardMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.3,
    }));
    group.add(mesh);
    group.add(this._iconSprite(def.icon)); // floating glyph above the shape
    group.position.set(x, y, z);
    this.scene.add(group);
    this.powerups.push({ mesh: group, type, good, grounded, baseY: y, phase: rand(0, Math.PI * 2), collected: false });
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

  // Does a candidate box overlap any nearby STATIC platform? Moving boards are
  // ignored — they're allowed to slide over things (that's the only case where
  // overlap is OK).
  _overlaps(x, y, z, hx, hy, hz) {
    for (const p of this.platforms) {
      if (p.mover) continue;
      if (Math.abs(p.pos.z - z) > p.hz + hz + 40) continue;
      if (Math.abs(p.pos.x - x) <= p.hx + hx + 1 &&
          Math.abs(p.pos.y - y) <= p.hy + hy + 1.5 &&
          Math.abs(p.pos.z - z) <= p.hz + hz + 1) return true;
    }
    return false;
  }

  // Remove any static decor platforms that overlap the just-placed critical
  // platform (the path takes priority), so static pieces never sit inside each
  // other. Movers are left alone.
  _clearOverlapping(keep) {
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      const p = this.platforms[i];
      if (p === keep || p.mover) continue;
      if (Math.abs(p.pos.z - keep.pos.z) <= p.hz + keep.hz &&
          Math.abs(p.pos.x - keep.pos.x) <= p.hx + keep.hx &&
          Math.abs(p.pos.y - keep.pos.y) <= p.hy + keep.hy + 1) {
        this._disposePlatform(p);
        this.platforms.splice(i, 1);
      }
    }
  }

  // --- Path generation ------------------------------------------------------

  _randGeo(roundChance) {
    // Hex/round pads are rare early (small accents) and become common later;
    // everything else is a box with varied thickness.
    if (Math.random() < roundChance) {
      return chance(0.5)
        ? { geoType: "cyl", hy: rand(0.5, 1.0) }
        : { geoType: "hex", hy: rand(0.5, 1.0) };
    }
    const roll = Math.random();
    if (roll < 0.6) return { geoType: "box", hy: 0.6 };
    if (roll < 0.82) return { geoType: "box", hy: rand(1.3, 2.4) }; // thick block
    return { geoType: "box", hy: 0.28 };                            // thin slab
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

    const g = this._randGeo(ramp(CONFIG.roundGeoChance, sd));
    const round = g.geoType !== "box";
    const w = rand(ramp(CONFIG.padWidthLo, dd), ramp(CONFIG.padWidthHi, dd));
    let len = rand(ramp(CONFIG.padLenLo, dd), ramp(CONFIG.padLenHi, dd));
    if (round) len = Math.min(len, rand(10, 18));

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
      const sharp = chance(this._hazRamp(CONFIG.sharpTurnChance, hd));
      dx = sharp ? clamp(toX + (chance(0.5) ? 1 : -1) * rand(lateral * 0.5, lateral), -lateral, lateral)
                 : toX * 0.6 + rand(-lateral, lateral) * 0.4;
      const toY = clamp(this._drift.y - this._cursor.y, dyDown, dyUp);
      dy = toY * 0.6 + rand(dyDown, dyUp) * 0.4;
    }

    const type = !safe && chance(0.1) ? "boost" : "normal";
    const texName = type === "boost" ? "boost" : this._groundTex();

    // Angle (slope) and curve (bow) are independent display PROPERTIES, not their
    // own plate types: any board — flat, boost, round, and a mover below — can tilt
    // and/or bow, in any combination, on top of its shape/size/texture. Rolled here
    // (before placement) so a longer ramp doesn't throw off the gap that follows it.
    // (Tunnels are a separate structure and stay flat for now.)
    let slopeZ = 0, curve = 0, leanX = 0;
    if (!safe) {
      if (chance(ramp(CONFIG.rampChance, sd))) {
        slopeZ = (chance(0.5) ? 1 : -1) * rand(CONFIG.rampSlope[0], CONFIG.rampSlope[1]);
        if (!round) len *= ramp(CONFIG.rampLenBoost, sd); // box ramps run longer; keep round tiles small
      }
      if (!round && chance(ramp(CONFIG.curveChance, sd))) {
        // Random magnitude: most are gentle, some are dramatic half-pipes. Concave
        // (+, funnels in) favored over convex (-, rolls off). curveForce reads this
        // magnitude, so a deep bowl also pulls you sideways hard ("gravity").
        const mag = rand(CONFIG.curveAmount[0], CONFIG.curveAmount[1]);
        curve = (chance(0.7) ? 1 : -1) * mag;
      }
      // Sideways bank — independent of ramp/curve, so a board can climb AND lean.
      // Chance ramps with difficulty (_hazRamp); the magnitude's upper bound grows
      // with spread (ramp(.., sd)), so early boards are barely tilted and later ones
      // bank for real. Side is random. player.js drags you toward the low edge.
      if (chance(this._hazRamp(CONFIG.leanChance, hd))) {
        const mag = rand(CONFIG.leanAmount[0], ramp(CONFIG.leanAmount, sd));
        leanX = (chance(0.5) ? 1 : -1) * mag;
      }
    }

    const x = clamp(this._cursor.x + dx, -band - 4, band + 4);
    const y = this._cursor.y + dy;
    const z = this._cursor.z + gap + len / 2;
    const yCenter = slopeZ ? this._cursor.y + slopeZ * (len / 2) : y; // ramp near edge meets the incoming height

    // Acceleration plates are always flat boxes (forward arrows); ramps use a
    // thin box too so their near edge meets the incoming height cleanly.
    const geoType = type === "boost" ? "box" : g.geoType;
    const hy = type === "boost" || slopeZ ? 0.5 : g.hy;
    const p = this._addBoard({ x, y: yCenter, z, w, len, hy, geoType, type, texName, slopeZ, curve, leanX });
    const exitY = slopeZ ? yCenter + slopeZ * (len / 2) : yCenter;
    this._cursor = { x, y: exitY, z: z + len / 2 };
    this._clearOverlapping(p); // static pieces never sit inside each other

    if (!safe) {
      // Movement is a property too — a board can slide/lift while tilted or bowed.
      if (chance(this._hazRamp(CONFIG.movingChance, hd))) this._makeMover(p, false);
      // Obstacles stay off ramps/curves: a spike mid-climb you can't avoid is unfair.
      if (type === "normal" && !slopeZ && !curve && len > 12 && chance(this._hazRamp(CONFIG.obstacleChance, hd))) {
        const r = Math.random();
        let kind;
        if (r < 0.34) kind = "spikes";
        else if (r < 0.6) kind = "barrier";
        else if (r < 0.8) kind = "pillars";
        else kind = len > 22 ? "overhead" : "barrier"; // overhead needs grounded runway to be fair
        this._addObstacle(p, kind);
      }
    }
    // Item multiplier (1 normally, more with the cheat code) spawns extra
    // gems/powerups, spread sideways so they don't pile up.
    const py = p.pos.y;
    for (let k = 0; k < this.itemMultiplier; k++) {
      const ox = (k - (this.itemMultiplier - 1) / 2) * 3;
      if (chance(0.4)) this._addGem(x + ox, py + p.hy, z);
      if (chance(CONFIG.powerupChance)) this._addPowerup(x + ox, py + p.hy, z + rand(-len * 0.3, len * 0.3), hd);
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
        texName: bouncy ? "rubber" : this._groundTex(),
      });
      for (let m = 0; m < this.itemMultiplier; m++) {
        const ox = (m - (this.itemMultiplier - 1) / 2) * 2.5;
        if (chance(0.5)) this._addGem(x + ox, y + p.hy, z); // reward exploring off-path
        if (chance(0.2)) this._addPowerup(x + ox, y + p.hy, z, hd);
      }
    }
  }

  _disposePlatform(p) {
    this.scene.remove(p.mesh);
    p.mesh.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    if (p._tex) p._tex.dispose();
    if (p._geo) p._geo.dispose();
    if (p._edgeGeo) p._edgeGeo.dispose(); // curved boards own their edge geometry
  }

  // --- Per-frame ------------------------------------------------------------

  update(dt, playerZ, forwardSpeed, magnetPos = null) {
    this._time += dt;
    this._difficulty = smoothstep(playerZ / CONFIG.difficultyDistance);
    this._spreadD = smoothstep(playerZ / CONFIG.spreadDistance);
    this._biomeTextures = BIOMES[biomeAt(playerZ)].textures; // platforms re-skin per biome

    // Light/extinguish every board's edge outline when blackout flips on/off.
    if (this.blackout !== this._edgeVis) {
      this._edgeVis = this.blackout;
      for (const pl of this.platforms) if (pl._edge) pl._edge.visible = this.blackout;
    }

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
      // While the magnet is pulling a gem, fly it STRAIGHT to the player on all
      // axes — don't bob, or the bob fights the pull and the gem just hovers near
      // you (offset in Y) and never reaches collection range.
      if (magnetPos && g.mesh.position.distanceTo(magnetPos) < CONFIG.magnetRadius) {
        g.mesh.position.lerp(magnetPos, Math.min(1, dt * CONFIG.magnetPull));
      } else {
        g.mesh.position.y = g.baseY + Math.sin(this._time * 2.5 + g.phase) * 0.35;
      }
    }
    for (const u of this.powerups) {
      if (u.collected) continue;
      u.mesh.rotation.y += dt * 1.6;             // spin the group; glyph sits on the y-axis so it stays put
      u.mesh.children[0].rotation.x += dt * 1.3; // tumble just the shape
      // Grounded powerdowns bob only slightly so they never sink into the platform.
      u.mesh.position.y = u.baseY + Math.sin(this._time * 2 + u.phase) * (u.grounded ? 0.12 : 0.4);
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

  // Grounded pickups collect on TOUCH: a modest volume around the ball, not a tall
  // column. `lane` is the x/z reach, `height` the vertical reach. Kept short on
  // purpose so a real jump lifts you clear of a powerdown (you dodge by jumping or
  // steering) while rolling over — or a small hop — still grabs it.
  _reach(pos, playerPos, lane, height) {
    const dx = pos.x - playerPos.x, dz = pos.z - playerPos.z;
    return dx * dx + dz * dz < lane * lane && Math.abs(pos.y - playerPos.y) < height;
  }

  harvestGems(playerPos, radius) {
    const grabbed = [];
    for (const g of this.gems) {
      if (g.collected) continue;
      if (this._reach(g.mesh.position, playerPos, radius + 2, radius + 2)) {
        g.collected = true; g.mesh.visible = false; grabbed.push(g.mesh.position.clone());
      }
    }
    return grabbed;
  }

  harvestPowerups(playerPos, radius) {
    const grabbed = [];
    for (const u of this.powerups) {
      if (u.collected) continue;
      if (this._reach(u.mesh.position, playerPos, radius + 2, radius + 2)) {
        u.collected = true; u.mesh.visible = false;
        grabbed.push({ type: u.type, good: u.good, pos: u.mesh.position.clone() });
      }
    }
    return grabbed;
  }

  // Cheat menu changed the allowed types — yank any already-spawned pickups whose
  // type is no longer enabled, so the filter takes effect immediately (not just on
  // platforms generated from here on).
  pruneDisabledPowerups() {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const u = this.powerups[i];
      if (!u.collected && !this.enabledPowerups.has(u.type)) {
        this.scene.remove(u.mesh); this.powerups.splice(i, 1);
      }
    }
  }

  // Remove an obstacle (e.g. after a shielded hit smashes through it).
  removeObstacle(platform, obstacle) {
    platform.mesh.remove(obstacle.mesh);
    const i = platform.obstacles.indexOf(obstacle);
    if (i >= 0) platform.obstacles.splice(i, 1);
  }
}
