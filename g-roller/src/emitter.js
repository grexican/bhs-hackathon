import * as THREE from "three";

// The EMITTER: the visual manifestation of the generator's spawn frontier — the point
// the next board piece comes from. It simply SITS at that frontier (the cursor the path
// generator already tracks) and eases to follow it, so as the path winds left/right/up/
// down the glowing "mouth" leads the eye to where new pieces appear. When the path isn't
// making a lateral move (e.g. mid-spline) the frontier doesn't move, so neither does it.
//
// Deliberately simple: a soft glow + a hot core + a single mouth-rim, plus glints that
// stream out of the mouth toward the player (the "emitting" read). No orbit rings, no
// autonomous wander — it's the path, nothing more. Lives in its own file so the look can
// be tuned in isolation.
//
// Build a soft round glow (white, fading out) — tinted per use.
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.6, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Emitter {
  constructor(scene) {
    this._tint = new THREE.Color(0xff4bd6);
    this._tintTarget = new THREE.Color(0xff4bd6);
    this._scratch = new THREE.Color();
    this._mouth = 1;

    // The portal mouth (positioned + scaled to follow the frontier).
    this.portal = new THREE.Group();
    scene.add(this.portal);
    const tex = glowTexture();
    this._glowMat = new THREE.SpriteMaterial({ map: tex, color: 0xff4bd6, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this._glow = new THREE.Sprite(this._glowMat); this._glow.scale.set(150, 150, 1);
    this._coreMat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this._core = new THREE.Sprite(this._coreMat); this._core.scale.set(46, 46, 1);
    this._rimMat = new THREE.MeshBasicMaterial({ color: 0xff4bd6, transparent: true, opacity: 0.85, fog: false, blending: THREE.AdditiveBlending });
    this._rim = new THREE.Mesh(new THREE.TorusGeometry(34, 2.4, 16, 64), this._rimMat); // faces the player (XY plane)
    this.portal.add(this._glow, this._core, this._rim);

    // Glints that stream out of the mouth toward the player — the "pieces emitting" read.
    // Kept in WORLD space (not children of the scaled portal) so their flight isn't warped.
    this._shards = [];
    const shardGeo = new THREE.PlaneGeometry(2.6, 2.6);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({
        color: 0x9fe0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      }));
      m.userData = { t: Math.random(), speed: 0.3 + Math.random() * 0.3, ang: Math.random() * 6.283, rad: Math.random(),
        rvx: (Math.random() - 0.5) * 4, rvy: (Math.random() - 0.5) * 4, rvz: (Math.random() - 0.5) * 4 };
      this._shards.push(m);
      scene.add(m);
    }
  }

  // Biome accent — the mouth glows the zone's neon colour.
  setTint(hex) { if (hex != null) this._tintTarget.setHex(hex); }

  // ctx: { x, y, z } = the spawn frontier to sit at; playerZ; mouth (size scale);
  //      beat (audiosurf 0..1); dim (blackout 0..1).
  update(dt, t, ctx) {
    const f = 1 - (ctx.dim || 0) * 0.85;
    const ke = dt > 0 ? 1 - Math.exp(-dt / 0.5) : 0;
    this._tint.lerp(this._tintTarget, dt > 0 ? 1 - Math.exp(-dt / 0.9) : 0);

    // Sit at the frontier (ease to follow). It moves only when the path's next spawn
    // point moves — exactly the generator's cursor, nothing invented.
    this.portal.position.x += (ctx.x - this.portal.position.x) * ke;
    this.portal.position.y += (ctx.y - this.portal.position.y) * ke;
    this.portal.position.z += (ctx.z - this.portal.position.z) * ke;
    this._mouth += ((ctx.mouth ?? 1) - this._mouth) * ke;

    const beat = ctx.beat || 0;
    const breathe = 1 + Math.sin(t * 2.2) * 0.04;
    this.portal.scale.setScalar(this._mouth * breathe * (1 + beat * 0.2));
    this._rimMat.color.copy(this._tint);
    this._rimMat.opacity = 0.85 * f * (1 + beat * 0.3);
    this._coreMat.color.copy(this._tint).offsetHSL(0, -0.35, 0.4); // hot near-white center
    this._coreMat.opacity = (0.85 + beat * 0.1) * f;
    this._glowMat.color.copy(this._tint);
    this._glowMat.opacity = (0.55 + beat * 0.2) * f;

    // Shards: born at the mouth, fly toward the player (the whole spawn-to-you distance),
    // tumbling + fanning out + fading. Recycled when their life wraps.
    const ep = this.portal.position;
    const travel = Math.max(60, ep.z - ctx.playerZ + 30); // from the frontier down to just past the player
    const mouthR = 34 * this._mouth;
    this._scratch.copy(this._tint).offsetHSL(0, -0.15, 0.2);
    // Reduced-motion: stream FEWER particles out of the mouth (calmer). Hide the rest.
    const shown = ctx.reduced ? 3 : this._shards.length;
    for (let si = 0; si < this._shards.length; si++) {
      const m = this._shards[si];
      if (si >= shown) { m.visible = false; continue; }
      m.visible = true;
      const d = m.userData;
      d.t += dt * d.speed;
      if (d.t >= 1) { d.t -= 1; d.ang = Math.random() * 6.283; d.rad = Math.random(); }
      const fan = 1 + d.t * 2.2;
      const r = mouthR * (0.15 + d.rad * 0.85) * fan;
      m.position.set(ep.x + Math.cos(d.ang) * r, ep.y + Math.sin(d.ang) * r, ep.z - d.t * travel);
      m.rotation.x += dt * d.rvx; m.rotation.y += dt * d.rvy; m.rotation.z += dt * d.rvz;
      m.scale.setScalar((0.7 + d.t * 1.6) * this._mouth);
      m.material.color.copy(this._scratch);
      m.material.opacity = Math.sin(d.t * Math.PI) * 0.85 * f; // fade in then out across the flight
    }
  }
}
