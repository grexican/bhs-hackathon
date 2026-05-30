import * as THREE from "three";

// A tiny pooled particle system drawn as additive glowing dots. Used for the
// ball's speed trail, landing dust puffs, and gem-collect sparkles. One Points
// object, fixed buffer, recycled in a ring — cheap and never allocates mid-game.
const MAX = 600;

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Array(MAX).fill(0).map(() => new THREE.Vector3());
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.base = new Array(MAX).fill(0).map(() => new THREE.Color());
    this._head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.9,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(position, color, count, spread, speed, life) {
    for (let i = 0; i < count; i++) {
      const idx = this._head;
      this._head = (this._head + 1) % MAX;

      this.pos[idx * 3] = position.x;
      this.pos[idx * 3 + 1] = position.y;
      this.pos[idx * 3 + 2] = position.z;

      this.vel[idx].set(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.6,
        (Math.random() - 0.5) * spread
      ).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));

      this.base[idx].set(color);
      this.life[idx] = this.maxLife[idx] = life * (0.7 + Math.random() * 0.6);
    }
  }

  // A short, soft streak behind the rolling ball.
  trail(position, color) {
    this.emit(position, color, 2, 0.5, 1.2, 0.45);
  }

  burst(position, color, count = 18) {
    this.emit(position, color, count, 1.2, 7, 0.6);
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        if (this.col[i * 3] !== 0) { this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; }
        continue;
      }
      this.life[i] -= dt;
      const v = this.vel[i];
      v.y -= 9 * dt * 0.5; // gentle gravity on particles
      this.pos[i * 3] += v.x * dt;
      this.pos[i * 3 + 1] += v.y * dt;
      this.pos[i * 3 + 2] += v.z * dt;

      // Fade out by scaling the (additive) color toward black.
      const a = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[i * 3] = this.base[i].r * a;
      this.col[i * 3 + 1] = this.base[i].g * a;
      this.col[i * 3 + 2] = this.base[i].b * a;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
