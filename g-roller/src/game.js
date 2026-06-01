import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CONFIG, BIOMES, biomeAt } from "./config.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { PlatformField, POWERUP_DEFS } from "./platforms.js";
import { Particles } from "./effects.js";
import { Background } from "./background.js";
import { Sound } from "./sound.js";

// Maps a timed effect's state key to its CONFIG duration key.
const EFFECT_DURATIONS = {
  magnet: "magnetDuration", slow: "slowDuration", doublejump: "doubleJumpDuration",
  flight: "flightDuration", reverse: "reverseDuration", surge: "surgeDuration",
  morph: "morphDuration", trip: "tripDuration", lowgrav: "lowgravDuration",
  flubber: "flubberDuration", blackout: "blackoutDuration", fog: "fogDuration",
};

// The conductor. Builds the 3D world, runs the game loop, owns the Start ->
// Playing -> Dead state machine, scoring, powerups, the chase camera, and the
// juice. This is the web stand-in for Unity's GameManager.
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = "start";
    this.baseSpeed = CONFIG.forwardSpeed;
    this._speed = CONFIG.forwardSpeed; // smoothed actual speed (eases toward the target)
    this._speedTimer = 0;
    this._accelBonus = 0;  // speed bonus accumulated while riding acceleration plates
    this._accelHold = 0;   // seconds left coasting at top speed after leaving a plate
    this._seenStart = 0;   // tracks Input.startPresses for the start gate
    this._cheat = false;
    this._konami = [];
    this._firstPerson = false;
    this._diffLevel = CONFIG.defaultDifficulty; // index into CONFIG.difficultyLevels
    this._restartLock = 0; // brief input-dead window after dying (no instant restart)
    this.gems = 0;
    this.score = 0;
    this.multiplier = 1;
    this._comboTimer = 0;
    this._freeze = 0;      // hit-stop timer
    this._biome = 0;
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._lean = 0; // smoothed steer for a soft camera lean
    this._throttleSmooth = 0; // smoothed Up/Down throttle for the speed camera response
    this._shake = 0;
    this._effects = { shield: false, magnet: 0, slow: 0, reverse: 0, surge: 0, doublejump: 0, flight: 0, morph: 0, trip: 0, lowgrav: 0, flubber: 0, blackout: 0, fog: 0 };
    this._invuln = 0;

    this._buildRenderer();
    this._buildScene();
    this._buildComposer();

    this.background = new Background(this.scene);
    this.sound = new Sound();
    this.input = new Input(canvas);
    this.player = new Player(this.scene);
    this.field = new PlatformField(this.scene);
    this.particles = new Particles(this.scene);

    this._hud = {
      score: document.getElementById("score"),
      mult: document.getElementById("mult"),
      distance: document.getElementById("distance"),
      speed: document.getElementById("speed"),
      diff: document.getElementById("hud-diff"),
      jumps: document.getElementById("jumps"),
      gems: document.getElementById("gems"),
      bestScore: document.getElementById("best-score"),
      bestDistance: document.getElementById("best-distance"),
      bestJumps: document.getElementById("best-jumps"),
      overlay: document.getElementById("overlay"),
      subtitle: document.getElementById("overlay-subtitle"),
      hint: document.getElementById("overlay-hint"),
      toast: document.getElementById("toast"),
      effects: document.getElementById("effects"),
    };

    this.bestScore = Number(localStorage.getItem("gr_bestScore") || 0);
    this.bestDistance = Number(localStorage.getItem("gr_bestDistance") || 0);
    this.bestJumps = Number(localStorage.getItem("gr_bestJumps") || 0);

    // Restore the player's saved preferences before anything reads them (camera
    // view, audio mute/track/fx, reduced motion). Must run after this.sound exists.
    this._loadSettings();

    this._resetWorld();
    this._refreshHud();

    // Keyboard shortcuts (touch players use the ⚙️ settings panel instead).
    this._isTouch = document.body.classList.contains("is-touch");
    if (this._isTouch) this._hud.hint.textContent = "Tap JUMP to roll";
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyM") this._toggleSound();
      if (e.code === "KeyV") this._toggleView();
      if (e.code === "KeyN") this._cycleTrack();
      if (e.code === "KeyX") this._toggleMusicFx();
      if (e.code === "KeyG") this._toggleReduced();
    });
    this._buildSettings();

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

    // Cheat entry for MOBILE (no arrow keys): secretly tap the title 10 times on the
    // start / game-over screen (also a click on desktop). No cursor, no toast, no
    // hint — you have to know it's there. The count resets if you pause too long.
    const title = document.getElementById("overlay-title");
    if (title) {
      title.style.pointerEvents = "auto"; // the HUD is click-through by default; taps must register
      this._titleTaps = 0;
      title.addEventListener("click", () => {
        if (this.state === "playing") return; // only on the start / game-over overlay
        this._titleTaps++;
        clearTimeout(this._titleTapTimer);
        this._titleTapTimer = setTimeout(() => { this._titleTaps = 0; }, 1500);
        if (this._titleTaps >= 10) {
          this._titleTaps = 0; clearTimeout(this._titleTapTimer);
          this._toggleCheat();
        }
      });
    }

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

  // Post-processing: a tightly thresholded bloom so only the bright emissive
  // things (gems, rings, boost pads, powerups, neon) glow — textured platforms
  // stay crisp.
  _buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.6,   // strength
      0.5,   // radius
      0.72   // threshold — only the brightest pixels bloom
    );
    this.composer.addPass(this.bloom);
  }

  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x141a33, CONFIG.fogNear, CONFIG.fogFar);
    this._fogLevel = 0; // smoothed 0..1 fog-powerdown amount (pulls the horizon in)

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this._updateBaseFov();

    this.hemi = new THREE.HemisphereLight(0xbcd0ff, 0x202840, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    // Base intensities so the blackout powerdown can dim toward dark and ease back.
    this._hemiBase = this.hemi.intensity;
    this._sunBase = this.sun.intensity;
    this._darkLevel = 0; // smoothed 0..1 blackout amount
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
    this._speed = CONFIG.forwardSpeed;
    this._speedTimer = 0;
    this._accelBonus = 0;
    this._accelHold = 0;
    this.gems = 0;
    this.score = 0;
    this.multiplier = 1;
    this._comboTimer = 0;
    this._biome = 0;
    this._throttleSmooth = 0;
    this._invuln = 0;
    this._effects = { shield: false, magnet: 0, slow: 0, reverse: 0, surge: 0, doublejump: 0, flight: 0, morph: 0, trip: 0, lowgrav: 0, flubber: 0, blackout: 0, fog: 0 };
    this._clearSplats();
    this._darkLevel = 0; // lights back to full for a fresh run
    this.hemi.intensity = this._hemiBase;
    this.sun.intensity = this._sunBase;
    this.background.dim = 0;
    this.field.blackout = false;
    this._fogLevel = 0;
    this.scene.fog.near = CONFIG.fogNear;
    this.scene.fog.far = CONFIG.fogFar;
    this.canvas.classList.remove("is-tripping");
    this.scene.fog.color.setHex(BIOMES[0].fog);
    this.sun.color.setHex(BIOMES[0].sun);
    this.field.reset();
    this.player.reset();
    this._followCamera(true);
  }

  _effectiveSpeed() {
    let s = this.baseSpeed;
    s += this._accelBonus; // built up by riding acceleration plates
    if (this._effects.surge > 0) s += CONFIG.surgeAmount;
    s += this.input.throttle * CONFIG.manualSpeed; // Up/Down arrows or thumbstick Y
    if (this._effects.slow > 0) s *= CONFIG.slowFactor;
    return Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxForwardSpeed + CONFIG.accelMax + 6, s));
  }

  // How long a timed effect lasts. Cheat mode keeps these TRUE to each powerup
  // (it only spawns more of them) so you can test the real durations.
  _dur(key) {
    return CONFIG[EFFECT_DURATIONS[key]];
  }

  _toggleView() {
    this._firstPerson = !this._firstPerson;
    this._followCamera(true); // snap so the switch isn't jarring
    this._syncSettings();
  }

  // --- Settings (keyboard shortcuts + the ⚙️ touch panel both call these) ---

  _toggleSound() {
    if (!this.sound.ctx) { this.sound.start(); this._toast("🔊 SOUND ON", "#bcd0ff"); }
    else this._toast(this.sound.toggleMute() ? "🔇 SOUND OFF" : "🔊 SOUND ON", "#bcd0ff");
    this._syncSettings();
  }

  _cycleTrack() {
    if (!this.sound.ctx) { this.sound.start(); this._toast(`🎵 ${this.sound.trackName()}`, "#a94bff"); }
    else this._toast(`🎵 ${this.sound.nextTrack()}`, "#a94bff");
    this._syncSettings();
  }

  _toggleMusicFx() {
    this._toast(this.sound.toggleReactive() ? "🎚️ MUSIC FX ON" : "🎚️ MUSIC FX OFF", "#a94bff");
    this._syncSettings();
  }

  _toggleReduced() {
    this._reducedMotion = !this._reducedMotion;
    this._toast(this._reducedMotion ? "🌿 REDUCED MOTION ON" : "REDUCED MOTION OFF", "#4dff8a");
    this._syncSettings();
  }

  // Cheat-only: allow/block a single powerup type from spawning. Disable everything
  // but the one you want and (with cheat's 5x items) it shows up constantly to test.
  _togglePowerupType(key) {
    const s = this.field.enabledPowerups;
    if (s.has(key)) s.delete(key); else s.add(key);
    this.field.pruneDisabledPowerups(); // clear already-spawned ones that are now blocked
    this._syncSettings();
  }

  _setAllPowerups(on) {
    const s = this.field.enabledPowerups;
    s.clear();
    if (on) for (const k of Object.keys(POWERUP_DEFS)) s.add(k);
    this.field.pruneDisabledPowerups();
    this._syncSettings();
  }

  _cycleDifficulty() {
    this._diffLevel = (this._diffLevel + 1) % CONFIG.difficultyLevels.length;
    const lvl = CONFIG.difficultyLevels[this._diffLevel];
    this.field.difficultyMult = lvl.mult; // takes effect on platforms generated from here on
    this._toast(`🎚️ ${lvl.name.toUpperCase()}`, "#ffd34e");
    this._syncSettings();
  }

  _buildSettings() {
    const $ = (id) => document.getElementById(id);
    this._settings = { sound: $("set-sound"), track: $("set-track"), fx: $("set-fx"), motion: $("set-motion"), view: $("set-view"), difficulty: $("set-difficulty"), powerups: $("set-powerups") };

    // Build the cheat-only per-powerup spawn-pool chips (one toggle per type).
    const grid = $("set-powerups-grid");
    this._puButtons = {};
    for (const key of Object.keys(POWERUP_DEFS)) {
      const b = document.createElement("button");
      b.className = "settings__pu";
      b.addEventListener("click", () => this._togglePowerupType(key));
      grid.appendChild(b);
      this._puButtons[key] = b;
    }
    $("set-pu-all").addEventListener("click", () => this._setAllPowerups(true));
    $("set-pu-none").addEventListener("click", () => this._setAllPowerups(false));
    const panel = $("settings-panel");
    const open = (v) => panel.classList.toggle("open", v);
    $("settings-btn").addEventListener("click", () => { this._syncSettings(); open(true); });
    $("set-close").addEventListener("click", () => open(false));
    panel.addEventListener("click", (e) => { if (e.target === panel) open(false); });
    this._settings.sound.addEventListener("click", () => this._toggleSound());
    this._settings.track.addEventListener("click", () => this._cycleTrack());
    this._settings.fx.addEventListener("click", () => this._toggleMusicFx());
    this._settings.motion.addEventListener("click", () => this._toggleReduced());
    this._settings.view.addEventListener("click", () => this._toggleView());
    this._settings.difficulty.addEventListener("click", () => this._cycleDifficulty());
    this._syncSettings();
  }

  _syncSettings() {
    const s = this._settings;
    if (!s) return;
    s.sound.textContent = `🔊 Sound: ${this.sound.muted ? "Off" : "On"}`;
    s.track.textContent = `🎵 Track: ${this.sound.trackName()}`;
    s.fx.textContent = `🎚️ Music FX: ${this.sound.reactive ? "On" : "Off"}`;
    s.motion.textContent = `🌿 Reduced Motion: ${this._reducedMotion ? "On" : "Off"}`;
    s.view.textContent = `👁 View: ${this._firstPerson ? "First-person" : "Third-person"}`;
    s.difficulty.textContent = `🎚️ Difficulty: ${CONFIG.difficultyLevels[this._diffLevel].name}`;
    // Per-powerup spawn pool is a cheat-only tool — only show it when cheat is on.
    if (s.powerups) s.powerups.style.display = this._cheat ? "" : "none";
    if (this._puButtons) {
      for (const key in this._puButtons) {
        const on = this.field.enabledPowerups.has(key);
        const b = this._puButtons[key];
        b.textContent = `${POWERUP_DEFS[key].icon} ${key}`;
        b.classList.toggle("off", !on);
      }
    }
    this._saveSettings(); // every toggle routes through here, so this captures all changes
  }

  // --- Persisted preferences (survive a reload) ----------------------------
  // Stored as individual gr_* keys next to the best-score keys. Booleans are
  // "1"/"0"; track is its index. Anything missing keeps the constructor default,
  // so first-time players (and reduced-motion-by-OS users) are unaffected.
  _loadSettings() {
    const get = (k) => localStorage.getItem(k);
    const view = get("gr_view");
    if (view !== null) this._firstPerson = view === "1";
    const motion = get("gr_motion");
    if (motion !== null) this._reducedMotion = motion === "1";
    const muted = get("gr_muted");
    if (muted !== null) this.sound.muted = muted === "1";
    const fx = get("gr_fx");
    if (fx !== null) this.sound.reactive = fx === "1";
    const track = get("gr_track");
    if (track !== null) this.sound.setTrack(Number(track));
    const diff = get("gr_diff");
    if (diff !== null) {
      const i = Number(diff);
      if (i >= 0 && i < CONFIG.difficultyLevels.length) this._diffLevel = i;
    }
    this.field.difficultyMult = CONFIG.difficultyLevels[this._diffLevel].mult; // apply restored (or default) level
  }

  _saveSettings() {
    localStorage.setItem("gr_view", this._firstPerson ? "1" : "0");
    localStorage.setItem("gr_motion", this._reducedMotion ? "1" : "0");
    localStorage.setItem("gr_muted", this.sound.muted ? "1" : "0");
    localStorage.setItem("gr_fx", this.sound.reactive ? "1" : "0");
    localStorage.setItem("gr_track", String(this.sound.trackIndex()));
    localStorage.setItem("gr_diff", String(this._diffLevel));
  }

  _toggleCheat() {
    this._cheat = !this._cheat;
    this.field.itemMultiplier = this._cheat ? CONFIG.cheatItemMultiplier : 1;
    if (!this._cheat) this._setAllPowerups(true); // leaving cheat restores the full spawn pool
    this._toast(
      this._cheat ? `🎮 CHEAT ON · ${CONFIG.cheatItemMultiplier}× items` : "CHEAT OFF",
      "#ffd34e"
    );
    this._syncSettings(); // show/hide the cheat-only Powerups row
  }

  _loop() {
    requestAnimationFrame(this._loop);
    let dt = Math.min(this._clock.getDelta(), 1 / 30);
    // Hit-stop: briefly near-freeze time on impactful moments for punch.
    if (this._freeze > 0) { this._freeze -= dt; dt *= 0.12; }

    if (this.state === "playing") {
      this._tickPlaying(dt);
    } else if (this._restartLock > 0) {
      this._restartLock -= dt;
      this._seenStart = this.input.startPresses; // swallow any presses during the grace
    } else if (this.input.startPresses !== this._seenStart) {
      this._seenStart = this.input.startPresses;
      this._startGame();
    }

    this.particles.update(dt);
    this.background.update(this.player.position.z, dt, this.state === "playing");
    this._followCamera(false);
    this._tickCamera(dt);
    this.composer.render(); // bloom (was wrongly blamed for the flip — that was the camera roll)
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
    if (this._invuln > 0) this._invuln -= dt;
    for (const k of ["magnet", "slow", "reverse", "surge", "doublejump", "flight", "morph", "trip", "lowgrav", "flubber", "blackout", "fog"])
      if (this._effects[k] > 0) this._effects[k] -= dt;
    // Psychedelic powerdown: recolor the view (gentle variant if reduced-motion).
    const tripping = this._effects.trip > 0;
    this.canvas.classList.toggle("is-tripping", tripping && !this._reducedMotion);
    this.canvas.classList.toggle("is-tripping--gentle", tripping && this._reducedMotion);
    // Let the music react to whatever's active (trip warble, etc.).
    this.sound.setEffects(this._effects);

    // Blackout powerdown: smoothly cut the lights toward near-dark and tell the field
    // to light its platform edges (emergency-aisle glow). Eases in and back out.
    const darkTarget = this._effects.blackout > 0 ? 1 : 0;
    this._darkLevel += (darkTarget - this._darkLevel) * (1 - Math.exp(-dt / 0.45));
    const m = 1 - this._darkLevel * (1 - CONFIG.blackoutDim);
    this.hemi.intensity = this._hemiBase * m;
    this.sun.intensity = this._sunBase * m;
    this.background.dim = this._darkLevel; // fade the skyline/moon down too
    this.field.blackout = this._effects.blackout > 0;

    // Fog powerdown: ease the horizon in (distinct from blackout — this hides
    // DISTANCE while the lights stay on, so you can't read far-off platforms).
    const fogTarget = this._effects.fog > 0 ? 1 : 0;
    this._fogLevel += (fogTarget - this._fogLevel) * (1 - Math.exp(-dt / 0.5));
    this.scene.fog.near = CONFIG.fogNear + (CONFIG.fogBlindNear - CONFIG.fogNear) * this._fogLevel;
    this.scene.fog.far = CONFIG.fogFar + (CONFIG.fogBlindFar - CONFIG.fogFar) * this._fogLevel;

    // Ease the actual speed toward the target. Easing INTO a slow-mo is extra
    // gradual (slowEase) so it doesn't yank the speed out and drop you short.
    const target = this._effectiveSpeed();
    const tau = this._effects.slow > 0 && target < this._speed ? CONFIG.slowEase : 0.33;
    this._speed += (target - this._speed) * (1 - Math.exp(-dt / tau));
    const speed = this._speed;
    const magnetPos = this._effects.magnet > 0 ? this.player.position : null;
    this.field.update(dt, this.player.position.z, speed, magnetPos);

    // Score = distance * multiplier; the multiplier decays if you stop taking risks.
    this.score += speed * dt * CONFIG.scorePerMeter * this.multiplier;
    this._comboTimer += dt;
    if (this._comboTimer >= CONFIG.comboDecay && this.multiplier > 1) {
      this.multiplier -= 1; this._comboTimer = 0;
    }
    this._updateBiome(this.player.position.z);

    const ctx = {
      forwardSpeed: speed,
      steerMult: this._effects.reverse > 0 ? -1 : 1,
      invuln: this._invuln > 0,
      shield: this._effects.shield,
      maxAirJumps: this._effects.doublejump > 0 ? 1 : 0,
      flight: this._effects.flight > 0,
      morph: this._effects.morph > 0,
      gravityScale: this._effects.lowgrav > 0 ? CONFIG.lowgravScale : 1,
      flubber: this._effects.flubber > 0,
    };
    const ev = this.player.update(dt, this.input, ctx, this.field);

    // Acceleration plates feel like a launch: while you ride, the build COMPOUNDS
    // (rate grows with the bonus already gathered) so it curves upward the longer
    // you stay. After you leave you coast at top speed for a beat (accelHold), then
    // bleed off in a steady LINEAR decel — momentum draining, not a hard cutoff.
    if (this.player.onBoost) {
      this._accelBonus = Math.min(CONFIG.accelMax, this._accelBonus + (CONFIG.accelRate + this._accelBonus * CONFIG.accelGrowth) * dt);
      this._accelHold = CONFIG.accelHold;
    } else if (this._accelHold > 0) {
      this._accelHold -= dt; // still launched — hold the top speed before decel starts
    } else {
      this._accelBonus = Math.max(0, this._accelBonus - CONFIG.accelDecay * dt);
    }

    if (ev.jumped) this.sound.jump();
    this._onLanded(ev);
    if (ev.hit) this._onHit(ev.hit);
    if (ev.nearMiss) this._onNearMiss();

    // Show every active effect on the ball (wings, hover board, orbiting glyphs).
    this.player.updateVisuals(this._effects, dt);

    // Ball speed-trail.
    const tp = this.player.position.clone(); tp.y -= this.player.radius * 0.6;
    this.particles.trail(tp, this._accelBonus > 1 || this._effects.surge > 0 ? 0x2bff6a : 0xffc24e);

    // Depth grid follows underneath.
    this.grid.position.z = Math.round(this.player.position.z / 5) * 5;
    this.grid.position.x = Math.round(this.player.position.x / 5) * 5;

    // Magnet pull happens inside field.update (so it doesn't fight the gem bob);
    // here we just harvest whatever's now in range.
    const grabbed = this.field.harvestGems(this.player.position, this.player.radius);
    for (const pos of grabbed) {
      this.gems += 1;
      this.score += CONFIG.gemScore * this.multiplier;
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
      this.particles.burst(p, 0x2bff6a, 16); this.sound.boost(); // acceleration plate — speed builds while you ride it
    } else if (ev.landed === "flubber") {
      this.particles.burst(p, 0x6aff6a, 8); this.sound.bounce(); // auto-bounce, every landing
    } else {
      this.particles.burst(p, 0xbfc6d8, 7); this.sound.land();
    }
  }

  _onHit(hit) {
    if (this._effects.shield) {
      // Shield absorbs the hit, smashes the obstacle, and grants a mercy window —
      // but a survived mistake breaks your combo.
      this._effects.shield = false;
      this._invuln = CONFIG.invulnTime;
      this.multiplier = 1; this._comboTimer = 0;
      this.field.removeObstacle(hit.platform, hit.obstacle);
      this.particles.burst(this.player.position, 0x35e0ff, 26);
      this._shake = 0.4; this._freeze = 0.07;
      this._toast("BLOCKED! combo lost", "#35e0ff");
      this.sound.clang();
    } else {
      this.particles.burst(this.player.position, 0xff3b3b, 30);
      this._die();
    }
  }

  // A clean graze past a hazard: bonus, multiplier bump, juice.
  _onNearMiss() {
    this.multiplier = Math.min(CONFIG.multiplierMax, this.multiplier + 1);
    this._comboTimer = 0;
    this.score += CONFIG.nearMissBonus * this.multiplier;
    this._freeze = 0.05;
    if (!this._reducedMotion) this._shake = Math.max(this._shake, 0.2);
    this._toast(`CLOSE! ×${this.multiplier}`, "#ffd34e");
    this.sound.nearMiss();
    this.sound.combo(this.multiplier);
  }

  // Crossfade fog + sun and swap the texture palette as you enter a new biome.
  _updateBiome(z) {
    const i = biomeAt(z);
    if (i !== this._biome) {
      this._biome = i;
      this._toast(`Entering ${BIOMES[i].name}`, "#9fe0ff");
    }
    const b = BIOMES[i];
    this.scene.fog.color.lerp(new THREE.Color(b.fog), 0.02);
    this.sun.color.lerp(new THREE.Color(b.sun), 0.02);
  }

  _applyPowerup(u) {
    const map = {
      shield: ["🛡️ SHIELD", "#35e0ff"], magnet: ["🧲 MAGNET", "#b06bff"], slow: ["🐢 SLOW-MO", "#4dff8a"],
      doublejump: ["⏫ DOUBLE JUMP", "#7cff5a"], flight: ["🕊️ FLIGHT — hold jump!", "#ffe14d"],
      lowgrav: ["🌙 LOW GRAVITY", "#9affd6"],
      reverse: ["🔄 REVERSED!", "#ff9f1c"], surge: ["⚡ SURGE!", "#ff3b3b"],
      morph: ["🌀 MORPH!", "#ff4bd6"], splat: ["💦 SPLAT!", "#8a5a2b"], trip: ["🌈 TRIPPING!", "#a94bff"],
      flubber: ["🫧 FLUBBER! — steer in the air", "#6aff6a"],
      blackout: ["🌑 BLACKOUT! — follow the edge lights", "#9fb3d0"],
      fog: ["🌫️ FOGGED! — distance is gone", "#9aa6b5"],
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
    const n = this._reducedMotion ? 3 : 10 + Math.floor(Math.random() * 5); // fewer if reduced-motion
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
      setTimeout(() => b.remove(), 17000); // gunk clings to the screen a long time now (~17s)
    }
  }

  _clearSplats() {
    const layer = document.getElementById("splats");
    if (layer) layer.innerHTML = "";
  }

  _die() {
    if (this.state === "dead") return;
    this.state = "dead";
    this._restartLock = 0.5; // 500 ms where no input restarts (no accidental instant replay)
    this._shake = 0.6;
    this.canvas.classList.remove("is-tripping", "is-tripping--gentle");
    this.particles.burst(this.player.position, 0xffd34e, 40);
    this.sound.die();

    const dist = Math.max(0, Math.floor(this.player.position.z));
    const score = Math.floor(this.score);
    const jumps = Math.max(0, this.player.jumpCount);
    if (score > this.bestScore) { this.bestScore = score; localStorage.setItem("gr_bestScore", String(score)); }
    if (dist > this.bestDistance) { this.bestDistance = dist; localStorage.setItem("gr_bestDistance", String(dist)); }
    if (jumps > this.bestJumps) { this.bestJumps = jumps; localStorage.setItem("gr_bestJumps", String(jumps)); }

    const best = score >= this.bestScore ? " · 🏆 NEW BEST!" : "";
    this._hud.subtitle.innerHTML = `Score <b>${score.toLocaleString()}</b>${best}<br>${dist} m · ${jumps} jumps · ${this.gems} 💎`;
    this._hud.hint.textContent = this._isTouch ? "Tap JUMP to roll again" : "Press SPACE to roll again";
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
    add("lowgrav", "🌙", "#9affd6");
    add("flight", "🕊️", "#ffd24a");
    add("reverse", "🔄", "#ff9f1c");
    add("surge", "⚡", "#ff3b3b");
    add("morph", "🌀", "#ff4bd6");
    add("flubber", "🫧", "#6aff6a");
    add("blackout", "🌑", "#9fb3d0");
    add("fog", "🌫️", "#9aa6b5");
    add("trip", "🌈", "#a94bff");
    this._hud.effects.innerHTML = rows
      .map(([icon, label, color, frac]) => {
        const w = Math.max(0, Math.min(1, frac)) * 100;
        return `<span class="chip" style="--c:${color}"><span class="chip__top">${icon} <b>${label}</b></span><span class="chip__bar"><span class="chip__fill" style="width:${w}%"></span></span></span>`;
      })
      .join("");
  }

  _refreshHud() {
    this._hud.score.textContent = Math.floor(this.score).toLocaleString();
    this._hud.mult.textContent = `×${this.multiplier}`;
    this._hud.distance.textContent = Math.max(0, Math.floor(this.player.position.z));
    this._hud.speed.textContent = Math.round(this._speed); // smoothed actual speed — spikes when you ride an accel plate
    if (this._hud.diff) this._hud.diff.textContent = CONFIG.difficultyLevels[this._diffLevel].name;
    this._hud.jumps.textContent = Math.max(0, this.player.jumpCount);
    this._hud.gems.textContent = this.gems;
    this._hud.bestScore.textContent = this.bestScore.toLocaleString();
    this._hud.bestDistance.textContent = this.bestDistance;
    this._hud.bestJumps.textContent = this.bestJumps;
  }

  _followCamera(snap) {
    const p = this.player.position;
    const k = snap ? 1 : 0.12;

    // Hide the ball when we're seeing through its eyes.
    this.player.mesh.visible = !this._firstPerson;

    // How far above the surface we launched from — drives the big-air "look toward
    // the landing" framing in BOTH views. Ramps in past ~12 up, full by ~47, so
    // normal hops are untouched.
    const groundY = this.player.lastGroundedY;
    const airAbove = Math.max(0, p.y - groundY);
    const air = Math.min(1, Math.max(0, (airAbove - 12) / 35));

    if (this._firstPerson) {
      // Sit just above the ball's center and look down the track.
      const eyeY = p.y + this.player.radius * 0.6;
      this.camera.position.x += (p.x - this.camera.position.x) * k;
      this.camera.position.y += (eyeY - this.camera.position.y) * k;
      this.camera.position.z = p.z + this.player.radius * 0.5;
      if (this._shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this._shake;
        this.camera.position.y += (Math.random() - 0.5) * this._shake;
      }
      // During big air, drop the gaze toward the ground ahead so you can spot a
      // landing instead of staring at the horizon.
      const lookY = (eyeY + 1) + (groundY - p.y) * 0.7 * air;
      const lookZ = p.z + 16 + air * 8;
      this.camera.lookAt(p.x, lookY, lookZ);
    } else {
      // Smooth the steer input so the lean eases gently in and out of turns
      // instead of snapping to it. (Kept subtle.)
      this._lean += (this.input.steer - this._lean) * (snap ? 1 : 0.05);

      // Big-air framing: the higher you climb, the more the camera rises, pulls back,
      // and pitches its gaze DOWN and ahead so the platforms below come back into frame.
      this.camera.position.x += (p.x - this._lean * 0.55 - this.camera.position.x) * k;
      this.camera.position.y += (p.y + 9 + airAbove * 0.35 - this.camera.position.y) * k;
      // Pull the camera back a touch when accelerating, in when braking — adds a
      // felt "g-force" to the Up/Down throttle; pull back further when way up high.
      this.camera.position.z = p.z - 16 - this._throttleSmooth * 2 - air * 10;
      const shake = this._reducedMotion ? this._shake * 0.35 : this._shake;
      if (shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * shake;
        this.camera.position.y += (Math.random() - 0.5) * shake;
      }
      // Drop the gaze toward the launch height and push it further ahead as we
      // climb — this is what tilts the camera down onto the path during big air.
      const lookY = (p.y + 1.5) + (groundY - p.y) * 0.55 * air;
      const lookZ = p.z + 12 + air * 18;
      this.camera.lookAt(p.x, lookY, lookZ);
      // Roll RELATIVE to the look direction (rotateZ), not by setting rotation.z —
      // setting the absolute Euler z flips the backward-looking lookAt upside down.
      this.camera.rotateZ(-this._lean * 0.008);
    }

    this.sun.position.set(p.x - 30, p.y + 60, p.z - 20);
    this.sun.target.position.set(p.x, p.y, p.z + 10);
    this.sun.target.updateMatrixWorld();
  }

  _tickCamera(dt) {
    if (this._shake > 0) this._shake = Math.max(0, this._shake - dt * 1.6);
    // Smooth the throttle and use it for a clear, bidirectional FOV punch:
    // accelerating widens the view, braking narrows it.
    this._throttleSmooth += (this.input.throttle - this._throttleSmooth) * 0.1;
    const speedFov = Math.min(14, Math.max(0, this._speed - CONFIG.forwardSpeed) * 0.4);
    const targetFov = this._baseFov + speedFov + this._throttleSmooth * 6;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.08;
      this.camera.updateProjectionMatrix();
    }
  }

  // FOV is vertical, so a tall/narrow (portrait/phone) screen would show a tiny
  // horizontal slice and feel zoomed-in. Widen the vertical FOV as the screen
  // gets narrower so the view stays roughly as wide as desktop.
  _updateBaseFov() {
    const aspect = window.innerWidth / window.innerHeight;
    this._baseFov = Math.min(86, 62 + Math.max(0, 1 / aspect - 1) * 26);
    this.camera.fov = this._baseFov;
    this.camera.updateProjectionMatrix();
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this._updateBaseFov();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}
