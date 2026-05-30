import * as THREE from "three";
import { CONFIG } from "./config.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { PlatformField } from "./platforms.js";
import { Particles } from "./effects.js";
import { Background } from "./background.js";

// The conductor. Builds the 3D world, runs the game loop, owns the Start ->
// Playing -> Dead state machine, scoring, powerups, the chase camera, and the
// juice. This is the web stand-in for Unity's GameManager.
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = "start";
    this.baseSpeed = CONFIG.forwardSpeed;
    this._speedTimer = 0;
    this._boostTimer = 0;
    this._prevJumpHeld = false;
    this.gems = 0;
    this._shake = 0;
    this._effects = { shield: false, magnet: 0, slow: 0, reverse: 0, surge: 0, doublejump: 0, flight: 0, morph: 0 };
    this._invuln = 0;

    this._buildRenderer();
    this._buildScene();

    this.background = new Background(this.scene);
    this.input = new Input(canvas);
    this.player = new Player(this.scene);
    this.field = new PlatformField(this.scene);
    this.particles = new Particles(this.scene);

    this._hud = {
      distance: document.getElementById("distance"),
      jumps: document.getElementById("jumps"),
      gems: document.getElementById("gems"),
      bestDistance: document.getElementById("best-distance"),
      bestJumps: document.getElementById("best-jumps"),
      overlay: document.getElementById("overlay"),
      subtitle: document.getElementById("overlay-subtitle"),
      hint: document.getElementById("overlay-hint"),
      toast: document.getElementById("toast"),
      effects: document.getElementById("effects"),
    };

    this.bestDistance = Number(localStorage.getItem("gr_bestDistance") || 0);
    this.bestJumps = Number(localStorage.getItem("gr_bestJumps") || 0);

    this._resetWorld();
    this._refreshHud();

    window.addEventListener("resize", () => this._onResize());
    this._clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x141a33, 80, 230);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this._baseFov = 62;

    this.scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x202840, 0.85));
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    this.sun.position.set(-30, 60, -20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = this.sun.shadow.camera;
    s.left = -60; s.right = 60; s.top = 60; s.bottom = -60; s.near = 1; s.far = 220;
    this.scene.add(this.sun, this.sun.target);

    // Faint depth grid under the void.
    this.grid = new THREE.GridHelper(400, 80, 0x3550aa, 0x223066);
    this.grid.position.y = -55;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.scene.add(this.grid);
  }

  _resetWorld() {
    this.baseSpeed = CONFIG.forwardSpeed;
    this._speedTimer = 0;
    this._boostTimer = 0;
    this.gems = 0;
    this._invuln = 0;
    this._effects = { shield: false, magnet: 0, slow: 0, reverse: 0, surge: 0, doublejump: 0, flight: 0, morph: 0 };
    this._clearSplats();
    this.field.reset();
    this.player.reset();
    this._followCamera(true);
  }

  _effectiveSpeed() {
    let s = this.baseSpeed;
    if (this._boostTimer > 0) s += CONFIG.boostAmount;
    if (this._effects.surge > 0) s += CONFIG.surgeAmount;
    if (this._effects.slow > 0) s *= CONFIG.slowFactor;
    return s;
  }

  _jumpPressed() {
    const pressed = this.input.jumpHeld && !this._prevJumpHeld;
    this._prevJumpHeld = this.input.jumpHeld;
    return pressed;
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this._clock.getDelta(), 1 / 30);

    if (this.state === "playing") {
      this._prevJumpHeld = this.input.jumpHeld;
      this._tickPlaying(dt);
    } else if (this._jumpPressed()) {
      this._startGame();
    }

    this.particles.update(dt);
    this.background.update(this.player.position.z);
    this._followCamera(false);
    this._tickCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _startGame() {
    if (this.state === "dead") this._resetWorld();
    this.player.jumpCount = 0;
    this.gems = 0;
    this.state = "playing";
    this._hud.overlay.classList.add("is-hidden");
    this._refreshHud();
  }

  _tickPlaying(dt) {
    // Difficulty ramp (capped so it stays playable).
    this._speedTimer += dt;
    if (this._speedTimer >= CONFIG.speedRampEvery) {
      this._speedTimer = 0;
      this.baseSpeed = Math.min(CONFIG.maxForwardSpeed, this.baseSpeed + CONFIG.speedRampAmount);
    }
    if (this._boostTimer > 0) this._boostTimer -= dt;
    if (this._invuln > 0) this._invuln -= dt;
    for (const k of ["magnet", "slow", "reverse", "surge", "doublejump", "flight", "morph"])
      if (this._effects[k] > 0) this._effects[k] -= dt;

    const speed = this._effectiveSpeed();
    this.field.update(dt, this.player.position.z, speed);
    if (this._effects.magnet > 0) this.field.attract(this.player.position, dt);

    const ctx = {
      forwardSpeed: speed,
      steerMult: this._effects.reverse > 0 ? -1 : 1,
      invuln: this._invuln > 0,
      shield: this._effects.shield,
      maxAirJumps: this._effects.doublejump > 0 ? 1 : 0,
      flight: this._effects.flight > 0,
      morph: this._effects.morph > 0,
    };
    const ev = this.player.update(dt, this.input, ctx, this.field);

    this._onLanded(ev);
    if (ev.hit) this._onHit(ev.hit);

    // Ball speed-trail.
    const tp = this.player.position.clone(); tp.y -= this.player.radius * 0.6;
    this.particles.trail(tp, this._boostTimer > 0 || this._effects.surge > 0 ? 0x2bd6ff : 0xffc24e);

    // Depth grid follows underneath.
    this.grid.position.z = Math.round(this.player.position.z / 5) * 5;
    this.grid.position.x = Math.round(this.player.position.x / 5) * 5;

    for (const pos of this.field.harvestGems(this.player.position, this.player.radius)) {
      this.gems += 1;
      this.particles.burst(pos, 0x66f0ff, 16);
    }
    for (const u of this.field.harvestPowerups(this.player.position, this.player.radius)) {
      this._applyPowerup(u);
    }

    this._refreshHud();
    this._renderEffects();
    if (ev.died) this._die();
  }

  _onLanded(ev) {
    if (!ev.landed) return;
    const p = ev.pos.clone(); p.y -= this.player.radius;
    if (ev.landed === "bouncy") {
      this.particles.burst(p, 0xff3f7a, 22); this._shake = 0.35; this._toast("BOING!", "#ff3f7a");
    } else if (ev.landed === "boost") {
      this._boostTimer = CONFIG.boostDuration; this.particles.burst(p, 0x2bd6ff, 20); this._shake = 0.25; this._toast("BOOST!", "#2bd6ff");
    } else {
      this.particles.burst(p, 0xbfc6d8, 7);
    }
  }

  _onHit(hit) {
    if (this._effects.shield) {
      // Shield absorbs the hit, smashes the obstacle, and grants a mercy window.
      this._effects.shield = false;
      this._invuln = CONFIG.invulnTime;
      this.field.removeObstacle(hit.platform, hit.obstacle);
      this.particles.burst(this.player.position, 0x35e0ff, 26);
      this._shake = 0.4;
      this._toast("BLOCKED!", "#35e0ff");
    } else {
      this.particles.burst(this.player.position, 0xff3b3b, 30);
      this._die();
    }
  }

  _applyPowerup(u) {
    const map = {
      shield: ["🛡️ SHIELD", "#35e0ff"], magnet: ["🧲 MAGNET", "#b06bff"], slow: ["🐢 SLOW-MO", "#4dff8a"],
      doublejump: ["⏫ DOUBLE JUMP", "#7cff5a"], flight: ["🕊️ FLIGHT — hold jump!", "#ffe14d"],
      reverse: ["🔄 REVERSED!", "#ff9f1c"], surge: ["⚡ SURGE!", "#ff3b3b"],
      morph: ["🌀 MORPH!", "#c04bff"], splat: ["💦 SPLAT!", "#8a5a2b"],
    };
    if (u.type === "shield") this._effects.shield = true;
    else if (u.type === "magnet") this._effects.magnet = CONFIG.magnetDuration;
    else if (u.type === "slow") this._effects.slow = CONFIG.slowDuration;
    else if (u.type === "doublejump") this._effects.doublejump = CONFIG.doubleJumpDuration;
    else if (u.type === "flight") this._effects.flight = CONFIG.flightDuration;
    else if (u.type === "reverse") this._effects.reverse = CONFIG.reverseDuration;
    else if (u.type === "surge") this._effects.surge = CONFIG.surgeDuration;
    else if (u.type === "morph") this._effects.morph = CONFIG.morphDuration;
    else if (u.type === "splat") this._splat();

    this.particles.burst(u.pos, u.good ? 0x66f0ff : 0xff7a1c, 20);
    this._toast(map[u.type][0], map[u.type][1]);
    if (!u.good) this._shake = 0.3;
  }

  // Powerdown: fling several organic gunk blobs onto the screen (DOM overlay)
  // that block the player's view, then drip and fade away.
  _splat() {
    const layer = document.getElementById("splats");
    const colors = ["#5a3a1c", "#3a2a14", "#6b4a22", "#2c3a18"];
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const b = document.createElement("div");
      b.className = "splat";
      const size = 120 + Math.random() * 220;
      b.style.width = b.style.height = `${size}px`;
      b.style.left = `${Math.random() * 100}%`;
      b.style.top = `${Math.random() * 100}%`;
      b.style.background = `radial-gradient(circle at 40% 35%, ${colors[i % colors.length]} 0%, ${colors[i % colors.length]} 55%, transparent 72%)`;
      b.style.setProperty("--rot", `${Math.random() * 360}deg`);
      layer.appendChild(b);
      setTimeout(() => b.remove(), 4200);
    }
  }

  _clearSplats() {
    const layer = document.getElementById("splats");
    if (layer) layer.innerHTML = "";
  }

  _die() {
    if (this.state === "dead") return;
    this.state = "dead";
    this._shake = 0.6;
    this.particles.burst(this.player.position, 0xffd34e, 40);

    const dist = Math.max(0, Math.floor(this.player.position.z));
    const jumps = Math.max(0, this.player.jumpCount);
    if (dist > this.bestDistance) { this.bestDistance = dist; localStorage.setItem("gr_bestDistance", String(dist)); }
    if (jumps > this.bestJumps) { this.bestJumps = jumps; localStorage.setItem("gr_bestJumps", String(jumps)); }

    this._hud.subtitle.innerHTML = `You rolled <b>${dist} m</b> · ${jumps} jumps · ${this.gems} 💎`;
    this._hud.hint.textContent = "Press SPACE to roll again";
    this._hud.overlay.classList.remove("is-hidden");
    this._refreshHud();
  }

  _toast(text, color = "#2bd6ff") {
    const t = this._hud.toast;
    t.textContent = text;
    t.style.color = color;
    t.style.textShadow = `0 0 24px ${color}aa`;
    t.classList.remove("toast--show");
    void t.offsetWidth;
    t.classList.add("toast--show");
  }

  _renderEffects() {
    const e = this._effects;
    const chips = [];
    if (e.shield) chips.push(["🛡️", "", "#35e0ff"]);
    if (e.magnet > 0) chips.push(["🧲", Math.ceil(e.magnet), "#b06bff"]);
    if (e.slow > 0) chips.push(["🐢", Math.ceil(e.slow), "#4dff8a"]);
    if (e.doublejump > 0) chips.push(["⏫", Math.ceil(e.doublejump), "#7cff5a"]);
    if (e.flight > 0) chips.push(["🕊️", Math.ceil(e.flight), "#ffe14d"]);
    if (e.reverse > 0) chips.push(["🔄", Math.ceil(e.reverse), "#ff9f1c"]);
    if (e.surge > 0) chips.push(["⚡", Math.ceil(e.surge), "#ff3b3b"]);
    if (e.morph > 0) chips.push(["🌀", Math.ceil(e.morph), "#c04bff"]);
    this._hud.effects.innerHTML = chips
      .map(([icon, t, c]) => `<span class="chip" style="border-color:${c};color:${c}">${icon}${t ? ` ${t}s` : ""}</span>`)
      .join("");
  }

  _refreshHud() {
    this._hud.distance.textContent = Math.max(0, Math.floor(this.player.position.z));
    this._hud.jumps.textContent = Math.max(0, this.player.jumpCount);
    this._hud.gems.textContent = this.gems;
    this._hud.bestDistance.textContent = this.bestDistance;
    this._hud.bestJumps.textContent = this.bestJumps;
  }

  _followCamera(snap) {
    const p = this.player.position;
    const k = snap ? 1 : 0.12;
    this.camera.position.x += (p.x - this.camera.position.x) * k;
    this.camera.position.y += (p.y + 9 - this.camera.position.y) * k;
    this.camera.position.z = p.z - 16;

    if (this._shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this._shake;
      this.camera.position.y += (Math.random() - 0.5) * this._shake;
    }
    this.camera.lookAt(p.x, p.y + 1.5, p.z + 12);

    this.sun.position.set(p.x - 30, p.y + 60, p.z - 20);
    this.sun.target.position.set(p.x, p.y, p.z + 10);
    this.sun.target.updateMatrixWorld();
  }

  _tickCamera(dt) {
    if (this._shake > 0) this._shake = Math.max(0, this._shake - dt * 1.6);
    const targetFov = this._baseFov + Math.min(16, Math.max(0, this._effectiveSpeed() - CONFIG.forwardSpeed) * 0.45);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.08;
      this.camera.updateProjectionMatrix();
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
