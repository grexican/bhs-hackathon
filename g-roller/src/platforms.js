import * as THREE from "three";
import { CONFIG, jumpReach, ramp, smoothstep } from "./config.js";
import { makeTextureLibrary, GROUND_TEXTURES } from "./textures.js";

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

// One floating board. The root is an unscaled Group at the board's center so we
// can hang correctly-sized obstacles off it; the visual shape is a scaled child.
// Stores half-extents (hx/hy/hz) so landing is a simple box test.
class Platform {
  constructor(group, hx, hy, hz, type) {
    this.mesh = group; this.hx = hx; this.hy = hy; this.hz = hz;
    this.type = type;            // "normal" | "bouncy" | "boost"
    this.obstacles = [];         // {hx,hy,hz, lx,ly,lz, kind}
    this.mover = null;           // {axis, amp, speed, phase, baseX, baseY}
    this.dx = 0; this.dy = 0;    // movement applied this frame (so riders move too)
    this._tex = null;
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

    this._time = 0;
    this._difficulty = 0;
    this._stepIndex = 0;
    this._cursor = { x: 0, y: 0, z: 0 };
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
    this._stepIndex = 0;

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

  _addBoard({ x, y, z, w, len, hy, geoType, type, texName }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const tex = this._texFor(texName, w, len);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: type === "bouncy" ? 0.4 : 0.85,
      metalness: 0.05,
      emissive: type === "bouncy" ? 0xff1f5a : type === "boost" ? 0x14a0d0 : 0x000000,
      emissiveIntensity: type === "bouncy" ? 0.5 : type === "boost" ? 0.6 : 0,
    });
    const geo = geoType === "cyl" ? this._geoCyl : geoType === "hex" ? this._geoHex : this._geoBox;
    const visual = new THREE.Mesh(geo, mat);
    visual.scale.set(w, hy * 2, len);
    visual.castShadow = true;
    visual.receiveShadow = true;
    group.add(visual);
    this.scene.add(group);

    const p = new Platform(group, w / 2, hy, len / 2, type);
    p._tex = tex;
    this.platforms.push(p);
    return p;
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
    p.mover = { axis: chance(0.78) ? "x" : "y", amp, speed: rand(0.7, 1.5), phase: rand(0, Math.PI * 2), baseX: p.pos.x, baseY: p.pos.y };
  }

  _addGem(x, y, z) {
    const mesh = new THREE.Mesh(this._gemGeo, new THREE.MeshStandardMaterial({
      color: 0x66f0ff, emissive: 0x33d0ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3,
    }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.gems.push({ mesh, baseY: y, phase: rand(0, Math.PI * 2), collected: false });
  }

  // Floating power pickup. Good ones help, bad ones (powerdowns) you want to
  // dodge. Early on pickups are almost all good; powerdowns ramp in with difficulty.
  _addPowerup(x, y, z, d = 0) {
    const goodTypes = ["shield", "magnet", "slow", "doublejump", "flight"];
    const badTypes = ["reverse", "surge", "morph", "splat"];
    const good = chance(ramp(CONFIG.goodPowerupChance, d));
    const type = good ? pick(goodTypes) : pick(badTypes);

    const colors = {
      shield: 0x35e0ff, magnet: 0xb06bff, slow: 0x4dff8a, doublejump: 0x7cff5a, flight: 0xffe14d,
      reverse: 0xff9f1c, surge: 0xff3b3b, morph: 0xc04bff, splat: 0x8a5a2b,
    };
    let geo;
    if (type === "shield" || type === "magnet") geo = new THREE.TorusGeometry(0.7, 0.22, 12, 20);
    else if (type === "slow" || type === "morph") geo = new THREE.IcosahedronGeometry(0.8);
    else if (type === "doublejump") geo = new THREE.TorusKnotGeometry(0.5, 0.18, 60, 8);
    else if (type === "flight") geo = new THREE.OctahedronGeometry(0.85);
    else if (type === "reverse" || type === "splat") geo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    else geo = new THREE.ConeGeometry(0.7, 1.4, 8);

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: colors[type], emissive: colors[type], emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.3,
    }));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.powerups.push({ mesh, type, good, baseY: y, phase: rand(0, Math.PI * 2), collected: false });
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

  _extendPath(forwardSpeed) {
    const d = this._difficulty;
    const reach = jumpReach();
    const maxRise = reach.height * CONFIG.pathRiseSafety;
    const maxGap = forwardSpeed * reach.airTime * CONFIG.pathGapSafety;
    const maxLateral = CONFIG.sideSpeed * reach.airTime * CONFIG.pathLateralSafety;

    // During the safe intro, pin difficulty to 0 so the first pads are long,
    // wide, flat and close together no matter what — a gentle on-ramp.
    const safe = this._stepIndex < CONFIG.safeSteps;
    const dd = safe ? 0 : d;

    const g = this._randGeo();
    const round = g.geoType !== "box";

    // Pads start long & wide, then shrink as difficulty climbs.
    const w = rand(ramp(CONFIG.padWidthLo, dd), ramp(CONFIG.padWidthHi, dd));
    let len = rand(ramp(CONFIG.padLenLo, dd), ramp(CONFIG.padLenHi, dd));
    if (round) len = Math.min(len, rand(8, 14)); // round pads stay compact

    // Forward gap, sideways step and height change all grow toward the
    // reachable maximum as difficulty climbs (clamped so it stays jumpable).
    const gap = THREE.MathUtils.clamp(
      rand(maxGap * ramp(CONFIG.gapFracLo, dd), maxGap * ramp(CONFIG.gapFracHi, dd)), 3, maxGap
    );
    const lateral = maxLateral * ramp(CONFIG.lateralFrac, dd);
    const dyUp = maxRise * ramp(CONFIG.riseFrac, dd);
    const dy = rand(ramp(CONFIG.dropDepth, dd), dyUp);

    // Sudden lateral path change ("last minute" swerve) vs. a gentle drift.
    const sharp = !safe && chance(ramp(CONFIG.sharpTurnChance, d));
    const dx = sharp ? (chance(0.5) ? 1 : -1) * rand(lateral * 0.7, lateral)
                     : rand(-lateral, lateral);

    const x = THREE.MathUtils.clamp(this._cursor.x + dx, -CONFIG.maxBandX, CONFIG.maxBandX);
    const y = this._cursor.y + dy;
    const z = this._cursor.z + gap + len / 2;

    const type = !safe && chance(0.1) ? "boost" : "normal";
    const texName = type === "boost" ? "boost" : pick(GROUND_TEXTURES);

    const p = this._addBoard({ x, y, z, w, len, hy: g.hy, geoType: g.geoType, type, texName });
    this._cursor = { x, y, z: z + len / 2 };

    if (!safe) {
      if (chance(ramp(CONFIG.movingChance, d))) this._makeMover(p, false);
      if (type === "normal" && len > 12 && chance(ramp(CONFIG.obstacleChance, d))) {
        this._addObstacle(p, chance(0.55) ? "barrier" : "spikes");
      }
    }

    if (chance(0.4)) this._addGem(x, y + p.hy + 2.4, z);
    if (chance(CONFIG.powerupChance)) this._addPowerup(x, y + p.hy + 3.2, z + rand(-len * 0.3, len * 0.3), d);

    // Fork: an alternate branch on the other side (overlap-checked).
    if (!safe && chance(ramp(CONFIG.forkChance, d))) this._spawnBranch(x, y, z, maxLateral);
    // Plain bonus side platform.
    else if (chance(0.45)) this._spawnSide(x, y, z);

    this._stepIndex++;
  }

  _spawnBranch(x, y, z, maxLateral) {
    const side = chance(0.5) ? 1 : -1;
    const bx = THREE.MathUtils.clamp(x + side * rand(maxLateral * 0.8, maxLateral * 1.3), -CONFIG.maxBandX - 6, CONFIG.maxBandX + 6);
    const by = y + rand(-3, 4);
    const blen = rand(10, 18), bw = rand(6, 9);
    if (this._overlaps(bx, by, z, bw / 2, 0.5, blen / 2)) return;
    const g = this._randGeo();
    const p = this._addBoard({ x: bx, y: by, z, w: bw, len: blen, hy: g.hy, geoType: g.geoType, type: "normal", texName: pick(GROUND_TEXTURES) });
    if (chance(0.6)) this._addGem(bx, by + p.hy + 2.4, z); // reward the risky branch
    if (chance(0.3)) this._addPowerup(bx, by + p.hy + 3.2, z);
  }

  _spawnSide(x, y, z) {
    const side = chance(0.5) ? 1 : -1;
    const sx = THREE.MathUtils.clamp(x + side * rand(9, 16), -CONFIG.maxBandX - 8, CONFIG.maxBandX + 8);
    const sy = y + rand(-3, 5), sLen = rand(7, 14), sW = rand(6, 9), sz = z + rand(-6, 6);
    if (this._overlaps(sx, sy, sz, sW / 2, 0.5, sLen / 2)) return;
    const bouncy = chance(0.4);
    const g = this._randGeo();
    const p = this._addBoard({
      x: sx, y: sy, z: sz, w: sW, len: sLen, hy: bouncy ? 0.5 : g.hy,
      geoType: bouncy ? "box" : g.geoType,
      type: bouncy ? "bouncy" : "normal",
      texName: bouncy ? "rubber" : pick(GROUND_TEXTURES),
    });
    this._addGem(sx, sy + p.hy + 2.4, sz);
  }

  _disposePlatform(p) {
    this.scene.remove(p.mesh);
    p.mesh.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    if (p._tex) p._tex.dispose();
  }

  // --- Per-frame ------------------------------------------------------------

  update(dt, playerZ, forwardSpeed) {
    this._time += dt;
    this._difficulty = smoothstep(playerZ / CONFIG.difficultyDistance);

    while (this._cursor.z < playerZ + CONFIG.keepAheadDistance) this._extendPath(forwardSpeed);

    // Move the sliding platforms and record their per-frame delta so riders
    // (the player) can be carried along.
    for (const p of this.platforms) {
      if (!p.mover) { p.dx = 0; p.dy = 0; continue; }
      const m = p.mover;
      const o = Math.sin(this._time * m.speed + m.phase) * m.amp;
      if (m.axis === "x") {
        const nx = m.baseX + o; p.dx = nx - p.pos.x; p.dy = 0; p.pos.x = nx;
      } else {
        const ny = m.baseY + o; p.dy = ny - p.pos.y; p.dx = 0; p.pos.y = ny;
      }
    }

    for (const g of this.gems) {
      if (g.collected) continue;
      g.mesh.rotation.y += dt * 2.2; g.mesh.rotation.x += dt * 1.1;
      g.mesh.position.y = g.baseY + Math.sin(this._time * 2.5 + g.phase) * 0.35;
    }
    for (const u of this.powerups) {
      if (u.collected) continue;
      u.mesh.rotation.y += dt * 1.8; u.mesh.rotation.z += dt * 0.9;
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

  // Pull uncollected gems toward the player while a magnet is active.
  attract(playerPos, dt) {
    for (const g of this.gems) {
      if (g.collected) continue;
      if (g.mesh.position.distanceTo(playerPos) < 22) {
        g.mesh.position.lerp(playerPos, Math.min(1, dt * 6));
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
