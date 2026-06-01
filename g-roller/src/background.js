import * as THREE from "three";

// The far scenery behind the action: a glowing moon, drifting nebula clouds,
// and two parallax skyline ranges on either side. Everything ignores fog and
// follows the player down the track so it never scrolls out of view.

function skylineTexture(hue) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 256);
  ctx.fillStyle = `hsl(${hue}, 45%, 16%)`;
  // A jagged silhouette of towers/peaks along the bottom.
  let x = 0;
  while (x < 512) {
    const w = 18 + Math.random() * 46;
    const h = 40 + Math.random() * 170;
    ctx.fillRect(x, 256 - h, w, h);
    // a few lit windows for the city feel
    if (Math.random() < 0.6) {
      ctx.fillStyle = `hsla(${hue + 30}, 80%, 65%, 0.5)`;
      for (let i = 0; i < 6; i++) {
        if (Math.random() < 0.4) ctx.fillRect(x + 4 + (i % 3) * (w / 3), 256 - h + 8 + Math.floor(i / 3) * 14, 5, 7);
      }
      ctx.fillStyle = `hsl(${hue}, 45%, 16%)`;
    }
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
      map: cloudTexture(), transparent: true, depthWrite: false,
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
    make(360, 150, 230, 0.5).rotation.y = Math.PI / 2;   // far, right
    make(360, 150, 230, 0.5).rotation.y = -Math.PI / 2;  // far, left
    make(220, 110, 265, 0.7).rotation.y = Math.PI / 2;   // near, right
    make(220, 110, 265, 0.7).rotation.y = -Math.PI / 2;  // near, left
    this._sides = [1, -1, 1, -1];
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
    this._cloudMat.color.setHSL((t * 0.01) % 1, 0.6, 0.6);
    for (const c of this.clouds) {
      c.position.set(c.userData.offset.x, c.userData.offset.y, playerZ + c.userData.offset.z);
    }

    this.ranges.forEach((p, i) => {
      const d = p.userData.dist;
      p.position.set(this._sides[i] * d, 30, playerZ + 60);
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
