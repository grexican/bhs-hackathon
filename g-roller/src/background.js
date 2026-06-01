import * as THREE from "three";

// The far scenery behind the action: a glowing moon, drifting nebula clouds,
// and two parallax skyline ranges on either side. Everything ignores fog and
// follows the player down the track so it never scrolls out of view.

function skylineTexture(hue) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 256);
  // Near-black tower bodies (NOT hue-tinted) so the cycling material colour barely
  // touches them — only the bright WHITE windows take the tint and glow the cycle
  // colour. That keeps the colour ON the skyline (lit windows) instead of washing
  // the whole scene a flat purple.
  const body = "#0b0b13";
  ctx.fillStyle = body;
  // A jagged silhouette of towers/peaks along the bottom.
  let x = 0;
  while (x < 512) {
    const w = 18 + Math.random() * 46;
    const h = 40 + Math.random() * 170;
    ctx.fillRect(x, 256 - h, w, h);
    // Bright white windows — these are what the cycling colour lights up.
    ctx.fillStyle = "rgba(255,252,255,0.92)";
    for (let i = 0; i < 8; i++) {
      if (Math.random() < 0.5) ctx.fillRect(x + 4 + (i % 3) * (w / 3), 256 - h + 8 + Math.floor(i / 3) * 14, 5, 7);
    }
    ctx.fillStyle = body;
    x += w + 4;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
}

function cloudTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(150,120,255,0.5)");
  g.addColorStop(1, "rgba(150,120,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// A wide, wispy fog band: soft horizontal streaks of soft light fading to nothing
// at the edges. Tiled across a huge plane far below to read as a cloud deck.
function mistTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 512);
  // scatter many soft blobs, biased into horizontal smears for a layered-cloud feel
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const rx = 50 + Math.random() * 120;
    const ry = 12 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    const a = 0.04 + Math.random() * 0.10;
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
  ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
  // tiny lit specks, denser toward the centre, like a distant illuminated city
  for (let i = 0; i < 460; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.6) * 240; // bias inward
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
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class Background {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Glowing moon.
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(26, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false })
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(34, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.18, fog: false })
    );
    this.moon.add(halo);
    this.moon.material.transparent = true; // so the blackout powerdown can fade it
    this._halo = halo;
    this.moonOffset = new THREE.Vector3(70, 70, 240);
    this.group.add(this.moon);

    this.dim = 0; // 0 = normal sky, 1 = blacked out (driven by the blackout powerdown)

    this._t = 0;       // colour-cycle time (always advances)
    this._driftT = 0;  // building-scroll time (only advances while playing)

    // Drifting nebula sprites.
    this.clouds = [];
    const cloudMat = new THREE.SpriteMaterial({
      map: cloudTexture(), transparent: true, depthWrite: false, opacity: 0.35,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this._cloudMat = cloudMat;
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(cloudMat);
      const scale = 60 + Math.random() * 90;
      s.scale.set(scale, scale, 1);
      s.userData.offset = new THREE.Vector3(
        (Math.random() - 0.5) * 360, 60 + Math.random() * 120, 180 + Math.random() * 160
      );
      this.clouds.push(s);
      this.group.add(s);
    }

    // Two skyline ranges (near + far) on each side for parallax depth.
    this.ranges = [];
    const make = (dist, height, hue, opacity) => {
      const tex = skylineTexture(hue);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity, fog: false, side: THREE.DoubleSide, depthWrite: false,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1200, height), mat);
      plane.userData = { dist, tex, parallax: 1 / dist, baseOpacity: opacity, hue: hue / 360 };
      this.ranges.push(plane);
      this.group.add(plane);
      return plane;
    };
    // left/right, far (dim) then near (brighter)
    // Wider apart (more open / vast), and each side TOED IN toward +z (the distance)
    // so the walls converge into a vanishing-point funnel that "closes in" far away.
    const toe = 0.13; // ~7.5° inward lean of the far end
    make(540, 355, 230, 0.5).rotation.y = Math.PI / 2 - toe;   // far, right
    make(540, 355, 230, 0.5).rotation.y = -Math.PI / 2 + toe;  // far, left
    make(380, 295, 265, 0.7).rotation.y = Math.PI / 2 - toe;   // near, right
    make(380, 295, 265, 0.7).rotation.y = -Math.PI / 2 + toe;  // near, left
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
        map: farLightsTexture(), transparent: true, opacity: 0.6,
        depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
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
      new THREE.MeshBasicMaterial({ map: darkPoolTexture(), transparent: true, opacity: 0.9, depthWrite: false, fog: false })
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
        map: tex, transparent: true, opacity, depthWrite: false,
        fog: false, blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.rotation.x = -Math.PI / 2;
      m.userData = { y, baseOpacity: opacity, hue: hue / 360, speed };
      this.mistDecks.push(m);
      this.group.add(m);
    };
    addMist(-170, 2000, 5, 0.5, 255, 0.25); // deep, slow
    addMist(-90, 1500, 4, 0.42, 280, 0.5);  // mid, faster

    // 3) Slow-rising motes — sparse glints drifting UP out of the abyss, reinforcing
    //    "we're high and there's a long way down." One cheap Points cloud.
    const N = 90;
    const pos = new Float32Array(N * 3);
    this._moteData = [];
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 700;
      const y = -260 + Math.random() * 300; // somewhere between lights and track
      const z = 120 + Math.random() * 360;  // ahead of the player
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      this._moteData.push({ x, z, ySpan: 300, baseY: -260, speed: 6 + Math.random() * 14, phase: Math.random() * 6.28 });
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this._motePos = moteGeo.getAttribute("position");
    this._moteMat = new THREE.PointsMaterial({
      color: 0xbfd0ff, size: 4, sizeAttenuation: true,
      transparent: true, opacity: 0.55, depthWrite: false,
      fog: false, blending: THREE.AdditiveBlending,
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
  }

  update(playerZ, dt = 0, playing = false) {
    this._t += dt;
    if (playing) this._driftT += dt; // city only moves while you're actually rolling
    const t = this._t;
    const dT = this._driftT;

    // Blackout powerdown fades the whole sky down too (not just the platforms), so
    // it's a real blackout instead of dark ground under a bright skyline.
    const f = 1 - this.dim * 0.85;
    this.moon.material.opacity = f;
    this._halo.material.opacity = 0.18 * f;
    this._cloudMat.opacity = f;

    this.moon.position.set(this.moonOffset.x, this.moonOffset.y, playerZ + this.moonOffset.z);
    this.moon.rotation.y += 0.0006;

    // Nebula drifts and slowly cycles colour with the skyline.
    this._cloudMat.color.setHSL((t * 0.01) % 1, 0.5, 0.42); // dimmer so the sky glow doesn't wash everything
    for (const c of this.clouds) {
      c.position.set(c.userData.offset.x, c.userData.offset.y, playerZ + c.userData.offset.z);
    }

    // Distant city-lights floor far below: huge, lazily rotating. TRACKS the player in
    // z (the old 0.6 lag made it fall behind and vanish after ~3000m). Kept dim so it's
    // a faint pool of lights in the black, not a bright purple slab.
    this.farLights.position.set(0, this.farLightsY, playerZ);
    this.farLights.rotation.z = t * 0.004;
    this.farLights.material.opacity = 0.32 * f;
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
      const rise = (d.baseY + ((t * d.speed) % d.ySpan));
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
      // Super-slow chill rainbow: each layer eases through the hue wheel, gently
      // fading in and out, slightly out of phase for depth.
      const hue = (p.userData.hue + t * 0.013 + i * 0.13) % 1;
      p.material.color.setHSL(hue, 0.55, 0.6);
      p.material.opacity = p.userData.baseOpacity * (0.78 + 0.22 * Math.sin(t * 0.22 + i)) * f;
    });
  }
}
