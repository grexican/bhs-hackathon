import * as THREE from "three";
import { Emitter } from "./emitter.js";

// The far scenery behind the action: a glowing moon, drifting nebula clouds,
// and two parallax skyline ranges on either side. Everything ignores fog and
// follows the player down the track so it never scrolls out of view.

// The SIDE BUILDINGS silhouette. Each biome gets a genuinely different skyline SHAPE
// (not just a recoloured tower) so the walls flanking the track read as a different
// world: city = tall towers, dunes = low mesas + pyramids, ice = jagged crystal
// spires, void = sparse floating monoliths. Bodies stay near-black; only the bright
// WHITE windows take the cycling biome colour (keeps the tint ON the lit windows, not
// washing the whole scene). `style` picks the silhouette; `opts` lets a zone tweak its
// own variant of that silhouette — { heightScale, gapScale, density } — so even two
// "towers" zones (Neon City, Cobalt Groove) get visibly different walls (taller/denser
// vs sparser/shorter), per the "buildings should change SOMEHOW per zone" note.
function skylineTexture(style = "towers", opts = {}) {
  const hs = opts.heightScale ?? 1, gs = opts.gapScale ?? 1, dens = opts.density ?? 1;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 256);
  const body = "#0b0b13";
  const R = Math.random;
  const win = "rgba(255,252,255,0.92)";
  // Scatter `n` bright windows across a rectangular building footprint.
  const windows = (x, top, w, h, density) => {
    ctx.fillStyle = win;
    const cols = Math.max(1, Math.floor(w / 9)), rows = Math.max(1, Math.floor(h / 16));
    for (let cc = 0; cc < cols; cc++)
      for (let rr = 0; rr < rows; rr++)
        if (R() < density) ctx.fillRect(x + 4 + cc * 9, top + 8 + rr * 14, 5, 7);
    ctx.fillStyle = body;
  };

  let x = 0;
  ctx.fillStyle = body;
  if (style === "mesas") {
    // DUNES: low, wide flat-topped buttes + the occasional pyramid. Short, sparse warm windows.
    while (x < 512) {
      if (R() < 0.32) { // pyramid / dune
        const w = 44 + R() * 86, h = (28 + R() * 64) * hs;
        ctx.beginPath(); ctx.moveTo(x, 256); ctx.lineTo(x + w / 2, 256 - h); ctx.lineTo(x + w, 256); ctx.closePath(); ctx.fill();
        x += w + (6 + R() * 18) * gs;
      } else { // wide flat mesa, sometimes stepped
        const w = 52 + R() * 96, h = (22 + R() * 52) * hs;
        ctx.fillRect(x, 256 - h, w, h);
        if (R() < 0.5) ctx.fillRect(x + w * 0.2, 256 - h - (10 + R() * 20), w * 0.55, 10 + R() * 20);
        windows(x, 256 - h, w, h, 0.16 * dens);
        x += w + (8 + R() * 16) * gs;
      }
    }
  } else if (style === "spires") {
    // ICE: jagged crystal spires — tall sharp triangles, overlapping into a ridge. Few glints.
    while (x < 512) {
      const w = 16 + R() * 32, h = (70 + R() * 155) * hs;
      ctx.beginPath(); ctx.moveTo(x, 256); ctx.lineTo(x + w / 2, 256 - h); ctx.lineTo(x + w, 256); ctx.closePath(); ctx.fill();
      // a couple of bright glints up the spine
      ctx.fillStyle = win;
      for (let i = 0; i < 3; i++) if (R() < 0.4) ctx.fillRect(x + w / 2 - 1, 256 - h * (0.3 + i * 0.2), 3, 5);
      ctx.fillStyle = body;
      x += w * (0.55 + R() * 0.35) * gs; // overlap → a serrated ridge
    }
  } else if (style === "monoliths") {
    // VOID: sparse, very tall thin slabs with big gaps — floating monoliths in the dark.
    while (x < 512) {
      x += (36 + R() * 86) * gs / dens; // big gap before each (sparser when density<1)
      const w = 10 + R() * 26, h = (120 + R() * 125) * hs;
      ctx.fillRect(x, 256 - h, w, h);
      windows(x, 256 - h, w, h, 0.1); // a few cold window dots
      x += w;
    }
  } else {
    // CITY (default): tall rectangular towers, dense windows. density<1 → occasional gaps.
    while (x < 512) {
      const w = 18 + R() * 46, h = (40 + R() * 170) * hs;
      ctx.fillRect(x, 256 - h, w, h);
      windows(x, 256 - h, w, h, 0.5);
      x += w + 4 * gs;
      if (R() > dens) x += 24 + R() * 40; // sparser skyline → leave a gap (a city "plot")
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(8, 0.8); // many repeats so buildings stay their size across the long wall
  return tex;
}

function cloudTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(150,120,255,0.5)");
  g.addColorStop(1, "rgba(150,120,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// A wide, wispy fog band: soft horizontal streaks of soft light fading to nothing
// at the edges. Tiled across a huge plane far below to read as a cloud deck.
function mistTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 512);
  // scatter many soft blobs, biased into horizontal smears for a layered-cloud feel
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const rx = 50 + Math.random() * 120;
    const ry = 12 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    const a = 0.04 + Math.random() * 0.1;
    g.addColorStop(0, `rgba(190,170,255,${a})`);
    g.addColorStop(1, "rgba(190,170,255,0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx); // squash into a horizontal streak
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// A faint pool of city-lights glow seen from very high up: warm/cool speckle on a
// dark radial vignette, so the abyss below has a distant, glowing floor of lights.
function farLightsTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  // near-BLACK base that fades to transparent at the rim (so it melts into the void).
  // Only a faint cool tint — not the dramatic purple it was — so the colored city
  // specks below carry the look, not a glowing purple pool.
  const base = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
  base.addColorStop(0, "rgba(10,9,20,0.5)");
  base.addColorStop(0.6, "rgba(5,5,11,0.24)");
  base.addColorStop(1, "rgba(2,2,6,0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // tiny lit specks, denser toward the centre, like a distant illuminated city
  for (let i = 0; i < 460; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() ** 0.6 * 240; // bias inward
    const x = 256 + Math.cos(ang) * r;
    const y = 256 + Math.sin(ang) * r;
    const fade = 1 - r / 256;
    // Mostly warm amber lights with some cyan — NO purple/blue (read as "too purple"),
    // and dimmer/less saturated so it's a faint pool, not a glow.
    const warm = Math.random() < 0.62;
    const hue = warm ? 35 + Math.random() * 20 : 186 + Math.random() * 26;
    ctx.fillStyle = `hsla(${hue}, 60%, 56%, ${0.09 + Math.random() * 0.2 * fade})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  return new THREE.CanvasTexture(c);
}

// A near-black radial disc that fades to transparent at the rim. Laid UNDER the
// additive city-lights plane as an occluder, so the specks read on black instead of
// on the purple void showing through the see-through additive plane.
function darkPoolTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, "rgba(3,3,5,1)");
  g.addColorStop(0.7, "rgba(2,2,4,0.85)");
  g.addColorStop(1, "rgba(1,1,2,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class Background {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Glowing moon.
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(80, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(102, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.18, fog: false })
    );
    this.moon.add(halo);
    this.moon.material.transparent = true; // so the blackout powerdown can fade it
    this._halo = halo;
    // Pegged FAR in the distance (z within the 1200 far-plane), high in the sky. It
    // also tracks the player's x/y (see update) so you can never wander/climb "up to"
    // it — it stays a fixed, distant moon beyond the city. Bigger so it reads at range.
    this.moonOffset = new THREE.Vector3(120, 165, 960);
    this.group.add(this.moon);
    // HIDDEN: the distant emitter (below) is now the focal point in the sky. Kept, not
    // deleted — flip back to true to bring the moon back.
    this.moon.visible = false;

    this.dim = 0; // 0 = normal sky, 1 = blacked out (driven by the blackout powerdown)

    this._t = 0; // colour-cycle time (always advances)
    this._driftT = 0; // building-scroll time (only advances while playing)

    // --- Per-biome mood. setBiome(...) parks TARGET tints here; update() eases the
    // live colours toward them every frame so crossing a zone is a smooth ~2s mood
    // shift, not a snap. The skyline hue cycle CENTERS on _hueTarget (±_spreadTarget)
    // so each zone reads as one colour family while still gently breathing.
    this._hue = 0.72; this._hueTarget = 0.72;          // skyline hue centre
    this._spread = 0.12; this._spreadTarget = 0.12;    // how far the cycle wanders
    this._sat = 0.62; this._satTarget = 0.62;          // skyline window SATURATION (hard zone colour vs lively city)
    this._moonTint = new THREE.Color(0xffe9b0); this._moonTarget = new THREE.Color(0xffe9b0);
    this._haloTint = new THREE.Color(0xffd27a); this._haloTarget = new THREE.Color(0xffd27a);
    this._nebTint = new THREE.Color(0x9678ff); this._nebTarget = new THREE.Color(0x9678ff);
    // City-light FLOOR tint — the glowing city far below takes on the zone's colour too,
    // so the whole "city lighting" reads as the zone, not a fixed amber/cyan pool.
    this._cityTint = new THREE.Color(0xffffff); this._cityTarget = new THREE.Color(0xffffff);
    this._cloudLevel = 1; this._cloudLevelTarget = 1; // nebula-cloud opacity (0 in the Void — empty sky)
    this._skylineSig = ""; // style+variation signature — regenerate the walls when it changes
    this._skyFade = 1; this._skyFading = false; // on a zone change the new skyline FADES in (under the flash) instead of popping

    // Drifting nebula sprites.
    this.clouds = [];
    const cloudMat = new THREE.SpriteMaterial({
      map: cloudTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this._cloudMat = cloudMat;
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(cloudMat);
      const scale = 130 + Math.random() * 170; // bigger — they now form a soft back wall
      s.scale.set(scale, scale, 1);
      // Moved OUT of the sky and BACK behind the scene (around the emitter's distance),
      // low and wide, so they cover the deep backdrop instead of floating overhead.
      s.userData.offset = new THREE.Vector3(
        (Math.random() - 0.5) * 900,   // wide spread across the back
        -50 + Math.random() * 150,     // low band (was 60..180 high up)
        520 + Math.random() * 420      // far back, behind the city (was 180..340)
      );
      this.clouds.push(s);
      this.group.add(s);
    }

    // The emitter (the spawn-frontier "mouth") is its own object — see src/emitter.js.
    // Background just owns an instance and feeds it the frontier each frame.
    this.emitter = new Emitter(scene);

    // Two skyline ranges (near + far) on each side for parallax depth.
    this.ranges = [];
    // Each wall is yawed (toed in) AND pitched about the WORLD X axis so its far (+z)
    // end sinks DOWN toward the floor in the distance while the behind end (off-camera)
    // rises — so the city descends to meet the ground far away instead of running flat.
    const WORLD_X = new THREE.Vector3(1, 0, 0);
    const CITY_TILT = 0.1; // ~10° downward pitch of the far end
    this._skylineStyle = "towers"; // current silhouette; setBiome swaps it per zone
    const make = (dist, height, hue, opacity, yaw) => {
      const tex = skylineTexture(this._skylineStyle);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        fog: false,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2600, height), mat); // long wall so the city stretches FAR into the distance, not just right in front
      plane.rotation.y = yaw;
      plane.rotateOnWorldAxis(WORLD_X, CITY_TILT); // far end pitches down to the floor
      plane.userData = { dist, tex, parallax: 1 / dist, baseOpacity: opacity, hue: hue / 360 };
      this.ranges.push(plane);
      this.group.add(plane);
      return plane;
    };
    // left/right, far (dim) then near (brighter)
    // Wider apart (more open / vast), and each side TOED IN toward +z (the distance)
    // so the walls converge into a vanishing-point funnel that "closes in" far away.
    const toe = 0.13; // ~7.5° inward lean of the far end
    make(540, 355, 230, 0.5, Math.PI / 2 - toe); // far, right
    make(540, 355, 230, 0.5, -Math.PI / 2 + toe); // far, left
    make(380, 295, 265, 0.7, Math.PI / 2 - toe); // near, right
    make(380, 295, 265, 0.7, -Math.PI / 2 + toe); // near, left
    this._sides = [1, -1, 1, -1];

    // --- "WAY up high, no ground" atmosphere (replaces the old floor grid's sense
    // of place). Three altitude cues, all fog:false so distance/fog doesn't eat them,
    // all fading with `dim` like the rest of the sky. ---

    // 1) A faint pool of distant city lights FAR below — the glowing "floor" of the
    //    abyss. Lies flat (rotated to horizontal) deep under the track. Big and slow:
    //    its near-stationary depth-parallax is what sells real altitude.
    this.farLights = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      new THREE.MeshBasicMaterial({
        map: farLightsTexture(),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.farLights.rotation.x = -Math.PI / 2; // lay it flat, facing up at us
    this.farLightsY = -260; // way down in the void
    this.farLights.renderOrder = -1; // drawn after the dark occluder so specks add on top
    this.group.add(this.farLights);

    // 1b) Dark occluder just below the lights: a near-black disc (NORMAL blend) that
    //     blocks the purple void from showing through the additive lights plane, so
    //     the floor reads as black with glowing specks rather than a purple slab.
    this.farDark = new THREE.Mesh(
      new THREE.PlaneGeometry(2900, 2900),
      new THREE.MeshBasicMaterial({
        map: darkPoolTexture(),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        fog: false,
      })
    );
    this.farDark.rotation.x = -Math.PI / 2;
    this.farDark.renderOrder = -2; // behind the lights
    this.group.add(this.farDark);

    // 2) Two horizontal mist decks between us and the lights — slow-drifting cloud
    //    layers far below. Lower deck moves slower (height parallax): the closer/
    //    higher deck slides faster, the deep one barely crawls, so depth reads.
    this.mistDecks = [];
    const mistTex = mistTexture();
    const addMist = (y, size, repeat, opacity, hue, speed) => {
      const tex = mistTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(repeat, repeat);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.rotation.x = -Math.PI / 2;
      m.userData = { y, baseOpacity: opacity, hue: hue / 360, speed };
      this.mistDecks.push(m);
      this.group.add(m);
    };
    addMist(-170, 2000, 5, 0.5, 255, 0.25); // deep, slow
    addMist(-90, 1500, 4, 0.42, 280, 0.5); // mid, faster

    // 3) Slow-rising motes — sparse glints drifting UP out of the abyss, reinforcing
    //    "we're high and there's a long way down." One cheap Points cloud.
    const N = 90;
    const pos = new Float32Array(N * 3);
    this._moteData = [];
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 700;
      const y = -260 + Math.random() * 300; // somewhere between lights and track
      const z = 120 + Math.random() * 360; // ahead of the player
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      this._moteData.push({
        x,
        z,
        ySpan: 300,
        baseY: -260,
        speed: 6 + Math.random() * 14,
        phase: Math.random() * 6.28,
      });
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this._motePos = moteGeo.getAttribute("position");
    this._moteMat = new THREE.PointsMaterial({
      color: 0xbfd0ff,
      size: 4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.motes = new THREE.Points(moteGeo, this._moteMat);
    this.group.add(this.motes);

    // Toned down for now: the rising motes and the bright ADDITIVE mist decks read as
    // too busy / distracting (additive blending glows on the dark scene = headache).
    // Hide them — kept, not deleted — so only the calm city-lights floor shows below
    // us. Re-enable later by flipping these visible flags back to true.
    // Mist decks stay hidden (too busy with the jump cam-tilt). Motes kept but very
    // faint (opacity set in update) — just a hint of rising specks.
    for (const m of this.mistDecks) m.visible = false;
    // The rising "ground" motes are off for now — the only flow we want is the stream
    // coming AT us from the emitter (kept, not deleted).
    this.motes.visible = false;
  }

  // Drive the backdrop mood from the active biome. The game calls this once on a
  // zone change with that biome's palette; update() then EASES toward these targets
  // (no snap). All tints are stored as THREE.Color targets / scalar hue targets.
  setBiome({ skylineHue, skylineSpread, skylineSat, moon, nebula, skyline, skylineStyle, skylineVar, accent, cloudLevel }) {
    // Side buildings: swap the silhouette per zone. Style "none" = NO buildings at all
    // (the Void) — hide the flanking walls. Otherwise regenerate the range planes when
    // the SHAPE *or* per-zone variation changes (so even two "towers" zones differ).
    const style = skylineStyle || this._skylineStyle || "towers";
    const hideSky = style === "none";
    const firstSet = this._skylineSig === ""; // the opening setBiome snaps; later crossings fade
    for (const p of this.ranges) p.visible = !hideSky;
    const sig = style + "|" + JSON.stringify(skylineVar || {});
    if (!hideSky && sig !== this._skylineSig) {
      for (const p of this.ranges) {
        const old = p.userData.tex;
        const tex = skylineTexture(style, skylineVar || {});
        p.material.map = tex;
        p.userData.tex = tex;
        p.material.needsUpdate = true;
        if (old) old.dispose();
      }
      if (!firstSet) { this._skyFade = 0; this._skyFading = true; } // fade the new buildings IN
    }
    this._skylineStyle = style;
    this._skylineSig = sig;
    this._cloudLevelTarget = cloudLevel != null ? cloudLevel : 1; // hide the nebula clouds (Void = empty sky)
    if (skylineHue != null) this._hueTarget = skylineHue;
    if (skylineSpread != null) this._spreadTarget = skylineSpread;
    if (skylineSat != null) this._satTarget = skylineSat;
    if (moon != null) {
      this._moonTarget.setHex(moon);
      // Halo = a softer, slightly warmer echo of the moon tint.
      this._haloTarget.copy(this._moonTarget).multiplyScalar(0.92).offsetHSL(0.0, 0.05, -0.04);
    }
    if (nebula != null) this._nebTarget.setHex(nebula);
    // City-light floor takes the zone's accent (pulled toward mid-brightness so it
    // glows the zone colour without blowing out). Falls back to the window colour.
    if (accent != null || skyline != null) this._cityTarget.setHex(accent ?? skyline);
    this.emitter.setTint(skyline); // the mouth glows the zone's neon window-accent
  }

  update(playerZ, dt = 0, playing = false, playerX = 0, playerY = 0, emit = null) {
    this._t += dt;
    if (playing) this._driftT += dt; // city only moves while you're actually rolling
    const t = this._t;
    const dT = this._driftT;

    // Ease the biome mood toward its targets (~2s settle). Frame-rate independent.
    const k = dt > 0 ? 1 - Math.exp(-dt / 0.9) : 0;
    // Hue is on a wheel — ease along the SHORTEST way around so blue→amber etc.
    // takes the near path instead of spinning all the way round.
    let dHue = this._hueTarget - this._hue;
    if (dHue > 0.5) dHue -= 1; else if (dHue < -0.5) dHue += 1;
    this._hue = (this._hue + dHue * k + 1) % 1;
    this._spread += (this._spreadTarget - this._spread) * k;
    this._sat += (this._satTarget - this._sat) * k;
    this._moonTint.lerp(this._moonTarget, k);
    this._haloTint.lerp(this._haloTarget, k);
    this._nebTint.lerp(this._nebTarget, k);
    this._cityTint.lerp(this._cityTarget, k);
    this._cloudLevel += (this._cloudLevelTarget - this._cloudLevel) * k;
    if (this._skyFading) { this._skyFade = Math.min(1, this._skyFade + dt / 0.55); if (this._skyFade >= 1) this._skyFading = false; }

    // Blackout powerdown fades the whole sky down too (not just the platforms), so
    // it's a real blackout instead of dark ground under a bright skyline.
    const f = 1 - this.dim * 0.85;
    this.moon.material.opacity = f;
    this._halo.material.opacity = 0.18 * f;
    this._cloudMat.opacity = f * this._cloudLevel; // clouds fade out entirely in the Void

    this.moon.position.set(playerX + this.moonOffset.x, playerY + this.moonOffset.y, playerZ + this.moonOffset.z);
    this.moon.rotation.y += 0.0006;
    // Moon body + halo carry the biome's moon tint (eased above).
    this.moon.material.color.copy(this._moonTint);
    this._halo.material.color.copy(this._haloTint);

    // Nebula drifts and gently breathes around the biome's nebula tint, instead of
    // free-cycling through the whole hue wheel — so it stays in the zone's family.
    this._cloudMat.color.copy(this._nebTint).offsetHSL(Math.sin(t * 0.05) * 0.03, 0, 0);
    for (const c of this.clouds) {
      c.position.set(c.userData.offset.x, c.userData.offset.y, playerZ + c.userData.offset.z);
    }

    // Emitter: sit at the live spawn frontier (the generator's cursor) so the mouth IS
    // where the next piece comes from, and pieces stream from it toward the player. It
    // only moves when the frontier moves (it holds mid-spline). See src/emitter.js.
    // Only RIDE the live frontier while playing; on the title/game-over screen the
    // generator is idle (cursor still parked at the start gate), so hold the emitter out
    // at its normal far depth instead of letting it sit in the player's face.
    const live = playing && emit;
    this.emitter.update(dt, t, {
      x: live ? emit.cursorX : playerX,
      y: live ? emit.cursorY : playerY,
      z: live ? emit.cursorZ : playerZ + 800,
      playerZ,
      mouth: emit ? 0.8 + emit.sprawl * 0.3 + emit.drama * 0.15 : 1,
      beat: this.beat || 0,
      dim: this.dim,
      reduced: this.reducedMotion, // fewer streaming particles when reduced-motion is on
    });

    // Distant city-lights floor far below: huge, lazily rotating. TRACKS the player in
    // z (the old 0.6 lag made it fall behind and vanish after ~3000m). Kept dim so it's
    // a faint pool of lights in the black, not a bright purple slab.
    this.farLights.position.set(0, this.farLightsY, playerZ);
    this.farLights.rotation.z = t * 0.004;
    this.farLights.material.opacity = 0.32 * f; // the glowing city-lights floor (kept in every zone)
    this.farLights.material.color.copy(this._cityTint); // the city below glows the zone's colour
    // Dark occluder rides just below the lights so the void doesn't show through.
    this.farDark.position.set(0, this.farLightsY - 1, playerZ);
    this.farDark.material.opacity = 0.9 * f;

    // Mist decks slow-drift (texture pans) and breathe. Each deck pans at its own
    // speed for height parallax; positioned under the track and fading with dim.
    this.mistDecks.forEach((m, i) => {
      m.position.set(0, m.userData.y, playerZ + 120);
      const tex = m.material.map;
      tex.offset.x = (dT * 0.01 + t * 0.003) * m.userData.speed;
      tex.offset.y = t * 0.001 * m.userData.speed;
      m.material.color.setHSL((m.userData.hue + t * 0.01 + i * 0.2) % 1, 0.5, 0.6);
      m.material.opacity = m.userData.baseOpacity * (0.7 + 0.3 * Math.sin(t * 0.18 + i)) * f;
    });

    // Motes rise slowly out of the void and wrap back to the bottom; they ride the
    // player's z so they stay ahead of the camera. Sway gently as they climb.
    const arr = this._motePos.array;
    for (let i = 0; i < this._moteData.length; i++) {
      const d = this._moteData[i];
      const rise = d.baseY + ((t * d.speed) % d.ySpan);
      arr[i * 3] = d.x + Math.sin(t * 0.3 + d.phase) * 18;
      arr[i * 3 + 1] = rise;
      arr[i * 3 + 2] = playerZ + d.z;
    }
    this._motePos.needsUpdate = true;
    this._moteMat.opacity = 0.2 * f; // faint — just a hint of rising specks

    this.ranges.forEach((p, i) => {
      const d = p.userData.dist;
      p.position.set(this._sides[i] * d, -52, playerZ + 60); // dropped low + tall, so tower bases root deep toward the floor (no distant float); tops stay roughly where they were
      // Parallax with the player PLUS a slow constant drift, so the buildings
      // keep passing by (and new ones scroll in) even while you stand still.
      // The right-hand planes face the opposite way, so flip their scroll sign
      // to keep the two sides consistent; the leading sign sets the direction.
      const flip = this._sides[i] === 1 ? -1 : 1;
      p.userData.tex.offset.x = flip * (playerZ * p.userData.parallax * 0.28 + dT * 0.004);
      // Window glow stays in the BIOME's hue family: it gently breathes around the
      // eased biome hue centre (±spread), each layer slightly out of phase for depth,
      // instead of rainbowing through every colour. So the backdrop reads as the
      // active zone's colour, still alive and shifting but never fighting it.
      const hue = (this._hue + Math.sin(t * 0.13 + i * 1.7) * this._spread + 1) % 1;
      const beat = this.beat || 0; // audiosurf: windows flash brighter on each beat
      // Saturation is per-zone (eased): high = a HARD single colour (Cobalt reads cobalt),
      // low = pale/achromatic. Neon City keeps a wide hue spread for its lively shimmer.
      p.material.color.setHSL(hue, this._sat, Math.min(0.95, 0.6 + beat * 0.32));
      p.material.opacity = p.userData.baseOpacity * (0.78 + 0.22 * Math.sin(t * 0.22 + i)) * (1 + beat * 0.6) * f * this._skyFade;
    });
  }
}
