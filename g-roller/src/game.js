import * as THREE from "three";
import { CONFIG } from "./config.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { PlatformField } from "./platforms.js";
import { Particles } from "./effects.js";
import { Background } from "./background.js";
import { Sound } from "./sound.js";

// Maps a timed effect's state key to its CONFIG duration key.
const EFFECT_DURATIONS = {
  magnet: "magnetDuration", slow: "slowDuration", doublejump: "doubleJumpDuration",
  flight: "flightDuration", reverse: "reverseDuration", surge: "surgeDuration",
  morph: "morphDuration", trip: "tripDuration",
};

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
    this._seenStart = 0;   // tracks Input.startPresses for the start gate
    this._cheat = false;
    this._konami = [];
    this.gems = 0;
    this._shake = 0;
    this._effects = { shield: false, magnet: 0, slow: 0, reverse: 0, surge: 0, doublejump: 0, flight: 0, morph: 0, trip: 0 };
    this._invuln = 0;

    this._buildRenderer();
    this._buildScene();

    this.background = new Background(this.scene);
    this.sound = new Sound();
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

    // 'M' mutes/unmutes the audio.
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyM") this._toast(this.sound.toggleMute() ? "🔇 SOUND OFF" : "🔊 SOUND ON", "#bcd0ff");
    });

    // Secret cheat code, entered on the start / game-over screen.
    window.addEventListener("keydown", (e) => {
      if (this.state === "playing" || e.repeat) return; // arrows steer during play; ignore key-repeat
      this._konami.push(e.code);
      if (this._konami.length > CONFIG.cheatCode.length) this._konami.shift();
      if (CONFIG.cheatCode.every((k, i) => this._konami[i] === k)) {
        this._konami = [];
        this._toggleCheat();
      }
    });

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
    this._effects = { shield: false, magnet: 0, slow: 0, reverse: 0, surge: 0, doublejump: 0, flight: 0, morph: 0, trip: 0 };
    this._clearSplats();
    this.canvas.classList.remove("is-tripping");
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

  // Duration a timed effect lasts right now (cheat mode overrides everything).
  _dur(key) {
    return this._cheat ? CONFIG.cheatDuration : CONFIG[EFFECT_DURATIONS[key]];
  }

  _toggleCheat() {
    this._cheat = !this._cheat;
    this.field.itemMultiplier = this._cheat ? CONFIG.cheatItemMultiplier : 1;
    this._toast(
      this._cheat ? `🎮 CHEAT ON · ${CONFIG.cheatItemMultiplier}× items · ${CONFIG.cheatDuration}s power` : "CHEAT OFF",
      "#ffd34e"
    );
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this._clock.getDelta(), 1 / 30);

    if (this.state === "playing") {
      this._tickPlaying(dt);
    } else if (this.input.startPresses !== this._seenStart) {
      this._seenStart = this.input.startPresses;
      this._startGame();
    }

    this.particles.update(dt);
    this.background.update(this.player.position.z);
    this._followCamera(false);
    this._tickCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _startGame() {
    this.sound.start(); // this runs from a keypress/tap, so audio is allowed
    if (this.state === "dead") this._resetWorld();
    this.player.jumpCount = 0;
    this.player._seenPresses = this.input.jumpPresses; // don't let the start press auto-jump
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
    for (const k of ["magnet", "slow", "reverse", "surge", "doublejump", "flight", "morph", "trip"])
      if (this._effects[k] > 0) this._effects[k] -= dt;
    // Psychedelic powerdown: recolor the whole view via an animated CSS filter.
    this.canvas.classList.toggle("is-tripping", this._effects.trip > 0);

    const speed = this._effectiveSpeed();
    this.field.update(dt, this.player.position.z, speed);

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

    if (ev.jumped) this.sound.jump();
    this._onLanded(ev);
    if (ev.hit) this._onHit(ev.hit);

    // Ball speed-trail.
    const tp = this.player.position.clone(); tp.y -= this.player.radius * 0.6;
    this.particles.trail(tp, this._boostTimer > 0 || this._effects.surge > 0 ? 0x2bff6a : 0xffc24e);

    // Depth grid follows underneath.
    this.grid.position.z = Math.round(this.player.position.z / 5) * 5;
    this.grid.position.x = Math.round(this.player.position.x / 5) * 5;

    // Magnet pulls gems toward the player's current (post-move) position, then
    // we harvest — so they get yanked in and eaten instead of trailing behind.
    if (this._effects.magnet > 0) this.field.attract(this.player.position, dt);
    const grabbed = this.field.harvestGems(this.player.position, this.player.radius);
    for (const pos of grabbed) {
      this.gems += 1;
      this.particles.burst(pos, 0x66f0ff, 16);
    }
    if (grabbed.length) this.sound.gem();
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
      this.particles.burst(p, 0xff3f7a, 22); this._shake = 0.35; this._toast("BOING!", "#ff3f7a"); this.sound.bounce();
    } else if (ev.landed === "boost") {
      this._boostTimer = CONFIG.boostDuration; this.particles.burst(p, 0x2bff6a, 20); this._shake = 0.25; this._toast("BOOST!", "#2bff6a"); this.sound.boost();
    } else {
      this.particles.burst(p, 0xbfc6d8, 7); this.sound.land();
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
      this.sound.clang();
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
      morph: ["🌀 MORPH!", "#ff4bd6"], splat: ["💦 SPLAT!", "#8a5a2b"], trip: ["🌈 TRIPPING!", "#a94bff"],
    };
    // Different effects stack (run at once). Re-grabbing the same one tops its
    // timer back up without ever shortening it.
    if (u.type === "shield") this._effects.shield = true;
    else if (u.type === "splat") this._splat();
    else this._effects[u.type] = Math.max(this._effects[u.type] || 0, this._dur(u.type));

    this.particles.burst(u.pos, u.good ? 0x66f0ff : 0xff7a1c, 20);
    this._toast(map[u.type][0], map[u.type][1]);
    this.sound.power(u.good);
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
    this.canvas.classList.remove("is-tripping");
    this.particles.burst(this.player.position, 0xffd34e, 40);
    this.sound.die();

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
    const rows = [];
    if (e.shield) rows.push(["🛡️", "Shield", "#9fe0ff", 1]); // no timer — lasts till hit
    const add = (key, icon, color) => {
      if (e[key] > 0) rows.push([icon, `${Math.ceil(e[key])}s`, color, e[key] / this._dur(key)]);
    };
    add("magnet", "🧲", "#4a78ff");
    add("slow", "🐢", "#2fd9c0");
    add("doublejump", "⏫", "#c6ff3a");
    add("flight", "🕊️", "#ffd24a");
    add("reverse", "🔄", "#ff9f1c");
    add("surge", "⚡", "#ff3b3b");
    add("morph", "🌀", "#ff4bd6");
    add("trip", "🌈", "#a94bff");
    this._hud.effects.innerHTML = rows
      .map(([icon, label, color, frac]) => {
        const w = Math.max(0, Math.min(1, frac)) * 100;
        return `<span class="chip" style="--c:${color}"><span class="chip__top">${icon} <b>${label}</b></span><span class="chip__bar"><span class="chip__fill" style="width:${w}%"></span></span></span>`;
      })
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
