import * as THREE from "three";
import { CONFIG, BIOMES, biomeAt, ramp } from "./config.js";
import { makeTextureLibrary, makeSkinTexture } from "./textures.js";
import { emojiCanvas } from "./icons.js";
import { makeRng } from "./gen/rng.js";
import { openness, danger, hazardChance } from "./gen/progression.js";
import { budgets } from "./gen/reach.js";
import { planStep, planScatter } from "./gen/planPath.js";
import { OBSTACLE_DEFS } from "./gen/pieces.js";

// Render-side randomness (cosmetic mesh jitter, gem bob phase, obstacle patrol). The
// GAMEPLAY decisions that need to be deterministic/testable live in src/gen/*; these
// just decorate, so plain Math.random is fine here.
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ONE source of truth per effect — read these everywhere instead of repeating
// per-effect data in the HUD/toast/loop code:
//   color   — tints the glyph, the 3D pickup mesh, the aura cloud accent, HUD chip + toast
//   shape   — the 3D pickup mesh
//   icon    — emoji shown in-world (above the pickup, orbiting the ball) + in the cheat menu
//   good    — buff (true) vs powerdown (false); good=cool tint, bad=warm
//   weight  — spawn frequency (milder effects common; flight/trip rare)
//   dur     — seconds the timed effect lasts (omitted for shield [boolean until hit] and splat [instant])
//   label   — the toast text shown when you pick it up
export const POWERUP_DEFS = {
  shield:     { color: 0x9fe0ff, shape: "ring",  icon: "🛡️", good: true,  weight: 5,   label: "SHIELD" },
  slow:       { color: 0x2fd9c0, shape: "ico",   icon: "🐢", good: true,  weight: 5,   dur: 10, label: "SLOW-MO" },
  magnet:     { color: 0x4a78ff, shape: "ring",  icon: "🧲", good: true,  weight: 4,   dur: 28, label: "MAGNET" },
  doublejump: { color: 0x6effc0, shape: "knot",  icon: "🦘", good: true,  weight: 3,   dur: 16, label: "DOUBLE JUMP" },
  lowgrav:    { color: 0x9affd6, shape: "octa",  icon: "🌕", good: true,  weight: 2.5, dur: 20, label: "LOW GRAVITY" },
  flight:     { color: 0x7fdfff, shape: "octa",  icon: "🪽", good: true,  weight: 1.3, dur: 12, label: "FLIGHT — hold jump!" },
  reverse:    { color: 0xff9f1c, shape: "box",   icon: "↔️", good: false, weight: 2,   dur: 10, label: "REVERSED!" },
  surge:      { color: 0xff3b3b, shape: "cone",  icon: "⚡", good: false, weight: 3,   dur: 7,  label: "SURGE!" },
  splat:      { color: 0xb5742f, shape: "box",   icon: "💦", good: false, weight: 3,   dur: 10, label: "SPLAT!" },
  morph:      { color: 0xff4bd6, shape: "ico",   icon: "🌀", good: false, weight: 2.5, dur: 20, label: "MORPH!" },
  flubber:    { color: 0xff8f4a, shape: "ico",   icon: "🫧", good: false, weight: 2.5, dur: 20, label: "FLUBBER! — steer in the air" },
  blackout:   { color: 0xd1657f, shape: "octa",  icon: "🌑", good: false, weight: 2,   dur: 18, label: "BLACKOUT! — follow the edge lights" },
  fog:        { color: 0xc2a78f, shape: "box",   icon: "☁️", good: false, weight: 2,   dur: 25, label: "FOGGED! — distance is gone" },
  rain:       { color: 0xc98fb0, shape: "ico",   icon: "🌧️", good: false, weight: 2,   dur: 15, label: "DOWNPOUR! — wipers can't keep up" },
  trip:       { color: 0xff8adf, shape: "tetra", icon: "🌈", good: false, weight: 1.3, dur: 20, label: "TRIPPING!" },
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

// INVERSE-weighted pick: favours the normally-RARE (low spawn-weight) powerups — the "kickass"
// ones (flight, low-grav). Used for the reward on a spicy risk/reward branch.
function rareWeightedPick(keys) {
  let total = 0;
  const w = keys.map((k) => { const x = 1 / POWERUP_DEFS[k].weight; total += x; return x; });
  let r = Math.random() * total;
  for (let i = 0; i < keys.length; i++) { r -= w[i]; if (r <= 0) return keys[i]; }
  return keys[keys.length - 1];
}

// One floating board. The root is an unscaled Group at the board's center so we
// can hang correctly-sized obstacles off it; the visual shape is a scaled child.
// Stores half-extents (hx/hy/hz) so landing is a simple box test.
class Platform {
  constructor(group, hx, hy, hz, type) {
    this.mesh = group; this.hx = hx; this.hy = hy; this.hz = hz;
    this.type = type;            // "normal" | "bouncy" | "boost" | "flipper" | "rune"
    this.obstacles = [];         // {hx,hy,hz, lx,ly,lz, kind}
    this.motion = null;          // {type, amp, period, phase, baseX/Y/Z, baseRotY} — see _applyMotion
    this.dx = 0; this.dy = 0;    // movement applied this frame (so riders move too — Y only is carried)
    this.slopeZ = 0;             // ramp: top rises this much per unit of z
    this.curve = 0;              // curved board: + concave (funnels in), - convex (rolls off)
    this.leanX = 0;              // sideways bank: top rises this much per unit of x (+ raises the +x edge); drags you to the low side
    this._flipT = 0;             // flipper plate: seconds left on the hinge-kick animation (0 = at rest)
    this._springT = 0;           // bouncy plate: seconds left on the dip-then-spring animation (0 = at rest)
    this._tex = null;
    this._geo = null;            // own geometry to dispose (curved/spline boards only)
  }
  get pos() { return this.mesh.position; }
  get topY() { return this.mesh.position.y + this.hy; }
}

// Owns the whole platform world. The BRAIN (where/what/how-big) lives in the pure
// generator under src/gen/; this class is the RENDERER: it asks the generator for a
// plan each step and turns that plan into THREE meshes, then runs the per-frame
// motion/cull/collision bookkeeping.
export class PlatformField {
  constructor(scene) {
    this.scene = scene;
    this.platforms = [];
    this.gems = [];
    this.powerups = [];
    this.tex = makeTextureLibrary();
    // One baked GROUND skin texture per zone (the zone's colour + pattern), cached by
    // zone index since zones repeat through the run. `_zoneSkinTex` is the active one,
    // set per generated piece in _step (keyed to the frontier zone).
    this._skinCache = {};
    this._zoneSkinTex = null;

    this._geoBox = new THREE.BoxGeometry(1, 1, 1);
    this._geoCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
    this._geoHex = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);

    // Glowing edge outlines for the BLACKOUT powerdown: every board gets a wireframe
    // child that lights up only when the lights cut out (emergency-aisle lighting).
    this._edgeMat = new THREE.LineBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0.2 });
    this._edgeGeoBox = new THREE.EdgesGeometry(this._geoBox);
    this._edgeGeoCyl = new THREE.EdgesGeometry(this._geoCyl);
    this._edgeGeoHex = new THREE.EdgesGeometry(this._geoHex);
    this.blackout = false;
    this.beat = 0;          // audiosurf: 0..1 beat pulse — tiles glow faintly on the beat
    this._beatPrev = 0;     // so we run the pulse one extra frame to reset to no-glow
    this._edgeVis = false; // last applied blackout state (so we only re-toggle on change)
    this._emissiveScale = 1; // blackout dims the pieces' OWN glow (emissive) down to ~0; 1 = normal
    this._gemGeo = new THREE.OctahedronGeometry(0.55);

    this._time = 0;
    this._rng = makeRng(Math.random); // the generator's random source (real game = truly random)
    // The difficulty profile (one of CONFIG.gen.tiers) + the two live ramp values it
    // produces. game.js swaps the profile via setProfile(); zen pins danger.
    this.profile = CONFIG.gen.tiers[CONFIG.gen.defaultDifficulty];
    this.fixedDanger = null; // when set (zen), pins the danger ramp here instead of escalating
    this._O = 0;             // openness(playerZ, profile), recomputed each frame
    this._D = 0;             // danger(playerZ) (or fixedDanger), recomputed each frame

    // Beyond this far ahead, pieces are lost in the fog anyway — so we keep GENERATING
    // out to keepAheadDistance (the emitter rides that frontier) but skip RENDERING the
    // far ones. Big win now that the lead is long. Tightened further when fog closes in.
    this.drawDistance = 350;
    this.itemMultiplier = 1; // cheat code bumps this to spawn extra gems/powerups
    this.activeEffects = 0;  // count of currently-active powerups (pushed in from game.js; reserved for rune gating)
    // Cheat-mode test tool: which powerup types are allowed to spawn. Default = all.
    this.enabledPowerups = new Set(Object.keys(POWERUP_DEFS));
    this._biomeBoardMat = BIOMES[0].boardMat;
    this._biomeGenBias = BIOMES[0].genBias;
    // Bake the baseline (zone 0) skin up front so a board can never be built before a
    // skin exists; _step swaps in the live zone's skin per piece.
    this._zoneSkinTex = this._skinCache[0] = makeSkinTexture(BIOMES[0].skin);

    // The generator's walking state — a cursor plus a few counters. Bundled so it can
    // be handed straight to planStep(). Initialized in reset().
    this._state = this._freshState();
  }

  _freshState() {
    return {
      cursor: { x: 0, y: 0, z: 0 },
      stepIndex: 0,
      stepsSinceTunnel: 0,
      stepsSinceSpline: 0,
      drift: { x: 0, y: 0 },
      driftSteps: CONFIG.gen.safeStraight,
      launchRunwayUntilZ: 0, // z the post-flipper straight/flat landing runway extends to
    };
  }

  // game.js calls this when the player picks Easy/Medium/Hard (or toggles zen). The
  // profile is one line of knobs from CONFIG.gen.tiers; zen passes fixedDanger to pin
  // the hazard ramp at a steady level instead of escalating with distance.
  setProfile(profile, { fixedDanger = null } = {}) {
    this.profile = profile;
    this.fixedDanger = fixedDanger;
  }

  // Read-only snapshot of the generation frontier, for the distant emitter VISUAL to
  // track (background.js). `drift` is where the path is currently HEADING (the roaming
  // target) — that's what the emitter points at to telegraph "climb up-right / drop
  // down-left". `cursor` is the live frontier; sprawl/drama size the emitter's mouth.
  get emitterTarget() {
    const s = this._state;
    return {
      cursorX: s.cursor.x, cursorY: s.cursor.y, cursorZ: s.cursor.z,
      driftX: s.drift.x, driftY: s.drift.y,
      sprawl: this.profile.sprawl, drama: this.profile.drama,
    };
  }

  reset() {
    for (const p of this.platforms) this._disposePlatform(p);
    for (const g of this.gems) this.scene.remove(g.mesh);
    for (const u of this.powerups) this.scene.remove(u.mesh);
    this.platforms.length = 0;
    this.gems.length = 0;
    this.powerups.length = 0;
    this._time = 0;
    this._state = this._freshState();

    const starter = this._addBoard({
      x: 0, y: -0.5, z: CONFIG.world.starterLength / 2 - 4,
      w: CONFIG.world.starterWidth, len: CONFIG.world.starterLength, hy: 0.5,
      geoType: "box", type: "normal", texName: "concrete",
    });
    this._state.cursor = { x: 0, y: 0, z: starter.pos.z + starter.hz };
  }

  // --- Construction helpers -------------------------------------------------

  // Turn a plan's abstract texRole into a concrete texture name. Ground boards resolve
  // to the sentinel "ground" → _texFor clones the active ZONE SKIN (the zone's coloured
  // deck); special plates (boost/flipper/rubber/rune) keep their library textures.
  _texForRole(role) {
    return role === "ground" ? "ground" : role;
  }

  // Clone a library texture and set its tiling repeat. `src` lets us tile an
  // alpha map (a different bitmap) with the SAME repeat as its diffuse `name`,
  // so the glass lattice lines up exactly with the grid drawn into the texture.
  _texFor(name, w, len, src = null) {
    // "ground" → the active zone's baked skin (its colour/pattern); else a library tex.
    const base = src || (name === "ground" ? this._zoneSkinTex : this.tex[name]);
    const t = base.clone();
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

  _addBoard({ x, y, z, w, len, hy, geoType, type, texName, slopeZ = 0, curve = 0, leanX = 0, yaw = 0, runePayload = null, spline = null }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Rune plates light themselves CYAN (good) or AMBER (bad) so you can read what
    // you're about to land on from afar. (Runes are currently disabled in the
    // generator, but the rendering + game.js landing handler stay wired.)
    const runeEmissive = runePayload ? (runePayload.good ? 0x2fd9c0 : 0xffae3b) : 0x000000;

    const tex = this._texFor(texName, w, len);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true, // so a piece can FADE IN near the draw horizon (emerge from the backdrop)
      //                    instead of popping its silhouette. opacity stays 1 except in the fade band.
      roughness: type === "bouncy" ? 0.4 : 0.85,
      metalness: 0.05,
      emissive: type === "rune" ? runeEmissive : type === "bouncy" ? 0xff1f5a : type === "boost" ? 0x1fbf4c : type === "flipper" ? 0xff7a1c : 0x000000,
      emissiveIntensity: type === "rune" ? 0.6 : type === "bouncy" ? 0.5 : type === "boost" ? 0.32 : type === "flipper" ? 0.55 : 0,
    });

    // Opaque deck whose SURFACE FEEL comes from the active biome (matte sandstone /
    // glossy ice / inner-glowing void rock) instead of one fixed look — so boards
    // read as a different material per zone, not the same slab re-tinted. Falls back
    // to the glossy neon default if a biome omits boardMat. Only normal decks take it;
    // bouncy/boost/flipper keep the identity glow set above.
    const alphaTex = null;
    if (type === "normal") {
      const bm = this._biomeBoardMat;
      mat.roughness = bm ? bm.roughness : 0.36;
      mat.metalness = bm ? bm.metalness : 0.16;
      // NEON: the deck SELF-ILLUMINATES. Reuse the diffuse skin clone as the emissive map
      // (same UVs + repeat) with white emissive, so the glowing pattern + tinted body emit
      // the zone's colour and catch the bloom pass. THIS is what makes a deck read as neon
      // rather than a dark slab lit by dim scene light. `glow` is the per-zone strength
      // (Neon City/Void blaze; Sunset Dunes stays nearly matte — the contrast is the point).
      mat.emissiveMap = tex;
      mat.emissive.setHex(0xffffff);
      mat.emissiveIntensity = bm && bm.glow != null ? bm.glow : 0.7;
    }

    let visual, ownGeo = null;
    if (spline) {
      // Spline ribbon: a long undulating + meandering heightfield you roll along. It
      // owns its geometry and IS the landable surfaceMesh. The geometry is displaced
      // by the SAME sampler the generator used for the gem trail + death-check.
      ownGeo = this._makeSplineGeo(w, len, spline.sampler);
      mat.side = THREE.DoubleSide;
      visual = new THREE.Mesh(ownGeo, mat);
    } else if (curve) {
      // Curved board: a parabolic surface across its width.
      ownGeo = this._makeCurvedGeo(w, len, curve);
      mat.side = THREE.DoubleSide;
      visual = new THREE.Mesh(ownGeo, mat);
    } else {
      const geo = geoType === "cyl" ? this._geoCyl : geoType === "hex" ? this._geoHex : this._geoBox;
      visual = new THREE.Mesh(geo, mat);
      visual.scale.set(w, hy * 2, len);
    }
    // Angle is independent of shape and curve — any board can tilt. NEGATIVE atan so
    // slopeZ>0 reads as uphill in the travel direction (matches the generator's
    // exit-height convention). Collision raycasts the real mesh, so the surface is
    // always what you see.
    if (slopeZ) visual.rotation.x = -Math.atan(slopeZ);
    // Sideways bank, independent of the ramp pitch. A +z roll lifts the +x edge.
    if (leanX) visual.rotation.z = Math.atan(leanX);
    // Yaw: rotate the heading about the vertical axis so the runway points diagonally.
    // The surface stays horizontal (normal still +Y), so the down-ray is unaffected.
    if (yaw) visual.rotation.y = yaw;
    visual.castShadow = true;
    visual.receiveShadow = true;
    group.add(visual);

    // Emergency edge lighting (lit only during blackout). Child of `visual` so it
    // inherits the board's scale and slope automatically.
    const edgeGeo = (curve || spline) ? new THREE.EdgesGeometry(ownGeo)
      : geoType === "cyl" ? this._edgeGeoCyl
      : geoType === "hex" ? this._edgeGeoHex
      : this._edgeGeoBox;
    const edge = new THREE.LineSegments(edgeGeo, this._edgeMat);
    edge.visible = this.blackout;
    visual.add(edge);

    // Bouncy decks sell the spring via the rubber texture + emissive glow + the dip-then-spring
    // animation on bounce (see update()) — no coil under the deck (it didn't fit the look).

    this.scene.add(group);

    const p = new Platform(group, w / 2, hy, len / 2, type);
    p._tex = tex;
    p._alphaTex = alphaTex; // glass tiles own an alpha-map clone to dispose too
    p._geo = ownGeo;
    p._edge = edge;
    p._edgeGeo = (curve || spline) ? edgeGeo : null; // dispose curved/spline edge geo with the board; shared ones stay
    p.slopeZ = slopeZ;
    p.curve = curve;
    p.leanX = leanX;
    p.yaw = yaw;
    visual.userData.platform = p; // raycast maps a hit back to its Platform
    p.surfaceMesh = visual;       // the one landable mesh

    // Rune plate: hang the effect's glyph above the surface and remember the payload.
    if (runePayload) {
      p.runePayload = runePayload;
      p._runeSpent = false;
      const glyph = this._iconSprite(runePayload.type);
      glyph.position.set(0, hy + 1.4, 0);
      group.add(glyph);
    }

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

  // Build the spline ribbon mesh by displacing a tessellated plane with the shared
  // sampler (src/gen/spline.js). Because the sampler is also what placed the gems and
  // set the death-floor, the visible surface, the gem lane and the fall-check can't
  // drift apart — that used to be three hand-synced copies of this wave math.
  _makeSplineGeo(w, len, sampler) {
    const g = new THREE.PlaneGeometry(w, len, CONFIG.gen.spline.segX, CONFIG.gen.spline.segZ);
    g.rotateX(-Math.PI / 2); // lay flat in xz, facing up (local z = -len/2..+len/2)
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const pz = pos.getZ(i);
      pos.setX(i, pos.getX(i) + sampler.meanderAt(pz)); // slide the strip sideways (still single-valued in x,z)
      pos.setY(i, sampler.heightAt(pz));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals(); // lighting + the normal.y face filter need correct normals
    return g;
  }

  // Blackout can't dim pieces that light THEMSELVES (boost/bouncy emissive), so scale
  // ONLY the plate-surface glow in step with the blackout. Obstacles + gems keep
  // their glow as readable beacons. Lazily records each base; scale=1 restores.
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
  _addObstacle(p, kind, move = false) {
    // Whether this hazard PATROLS was decided by the GENERATOR (so the difficulty rating saw it); the
    // axis comes from the obstacle registry (spikes slide side-to-side, barriers fore/aft).
    const moves = move && !!OBSTACLE_DEFS[kind].patrol;
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
      // A slalom: two tall narrow pillars with a clear lane between. Each pillar is
      // its OWN collision box so the gaps are real openings, not one wide wall.
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
    if (moves) {
      const o = p.obstacles[p.obstacles.length - 1];
      const axis = OBSTACLE_DEFS[kind].patrol; // registry-declared patrol axis (spikes "x", barrier "z")
      const room = (axis === "x" ? p.hx - o.hx : p.hz - o.hz) - 0.5; // stay on the board
      const amp = Math.min(ramp(CONFIG.gen.hazard.obstacleMoveAmp, this._D), Math.max(0, room));
      if (amp > 0.6) {
        o.move = {
          axis, amp, speed: rand(0.8, 1.8), phase: rand(0, Math.PI * 2),
          baseLx: o.lx, baseLz: o.lz, baseMeshX: o.mesh.position.x, baseMeshZ: o.mesh.position.z,
        };
      }
    }
  }

  // Apply a generator-decided MOTION to a freshly-placed board. base{X,Y,Z} are the spawn position
  // the motion oscillates/orbits around; baseRotY the rest yaw the spin/wag rotates from.
  _applyMotion(p, m) {
    p.motion = { ...m, baseX: p.pos.x, baseY: p.pos.y, baseZ: p.pos.z, baseRotY: p.surfaceMesh ? p.surfaceMesh.rotation.y : 0 };
  }

  // A full semi-transparent tube you roll through (kept short so the exit shows
  // through it in the third-person view).
  _addTunnelTube(p, len) {
    const r = CONFIG.gen.tunnel.radius;
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

  _addGem(x, top, z, value = 1) {
    const cluster = value > 1;
    let mesh;
    if (cluster) {
      // A side-quest CLUSTER reads as a BUNCH OF GEMS (not a gold nugget): several small gems packed
      // together + a "×N" label. 5× = the same cyan gems; 10× = richer magenta (rarer = better).
      mesh = new THREE.Group();
      const big = value >= 10;
      const col = big ? 0xff5fe0 : 0x66f0ff, emis = big ? 0xc83cc0 : 0x33d0ff;
      const gmat = new THREE.MeshStandardMaterial({ color: col, emissive: emis, emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.3 });
      const spots = big
        ? [[0, 0, 0], [0.55, 0.15, 0.35], [-0.5, 0.2, -0.3], [0.25, 0.55, -0.25], [-0.3, 0.45, 0.45], [0.1, -0.25, 0.4]]
        : [[0, 0.05, 0], [0.5, 0.2, 0.3], [-0.45, 0.18, -0.25], [0.15, 0.5, -0.2]];
      for (const [px, py, pz] of spots) {
        const gm = new THREE.Mesh(this._gemGeo, gmat);
        gm.position.set(px, py, pz); gm.scale.setScalar(0.78);
        mesh.add(gm);
      }
      mesh.add(this._gemLabel(value, col));
    } else {
      mesh = new THREE.Mesh(this._gemGeo, new THREE.MeshStandardMaterial({
        color: 0x66f0ff, emissive: 0x33d0ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3,
      }));
    }
    const y = top + (cluster ? 1.2 : 0.8); // grounded on the platform — pickups don't float anymore
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.gems.push({ mesh, baseY: y, phase: rand(0, Math.PI * 2), collected: false, value });
  }

  // A camera-facing "×N" label sprite for a cluster gem, glowing the gem's colour.
  _gemLabel(value, color = 0x66f0ff) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const ctx = c.getContext("2d");
    ctx.font = "bold 36px 'Trebuchet MS', system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(6,10,20,0.9)"; ctx.strokeText("×" + value, 32, 34);
    ctx.fillStyle = "#fff"; ctx.shadowColor = "#" + (color & 0xffffff).toString(16).padStart(6, "0"); ctx.shadowBlur = 12;
    ctx.fillText("×" + value, 32, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
    s.scale.set(2.4, 2.4, 1); s.position.set(0, 1.5, 0);
    return s;
  }

  // Pick a powerup type honoring the good/bad ratio, but only from types enabled in
  // the cheat test menu. Falls back to the other pool's enabled types; null if none.
  _pickPowerupType(d, rare = false) {
    // A spicy risk/reward branch (rare=true) always pays a GOOD powerup, biased to the rare/kickass pool.
    const good = rare ? true : chance(ramp(CONFIG.gen.items.goodChance, d));
    const inPool = (list) => list.filter((k) => this.enabledPowerups.has(k));
    const first = inPool(good ? GOOD_POWERUPS : BAD_POWERUPS);
    const pool = first.length ? first : inPool(good ? BAD_POWERUPS : GOOD_POWERUPS);
    if (!pool.length) return null;
    return rare ? rareWeightedPick(pool) : weightedPick(pool);
  }

  _addPowerup(x, top, z, d = 0, rare = false) {
    const type = this._pickPowerupType(d, rare);
    if (!type) return; // every type disabled in the cheat test menu → nothing spawns
    const def = POWERUP_DEFS[type];
    const good = def.good;

    // Everything spawns GROUNDED on the platform, right in the roll lane — you collect
    // or dodge by where you steer/jump, not by reaching up for floaters.
    const y = top + 0.95;

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this._powerGeo(def.shape), new THREE.MeshStandardMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.3,
    }));
    group.add(mesh);
    // Visible "aura" cloud = the actual trigger zone, tinted green for buffs / red for
    // powerdowns so you read good/bad AND its catch range at a glance.
    const aura = new THREE.Mesh(this._auraGeo(), new THREE.MeshBasicMaterial({
      color: good ? 0x46e07a : 0xff5046, transparent: true, opacity: 0.16,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    aura.scale.setScalar(CONFIG.effects.powerupAuraRadius);
    group.add(aura);
    group.add(this._iconSprite(type)); // floating glyph above the shape
    group.position.set(x, y, z);
    this.scene.add(group);
    this.powerups.push({ mesh: group, type, good, grounded: true, baseY: y, phase: rand(0, Math.PI * 2), collected: false });
  }

  // Cached unit sphere for the pickup aura cloud (scaled per-pickup to the radius).
  _auraGeo() {
    if (!this._sphereGeo) this._sphereGeo = new THREE.SphereGeometry(1, 16, 12);
    return this._sphereGeo;
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

  // A camera-facing EMOJI glyph hovering above a pickup or rune plate.
  _iconSprite(key) {
    if (!this._iconCache) this._iconCache = {};
    let mat = this._iconCache[key];
    if (!mat) {
      const def = POWERUP_DEFS[key];
      const c = emojiCanvas(def ? def.icon : "❓");
      mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false });
      this._iconCache[key] = mat;
    }
    const s = new THREE.Sprite(mat);
    s.scale.set(3.0, 3.0, 1);
    s.position.set(0, 2.1, 0);
    return s;
  }

  // Does a candidate box overlap any nearby STATIC platform? Moving boards are
  // ignored — they're allowed to slide over things.
  _overlaps(x, y, z, hx, hy, hz) {
    for (const p of this.platforms) {
      if (p.motion) continue; // moving boards are allowed to slide over things
      if (Math.abs(p.pos.z - z) > p.hz + hz + 40) continue;
      if (Math.abs(p.pos.x - x) <= p.hx + hx + 1 &&
          Math.abs(p.pos.y - y) <= p.hy + hy + 1.5 &&
          Math.abs(p.pos.z - z) <= p.hz + hz + 1) return true;
    }
    return false;
  }

  // Remove any static decor platforms that overlap the just-placed critical platform
  // (the path takes priority), so static pieces never sit inside each other.
  _clearOverlapping(keep) {
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      const p = this.platforms[i];
      if (p === keep || p.motion) continue;
      if (Math.abs(p.pos.z - keep.pos.z) <= p.hz + keep.hz &&
          Math.abs(p.pos.x - keep.pos.x) <= p.hx + keep.hx &&
          Math.abs(p.pos.y - keep.pos.y) <= p.hy + keep.hy + 1) {
        this._disposePlatform(p);
        this.platforms.splice(i, 1);
      }
    }
  }

  // --- Generation (render side) ---------------------------------------------

  // Build the per-step context the pure generator reads.
  _ctx(forwardSpeed) {
    return {
      profile: this.profile,
      O: this._O,
      D: this._D,
      budgets: budgets(forwardSpeed),
      genSpeed: forwardSpeed, // the SUSTAINABLE auto-run speed — used to size the flipper runway
      rng: this._rng,
      itemMultiplier: this.itemMultiplier,
      bias: this._biomeGenBias, // per-biome drama weighting (signature run-shape)
    };
  }

  // Extend the world by one step: ask the generator for the next critical board,
  // render it, then render its scatter cloud (planScatter returns [] for safe/
  // structure steps, so this is a no-op there).
  _step(forwardSpeed) {
    // Key the zone's look + run-shape to WHERE THIS PIECE GOES (the generation
    // frontier), not the player — pieces are built ~800m ahead, so playerZ-keying
    // landed a zone's boards/shape ~800m late, usually in the next zone. Now a board
    // built in the dunes region looks + plays like the dunes, lining up with the
    // fog/sky/weather you cross into (those stay player-keyed in game.js).
    const bIdx = biomeAt(this._state.cursor.z);
    const bi = BIOMES[bIdx];
    this._biomeBoardMat = bi.boardMat;
    this._biomeGenBias = bi.genBias;
    // The zone's baked ground skin (cached per zone — zones repeat as the run cycles).
    this._zoneSkinTex = this._skinCache[bIdx] || (this._skinCache[bIdx] = makeSkinTexture(bi.skin));

    const ctx = this._ctx(forwardSpeed);
    const plan = planStep(this._state, ctx);
    this._renderBoardPlan(plan);
    for (const branch of planScatter(plan, this._state, ctx)) this._renderScatterPlan(branch);
  }

  // Turn a critical/structure plan into meshes + decorations.
  _renderBoardPlan(plan) {
    const p = this._addBoard({
      x: plan.x, y: plan.y, z: plan.z, w: plan.w, len: plan.len, hy: plan.hy,
      geoType: plan.geoType, type: plan.type, texName: this._texForRole(plan.texRole),
      slopeZ: plan.slopeZ, curve: plan.curve, leanX: plan.leanX, yaw: plan.yaw, spline: plan.spline,
    });

    if (plan.spline) {
      p.hx = plan.spline.hxPad;                       // widen the raycast box to include the meander
      p._surfaceMinY = plan.y + plan.spline.surfaceMinOffset; // deepest valley — the real floor for death checks
    }
    if (plan.yaw) {
      // Widen the collision prefilter box to the rotated footprint (the down-ray still
      // hits the real turned mesh; this just keeps the ball in the candidate set).
      p.hx = (plan.w / 2) * Math.abs(Math.cos(plan.yaw)) + (plan.len / 2) * Math.abs(Math.sin(plan.yaw));
      p.hz = (plan.len / 2) * Math.abs(Math.cos(plan.yaw)) + (plan.w / 2) * Math.abs(Math.sin(plan.yaw));
    }
    if (plan.tunnel) this._addTunnelTube(p, plan.len);
    if (plan.kind === "path") this._clearOverlapping(p); // critical path takes priority over decor
    if (plan.motion) this._applyMotion(p, plan.motion);
    if (plan.obstacle) this._addObstacle(p, plan.obstacle.kind, plan.obstacle.move);

    for (const g of plan.gems) this._addGem(g.x, g.top, g.z, g.value);
    for (const u of plan.powerups) this._addPowerup(u.x, u.top, u.z, this._D);
    return p;
  }

  // Render a branch (scatter) candidate. The generator can't see the placed world, so
  // overlap resolution happens here: if the candidate overlaps an existing static board,
  // SKIP it. (We used to nudge it upward instead, which piled overlapping branches into
  // unreachable vertical towers — the "3 pieces stacked, no way to reach any" bug. With
  // the wide spread, overlaps are rare, so skipping just thins the odd collision.)
  _renderScatterPlan(b) {
    if (this._overlaps(b.x, b.y, b.z, b.w / 2, b.hy, b.len / 2)) return;
    const p = this._addBoard({
      x: b.x, y: b.y, z: b.z, w: b.w, len: b.len, hy: b.hy,
      geoType: b.geoType, type: b.type, texName: this._texForRole(b.texRole),
    });
    if (b.motion) this._applyMotion(p, b.motion); // branches may move (wag/orbit too — off-path)
    for (const g of b.gems) this._addGem(g.x, g.top, g.z, g.value);
    for (const u of b.powerups) this._addPowerup(u.x, u.top, u.z, this._D, u.rare); // spicy branch → rare-pool bias
  }

  _disposePlatform(p) {
    this.scene.remove(p.mesh);
    p.mesh.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    if (p._tex) p._tex.dispose();
    if (p._alphaTex) p._alphaTex.dispose();
    if (p._geo) p._geo.dispose();
    if (p._edgeGeo) p._edgeGeo.dispose(); // curved/spline boards own their edge geometry
  }

  // --- Per-frame ------------------------------------------------------------

  update(dt, playerZ, forwardSpeed, magnetPos = null) {
    this._time += dt;
    // The two ramps: openness opens the journey FAST (scaled per-tier), danger ramps
    // threat SLOWLY (or is pinned by zen). Everything the generator does reads these.
    this._O = openness(playerZ, this.profile);
    this._D = this.fixedDanger != null ? this.fixedDanger : danger(playerZ, this.profile);
    // NOTE: the biome a piece is built FOR (textures/boardMat/genBias) is keyed to the
    // GENERATION FRONTIER, not playerZ — see _step(). Pieces are generated up to
    // keepAheadDistance (~800m) ahead, so keying them to playerZ made a zone's shape +
    // material land ~800m late (often in the NEXT zone, since zones are 600-900m long).
    // The fog/sky/weather stay playerZ-keyed in game.js (they're the air around YOU), so
    // keying boards to the frontier is what makes the ground match the air you cross into.

    // Light/extinguish every board's edge outline when blackout flips on/off.
    if (this.blackout !== this._edgeVis) {
      this._edgeVis = this.blackout;
      for (const pl of this.platforms) if (pl._edge) pl._edge.visible = this.blackout;
    }

    while (this._state.cursor.z < playerZ + CONFIG.world.keepAheadDistance) this._step(forwardSpeed);

    // Drive the MOVING platforms by type, recording the per-frame delta. Only dy is CARRIED to the
    // rider (player.js) — so lift carries you up/down, while slide/orbit slide out from under (you
    // steer to track them). Critical movers are lift/slide/spin only; wag/orbit are branch decor.
    for (const p of this.platforms) {
      if (!p.motion) { p.dx = 0; p.dy = 0; continue; }
      const mo = p.motion;
      const w = (Math.PI * 2) / Math.max(0.1, mo.period);
      const ph = this._time * w + mo.phase;
      if (mo.type === "lift") {
        const ny = mo.baseY + Math.sin(ph) * mo.amp;
        p.dx = 0; p.dy = ny - p.pos.y; p.pos.y = ny;
      } else if (mo.type === "slide") {
        const nx = mo.baseX + Math.sin(ph) * mo.amp;
        p.dx = nx - p.pos.x; p.dy = 0; p.pos.x = nx;
      } else if (mo.type === "spin") {
        p.dx = 0; p.dy = 0;
        if (p.surfaceMesh) p.surfaceMesh.rotation.y = mo.baseRotY + ph; // continuous turntable (round top → landing spot fixed)
      } else if (mo.type === "wag") {
        p.dx = 0; p.dy = 0;
        if (p.surfaceMesh) p.surfaceMesh.rotation.y = mo.baseRotY + Math.sin(ph) * mo.amp; // metronome wag
      } else if (mo.type === "orbit") {
        // Trace a circle on a plane tilted from flat (axisTilt 0 = ground plane) toward vertical
        // (PI/2 = Ferris wheel), coupling up/down with toward/away. Branch-only.
        const c = Math.cos(ph) * mo.amp, s = Math.sin(ph) * mo.amp, tilt = mo.axisTilt || 0;
        const nx = mo.baseX + c, ny = mo.baseY + s * Math.sin(tilt), nz = mo.baseZ + s * Math.cos(tilt);
        p.dx = nx - p.pos.x; p.dy = ny - p.pos.y; p.pos.x = nx; p.pos.y = ny; p.pos.z = nz;
      }
    }

    // Flipper plates: animate the hinge kick while _flipT counts down. Pure visual
    // juice — the launch already fired the instant you touched it.
    for (const p of this.platforms) {
      if (p._flipT <= 0) continue;
      p._flipT = Math.max(0, p._flipT - dt);
      const m = p.surfaceMesh;
      if (!m) continue;
      const phase = 1 - p._flipT / CONFIG.plates.flipper.flipTime; // 0 -> 1 across the kick
      const a = Math.sin(phase * Math.PI) * 1.2;            // lift to ~69°, then back to flat
      // Hinge at the FAR (+z) edge; the NEAR edge swings UP so the surface deflects
      // you FORWARD (matches the actual launch) — like a diving board.
      m.rotation.x = a;
      m.position.y = p.hz * Math.sin(a);
      m.position.z = p.hz * (1 - Math.cos(a));
      if (p._flipT === 0) { m.rotation.x = 0; m.position.set(0, 0, 0); } // settle flat
    }

    // Bouncy plates: a quick DIP-then-SPRING on the deck when bounced — a trampoline rebound (pure
    // juice; the launch already fired). Replaces the old coil-spring decoration under the board.
    for (const p of this.platforms) {
      if (p._springT <= 0) continue;
      p._springT = Math.max(0, p._springT - dt);
      const m = p.surfaceMesh;
      if (!m) continue;
      const phase = 1 - p._springT / CONFIG.plates.bounce.springTime; // 0 -> 1
      const s = Math.sin(phase * Math.PI * 2);   // down (compress) → up (spring) → settle
      m.position.y = -s * 0.7;
      m.scale.y = (p.hy * 2) * (1 - s * 0.2);     // thinner mid-dip, fuller mid-spring
      if (p._springT === 0) { m.position.y = 0; m.scale.y = p.hy * 2; } // settle to rest
    }

    // Patrolling obstacles: slide barriers/spikes along their platform. Move BOTH the
    // mesh AND the collision box by the same offset so the hitbox tracks the visual.
    for (const p of this.platforms) {
      for (const o of p.obstacles) {
        if (!o.move) continue;
        const mv = o.move;
        const off = Math.sin(this._time * mv.speed + mv.phase) * mv.amp;
        if (mv.axis === "x") { o.lx = mv.baseLx + off; o.mesh.position.x = mv.baseMeshX + off; }
        else { o.lz = mv.baseLz + off; o.mesh.position.z = mv.baseMeshZ + off; }
      }
    }

    // Audiosurf: faint cool glow pulse on the plain ground tiles in time with the beat.
    if (this.beat > 0.003 || this._beatPrev > 0.003) {
      const g = this.beat;
      for (const p of this.platforms) {
        if (p.type !== "normal") continue;
        const m = p.surfaceMesh && p.surfaceMesh.material;
        if (!m || !m.isMeshStandardMaterial || m.userData.baseEmissive > 0) continue; // skip plates that already glow
        m.emissive.setRGB(g * 0.1, g * 0.17, g * 0.22);
        m.emissiveIntensity = 1;
      }
    }
    this._beatPrev = this.beat;

    for (const g of this.gems) {
      if (g.collected) continue;
      if (g.value > 1) g.mesh.rotation.y += dt * 1.5; // cluster spins on Y only so the ×N label stays upright
      else { g.mesh.rotation.y += dt * 2.2; g.mesh.rotation.x += dt * 1.1; }
      // While the magnet is pulling a gem, fly it STRAIGHT to the player on all axes —
      // don't bob, or the bob fights the pull and the gem hovers near you forever.
      if (magnetPos && g.mesh.position.distanceTo(magnetPos) < CONFIG.effects.magnetRadius) {
        g.mesh.position.lerp(magnetPos, Math.min(1, dt * CONFIG.effects.magnetPull));
      } else {
        g.mesh.position.y = g.baseY + Math.sin(this._time * 2.5 + g.phase) * 0.35;
      }
    }
    for (const u of this.powerups) {
      if (u.collected) continue;
      u.mesh.rotation.y += dt * 1.6;             // spin the group; glyph sits on the y-axis so it stays put
      u.mesh.children[0].rotation.x += dt * 1.3; // tumble just the shape
      u.mesh.position.y = u.baseY + Math.sin(this._time * 2 + u.phase) * (u.grounded ? 0.12 : 0.4);
    }

    // Cull behind; HIDE (don't render) far-ahead pieces lost in the fog. The draw
    // horizon tightens when the fog closes in (fog powerdown) so we stop rendering murk.
    const cullZ = playerZ - CONFIG.world.cullBehindDistance;
    const fogFar = (this.scene.fog && this.scene.fog.far) || 1e9;
    const drawZ = playerZ + Math.min(this.drawDistance, fogFar + 120);
    const band = CONFIG.world.emergeBand;
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      const p = this.platforms[i];
      if (p.pos.z + p.hz < cullZ) { this._disposePlatform(p); this.platforms.splice(i, 1); continue; }
      const nearEdge = p.pos.z - p.hz;
      const vis = nearEdge < drawZ;
      p.mesh.visible = vis;
      // EMERGE: fade opacity in over the last `band` metres before the draw horizon, so the piece
      // materialises out of the fog instead of popping its silhouette against the backdrop.
      if (vis && p.surfaceMesh && p.surfaceMesh.material.transparent) {
        p.surfaceMesh.material.opacity = Math.max(0, Math.min(1, (drawZ - nearEdge) / band));
      }
    }
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      if (g.mesh.position.z < cullZ) { this.scene.remove(g.mesh); this.gems.splice(i, 1); continue; }
      if (!g.collected) g.mesh.visible = g.mesh.position.z < drawZ;
    }
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const u = this.powerups[i];
      if (u.mesh.position.z < cullZ) { this.scene.remove(u.mesh); this.powerups.splice(i, 1); continue; }
      if (!u.collected) u.mesh.visible = u.mesh.position.z < drawZ;
    }
  }

  // Lowest platform top among the floors currently drawn around the player. Death is
  // measured against this so you never die while a tile you could have landed on is
  // still on screen below you. Returns -Infinity if none nearby.
  lowestTopNear(z) {
    let min = Infinity;
    for (const p of this.platforms) {
      // Look further AHEAD (out to the keep-ahead horizon): during a long descending
      // hop the board you're falling toward must count, or the floor reads as the high
      // board you just left and you "die" in mid-air over a perfectly good gap.
      if (p.pos.z < z - 25 || p.pos.z > z + 190) continue;
      // A spline's rolling surface dips to its valleys (below the flat topY). Use that
      // depth so rolling/falling through a deep trough isn't mistaken for falling off.
      const surf = p._surfaceMinY != null ? p._surfaceMinY : p.topY;
      if (surf < min) min = surf;
    }
    return min === Infinity ? -Infinity : min;
  }

  // Grounded pickups collect on TOUCH: a modest volume around the ball, not a tall
  // column — so a real jump lifts you clear of a powerdown while rolling over grabs it.
  _reach(pos, playerPos, lane, height) {
    const dx = pos.x - playerPos.x, dz = pos.z - playerPos.z;
    return dx * dx + dz * dz < lane * lane && Math.abs(pos.y - playerPos.y) < height;
  }

  harvestGems(playerPos, radius) {
    const grabbed = [];
    for (const g of this.gems) {
      if (g.collected) continue;
      if (this._reach(g.mesh.position, playerPos, radius + 2, radius + 2)) {
        g.collected = true; g.mesh.visible = false;
        grabbed.push({ pos: g.mesh.position.clone(), value: g.value || 1 });
      }
    }
    return grabbed;
  }

  harvestPowerups(playerPos, radius) {
    const grabbed = [];
    const aura = CONFIG.effects.powerupAuraRadius + radius; // matches the visible cloud (cloud radius + ball radius)
    for (const u of this.powerups) {
      if (u.collected) continue;
      if (this._reach(u.mesh.position, playerPos, aura, aura)) {
        u.collected = true; u.mesh.visible = false;
        grabbed.push({ type: u.type, good: u.good, pos: u.mesh.position.clone() });
      }
    }
    return grabbed;
  }

  // Cheat menu changed the allowed types — yank any already-spawned pickups whose type
  // is no longer enabled, so the filter takes effect immediately.
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
