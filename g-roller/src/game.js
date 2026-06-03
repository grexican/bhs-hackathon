import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CONFIG, BIOMES, biomeAt, ZoneSeq } from "./config.js";
import { Input } from "./input.js";
import { Player, BALL_SKINS, ballSwatchURL } from "./player.js";
import { PlatformField, POWERUP_DEFS } from "./platforms.js";
import { Particles } from "./effects.js";
import { Background } from "./background.js";
import { Sound } from "./sound.js";
import { iconImg } from "./icons.js";

// All per-effect data (durations included) lives on POWERUP_DEFS now — these lists
// are DERIVED from it so adding/removing an effect needs no edits here.
// Timed effects = entries with a `dur` (shield is a boolean-until-hit; splat is instant).
// Used to tally how many effects are ACTIVE right now (drives the rune-spawn cooldown).
const EFFECT_DURATIONS_KEYS = Object.keys(POWERUP_DEFS).filter((k) => POWERUP_DEFS[k].dur > 0);
// The timed POWERDOWNS — having these active cranks the scoring multiplier
// (risk/reward for riding them out instead of avoiding them).
const BAD_EFFECTS = EFFECT_DURATIONS_KEYS.filter((k) => !POWERUP_DEFS[k].good);

// THREE hex color (0x9fe0ff) -> "#rrggbb" for the DOM HUD + toasts.
const hexCss = (n) => "#" + n.toString(16).padStart(6, "0");

// The conductor. Builds the 3D world, runs the game loop, owns the Start ->
// Playing -> Dead state machine, scoring, powerups, the chase camera, and the
// juice. This is the web stand-in for Unity's GameManager.
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = "start";
    this.baseSpeed = CONFIG.player.forwardSpeed;
    this._diffSpeedMult = 1; // per-difficulty base-speed factor (set from the chosen level below)
    this._speed = CONFIG.player.forwardSpeed; // smoothed actual speed (eases toward the target)
    this._speedTimer = 0;
    this._accelBonus = 0;  // speed bonus accumulated while riding acceleration plates
    this._accelHold = 0;   // seconds left coasting at top speed after leaving a plate
    this._seenStart = 0;   // tracks Input.startPresses for the start gate
    this._cheat = false;
    this._konami = [];
    this._firstPerson = false;
    this._diffLevel = CONFIG.gen.defaultDifficulty; // index into CONFIG.gen.tiers
    this._zen = false; // Zen mode: no death (power-bounce instead), no scoring/gems, no hazards
    this._god = false; // God mode (cheat): no death (power-bounce) but difficulty + scoring stay NORMAL — get harder without dying
    this._audiosurf = false; // Audiosurf mode: the world pulses on the music's beat
    this._randomTrack = false; // "🎲 Random" track mode: pick a different track each run (selectable past the last track in the track cycler)
    this._beatPulse = 0;     // 0..1 punch fired ON each beat, decays fast (drives bloom + FOV kick)
    this._restartLock = 0; // brief input-dead window after dying (no instant restart)
    this._cameraFrozen = false; // true during the cinematic fall-death: camera holds, doesn't chase the dead ball
    this._dyingT = 0;       // timer for the fall-death plummet before the game-over card
    this._deathLook = new THREE.Vector3(); // eased camera gaze target while watching the ball fall
    this.gems = 0;
    this.score = 0;
    this._airborne = 0; // metres travelled while OFF the ground this run (the "airborne meters" stat)
    this.multiplier = 1;
    this._comboTimer = 0;
    this._freeze = 0;      // hit-stop timer
    this._biome = 0;
    this._biomeBloom = 0;   // eased extra bloom for the active biome's signature flare level
    this._biomeFlash = 0;   // brief bloom punch on a zone change, decays to 0
    this._fovKick = 0;      // brief FOV widen on a zone change — the camera "whoomphs" back, decays to 0
    this._reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._lean = 0; // smoothed steer for a soft camera lean
    this._throttleSmooth = 0; // smoothed Up/Down throttle for the speed camera response
    this._shake = 0;
    this._effects = { shield: false, magnet: 0, slow: 0, reverse: 0, surge: 0, doublejump: 0, flight: 0, morph: 0, trip: 0, lowgrav: 0, flubber: 0, blackout: 0, fog: 0, rain: 0, splat: 0 };
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
      airborne: document.getElementById("airborne"),
      jumps: document.getElementById("jumps"),
      gems: document.getElementById("gems"),
      bestScore: document.getElementById("best-score"),
      bestDistance: document.getElementById("best-distance"),
      bestJumps: document.getElementById("best-jumps"),
      bestAirborne: document.getElementById("best-airborne"),
      overlay: document.getElementById("overlay"),
      subtitle: document.getElementById("overlay-subtitle"),
      hint: document.getElementById("overlay-hint"),
      restart: document.getElementById("overlay-restart"),
      toast: document.getElementById("toast"),
      effects: document.getElementById("effects"),
      biomeCard: document.getElementById("biome-card"),
      biomeCardName: document.getElementById("biome-card-name"),
      biomeCardTag: document.getElementById("biome-card-tag"),
    };
    // The pause-screen Restart button (promoted out of the ⚙️ panel).
    if (this._hud.restart) this._hud.restart.addEventListener("click", () => this._restartToTitle());

    // Records are kept PER DIFFICULTY now — loaded for the active tier in _loadSettings (after the
    // saved difficulty is restored). Default to zero until then.
    this.bestScore = 0; this.bestDistance = 0; this.bestJumps = 0; this.bestAirborne = 0;

    // Restore the player's saved preferences before anything reads them (camera
    // view, audio mute/track/fx, reduced motion). Must run after this.sound exists.
    this._loadSettings();

    this._resetWorld();
    this._refreshHud();

    // Keyboard shortcuts (touch players use the ⚙️ settings panel instead).
    this._isTouch = document.body.classList.contains("is-touch");
    if (this._isTouch) this._hud.hint.textContent = "Tap JUMP to roll";
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      // Settings shortcuts (desktop): M sound · V view · N track · X music-fx · G reduced-motion ·
      // K ball skin. Difficulty / Zen / Audiosurf are HOME-SCREEN choices now (no keybind) — this
      // also frees A, which was colliding with steer-left (A/D) during play.
      if (e.code === "KeyM") this._toggleSound();
      if (e.code === "KeyV") this._toggleView();
      if (e.code === "KeyN") this._cycleTrack();
      if (e.code === "KeyX") this._toggleMusicFx();
      if (e.code === "KeyG") this._toggleReduced();
      if (e.code === "KeyK") this._cycleSkin();
      // Pause/resume. Esc works, but browsers often swallow the FIRST Esc (it's
      // reserved for exiting fullscreen/pointer-lock), so P is a reliable alternative.
      if (e.code === "Escape" || e.code === "KeyP") this._togglePause();
      if (this._cheat && e.code === "KeyI") this._toggleGod(); // cheat-only: immortal (still escalates)
      if (this._cheat && e.code === "KeyC") this._cycleForcedZone(); // cheat-only: pin/cycle the zone to study it
      // Cheat-only desktop testing: instantly fire a powerdown on yourself.
      // R rain · F fog · B blackout · T trip · O slow-mo.
      if (this._cheat && this.state === "playing") {
        if (e.code === "KeyR") this._triggerEffect("rain");
        if (e.code === "KeyF") this._triggerEffect("fog");
        if (e.code === "KeyB") this._triggerEffect("blackout");
        if (e.code === "KeyT") this._triggerEffect("trip");
        if (e.code === "KeyO") this._triggerEffect("slow");
      }
    });
    this._buildSettings();

    // Secret cheat code, entered on the start / game-over screen.
    window.addEventListener("keydown", (e) => {
      if (this.state === "playing" || e.repeat) return; // arrows steer during play; ignore key-repeat
      this._konami.push(e.code);
      if (this._konami.length > CONFIG.cheat.code.length) this._konami.shift();
      if (CONFIG.cheat.code.every((k, i) => this._konami[i] === k)) {
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
    this._bloomBase = this.bloom.strength; // fog cranks this up so lights flare/halo
  }

  _buildScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x141a33, CONFIG.effects.fogNear, CONFIG.effects.fogFar);
    this._fogLevel = 0; // smoothed 0..1 fog-powerdown amount (pulls the horizon in)
    this._fogSmoke = new THREE.Color(CONFIG.effects.fogSmokeColor); // grey the fog tints toward while fogged — reads as smoke, not shadow
    this._rainLevel = 0; // smoothed 0..1 rain-powerdown amount (drives the windshield overlay)

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

    // Faint depth grid under the void. Hidden for now — we want the surreal
    // "floating way up high, no ground" feel instead (the background carries depth).
    this.grid = new THREE.GridHelper(400, 80, 0x3550aa, 0x223066);
    this.grid.position.y = -55;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.grid.visible = false;
    this.scene.add(this.grid);
  }

  _resetWorld() {
    this.baseSpeed = CONFIG.player.forwardSpeed;
    this._speed = CONFIG.player.forwardSpeed;
    this._speedTimer = 0;
    this._accelBonus = 0;
    this._accelHold = 0;
    this.gems = 0;
    this.score = 0;
    this._airborne = 0;
    this.multiplier = 1;
    this._comboTimer = 0;
    ZoneSeq.build(); // reshuffle the themed-zone order for this run (forced/enabled persist)
    this._biome = biomeAt(0); // opening zone (baseline, or a forced zone when testing)
    this._throttleSmooth = 0;
    this._invuln = 0;
    this._effects = { shield: false, magnet: 0, slow: 0, reverse: 0, surge: 0, doublejump: 0, flight: 0, morph: 0, trip: 0, lowgrav: 0, flubber: 0, blackout: 0, fog: 0, rain: 0, splat: 0 };
    this._splatActive = false;
    this._clearSplats();
    this._darkLevel = 0; // lights back to full for a fresh run
    this.hemi.intensity = this._hemiBase;
    this.sun.intensity = this._sunBase;
    this.background.dim = 0;
    this.field.blackout = false;
    this._fogLevel = 0;
    this.scene.fog.near = CONFIG.effects.fogNear;
    this.scene.fog.far = CONFIG.effects.fogFar;
    this.canvas.classList.remove("is-tripping");
    const startBiome = BIOMES[this._biome]; // baseline, or a forced zone when testing
    this.scene.fog.color.setHex(startBiome.fog);
    this.sun.color.setHex(startBiome.sun);
    // Park the backdrop on the starting biome's mood (no flash for the fresh start).
    this._biomeBloom = startBiome.bloom || 0;
    this._biomeFlash = 0;
    this.background.setBiome(startBiome);
    this.field.reset();
    this.player.reset();
    this._cameraFrozen = false; // un-freeze after a cinematic fall-death
    this._dyingT = 0;
    this.player.mesh.visible = !this._firstPerson; // the ball is back (it vanished on a fall death)
    this._followCamera(true);
  }

  // Extra scoring multiplier from active powerdowns: one per powerdown, plus a
  // stack bonus for every powerdown beyond the first. Zero when none are active.
  _dangerBonus() {
    let n = 0;
    for (const k of BAD_EFFECTS) if (this._effects[k] > 0) n++;
    if (n === 0) return 0;
    return n * CONFIG.scoring.powerdownMult + (n - 1) * CONFIG.scoring.powerdownStackBonus;
  }

  _effectiveSpeed() {
    let s = this.baseSpeed * this._diffSpeedMult; // Hard runs faster, Easy slower (gaps scale to live speed, so still reachable)
    if (!this._zen) s += this._accelBonus; // boost-plate accel — off in zen so it stays calm (no getting faster & faster)
    if (this._effects.surge > 0) s += CONFIG.effects.surgeAmount;
    s += this.input.throttle * CONFIG.player.manualSpeed; // Up/Down arrows or thumbstick Y
    if (this._effects.slow > 0) s *= CONFIG.effects.slowFactor;
    return Math.max(CONFIG.player.minSpeed, Math.min(CONFIG.player.maxForwardSpeed + CONFIG.plates.accel.max + 6, s));
  }

  // How long a timed effect lasts — straight off its POWERUP_DEFS entry.
  _dur(key) {
    return POWERUP_DEFS[key].dur;
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

  // Cycle: track 0 → 1 → … → last → 🎲 Random → track 0 … The "Random" slot turns on
  // random-each-run mode; picking any real track turns it back off and pins that track.
  _cycleTrack() {
    const firstStart = !this.sound.ctx;
    if (firstStart) this.sound.start(); // a keypress is a user gesture — audio may start
    if (this._randomTrack) {
      // leave Random → back to the first track
      this._randomTrack = false;
      this._userTrack = 0;
      this.sound.setTrack(0);
      this._toast(`🎵 ${this.sound.trackName()}`, "#a94bff");
    } else if (firstStart) {
      // first press only started audio — announce the current track, don't advance
      this._toast(`🎵 ${this.sound.trackName()}`, "#a94bff");
    } else if (this.sound.trackIndex() === this.sound.trackCount() - 1) {
      // past the last track → enter Random mode
      this._randomTrack = true;
      this._toast("🎲 Random — a new track each run", "#a94bff");
    } else {
      this.sound.nextTrack();
      this._userTrack = this.sound.trackIndex();
      this._toast(`🎵 ${this.sound.trackName()}`, "#a94bff");
    }
    this._saveSettings(); // persist the pick immediately (incl. random mode)
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

  // Push the chosen tier's profile (pace/hazard/openness/density/drama) into the
  // generator. Zen pins the danger ramp at a fixed mild point so it never escalates;
  // normal play lets danger ramp with distance.
  _applyDifficultyMult() {
    if (this._zen) {
      // Zen sits at a steady MEDIUM: use Medium's profile and pin danger.
      const med = CONFIG.gen.tiers.find((l) => l.name === "Medium") ?? CONFIG.gen.tiers[CONFIG.gen.defaultDifficulty];
      this.field.setProfile(med, { fixedDanger: CONFIG.zen.fixedDanger });
    } else {
      this.field.setProfile(CONFIG.gen.tiers[this._diffLevel]);
    }
  }

  // Pick a difficulty on the HOME screen (U1: NOT mid-run — difficulty defines the whole run, and
  // records are kept per-difficulty). Switches the active tier's records too.
  _setDifficulty(level) {
    if (this.state === "playing" || this.state === "paused") {
      this._toast("🎚️ Set difficulty on the title screen", "#ffd34e");
      return;
    }
    if (level < 0 || level >= CONFIG.gen.tiers.length || level === this._diffLevel) {
      this._syncHomeControls();
      return;
    }
    this._diffLevel = level;
    const lvl = CONFIG.gen.tiers[level];
    this._applyDifficultyMult();
    this._diffSpeedMult = lvl.pace;
    this._loadRecords();      // swap to this tier's records
    this._saveSettings();     // remember the pick (gr_diff)
    this._toast(`🎚️ ${lvl.name.toUpperCase()}`, "#ffd34e");
    this._syncHomeControls();
    this._refreshHud();
  }

  // Zen mode: a calm, no-pressure toggle. Flips no-death (power-bounce), scoring/gems
  // off, and zeroes the hazard mult so the field stops spawning anything dangerous.
  _toggleZen() {
    // Zen changes the whole run (no-death, scoring off, fixed difficulty), so it can
    // only be set on the title/game-over screen — not mid-run.
    if (this.state === "playing" || this.state === "paused") {
      this._toast("🧘 Set Zen on the title screen", "#9affd6");
      return;
    }
    this._zen = !this._zen;
    this._applyDifficultyMult();
    document.body.classList.toggle("is-zen", this._zen); // CSS hides the HUD counters — clean, just-zen'ing
    this._toast(this._zen ? "🧘 ZEN: On" : "🧘 ZEN: Off", "#9affd6");
    this._syncSettings();
    this._syncHomeControls();
  }

  // God mode (cheat-only, key I): you can't die — a fatal fall power-bounces you back up
  // like zen — BUT difficulty + speed keep escalating and scoring stays ON, so you get
  // progressively harder without ever dying. Works mid-run (it's a cheat).
  _toggleGod() {
    this._god = !this._god;
    this._toast(this._god ? "😇 GOD MODE: On" : "😇 GOD MODE: Off", "#ffd34e");
  }

  // Cheat-only zone tester: cycle the FORCED zone so the whole world pins to one zone
  // and you can study it. Steps null(random) → 0 → 1 → … → last → null. Fresh terrain
  // ahead takes on the forced zone within a board or two; the sky/flash switch at once.
  _cycleForcedZone() {
    const n = BIOMES.length;
    ZoneSeq.forced = ZoneSeq.forced == null ? 0 : ZoneSeq.forced + 1;
    if (ZoneSeq.forced >= n) {
      ZoneSeq.forced = null;
      this._toast("🎲 Zones: Random", "#9fe0ff");
    } else {
      const b = BIOMES[ZoneSeq.forced];
      this._toast(`📍 ${b.name}`, "#" + (b.accent & 0xffffff).toString(16).padStart(6, "0"));
    }
  }

  // Audiosurf mode: the world visibly pulses ON the music's beat so it feels
  // music-driven. Forces a rhythmic track and installs a per-beat callback that
  // fires a bloom + FOV punch landing exactly on the audible kick. Title/game-over
  // only (like Zen) — it changes the track + audio, so toggling mid-run is blocked.
  _toggleAudiosurf() {
    if (this.state === "playing" || this.state === "paused") {
      this._toast("🎵 Set Audiosurf on the title screen", "#ff4bd6");
      return;
    }
    this._audiosurf = !this._audiosurf;
    if (this._audiosurf) {
      this.sound.start(); // a toggle is a user gesture, so audio is allowed to start
      // Keep the current track if it's already beat-steady (Pulse Runner OR Solar
      // Drive); only switch to the default rhythmic track if the pick can't carry it.
      if (!this.sound.currentSteady()) this.sound.setTrack(CONFIG.audiosurf.track);
      this._installBeatHook();
      this._toast("🎵 AUDIOSURF: On", "#ff4bd6");
    } else {
      this.sound.onBeat = null; // stop all pulses — normal play is untouched, no perf cost
      this._beatPulse = 0;      // reset the bloom add so no leftover glow
      this.bloom.strength = this._bloomBase; // clear any pulse left on the bloom line
      this.sound.setTrack(this._userTrack); // restore the player's chosen track (audiosurf had forced the rhythmic one)
      this._toast("🎵 AUDIOSURF: Off", "#ff4bd6");
    }
    this._syncSettings();
    this._syncHomeControls();
  }

  // Install the per-beat callback. Schedules each pulse to land ON the audible beat:
  // `time` is when the kick will SOUND, so we wait out the lead (t - now) before
  // firing instead of pulsing ~100ms early. Safe to call repeatedly (just reassigns).
  _installBeatHook() {
    this.sound.onBeat = (b) => {
      const lead = Math.max(0, (b.time - this.sound.ctx.currentTime) * 1000);
      setTimeout(() => this._fireBeatPulse(), lead);
    };
  }

  // One beat hit: punch the pulse to 1 (softened under reduced-motion) and a quick
  // gem-sparkle accent at the ball. The decay (in _loop) folds it into bloom + FOV.
  _fireBeatPulse() {
    if (!this._audiosurf) return; // a stale scheduled callback after toggling off
    this._beatPulse = this._reducedMotion ? CONFIG.audiosurf.reducedScale : 1;
    // Light gameplay accent: a small cyan sparkle on the ball, in sync with the beat.
    if (this.state === "playing" && !this._reducedMotion) {
      this.particles.burst(this.player.position, 0xff4bd6, 6);
    }
  }

  _cycleSkin() {
    this._skinIndex = this.player.setSkin((this._skinIndex ?? 0) + 1); // applies + wraps + returns the new index
    this._toast(`🎨 ${BALL_SKINS[this._skinIndex].name}`, "#ffd34e");
    this._syncSettings();
    this._syncHomeControls();
  }

  // Desktop testing (cheat hotkeys): apply a powerup/powerdown to yourself by type.
  // Reuses the normal pickup path so it behaves exactly like rolling over it.
  _triggerEffect(type) {
    this._applyPowerup({ type, good: POWERUP_DEFS[type].good, pos: this.player.position.clone() });
  }

  _buildSettings() {
    const $ = (id) => document.getElementById(id);
    // Difficulty / Zen / Audiosurf are NO LONGER here — they moved to the home screen (run-defining).
    this._settings = { sound: $("set-sound"), track: $("set-track"), fx: $("set-fx"), motion: $("set-motion"), view: $("set-view"), skin: $("set-skin"), endrun: $("set-endrun"), powerups: $("set-powerups") };

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
    this._settings.skin.addEventListener("click", () => this._cycleSkin());
    this._settings.endrun.addEventListener("click", () => { this._restartToTitle(); open(false); }); // mobile way out of a run / zen
    this._buildHomeControls();
    this._syncSettings();
  }

  // The HOME-screen run controls: difficulty buttons + Zen / Audiosurf / change-Ball. These set the
  // run BEFORE it starts (difficulty/zen/audiosurf can't change mid-run); the cluster hides while
  // playing/paused (see _showHomeControls).
  _buildHomeControls() {
    const $ = (id) => document.getElementById(id);
    this._home = { controls: $("home-controls"), zen: $("home-zen"), audiosurf: $("home-audiosurf"), skin: $("home-skin") };
    this._diffButtons = Array.from(document.querySelectorAll(".home-diff__btn"));
    for (const b of this._diffButtons) b.addEventListener("click", () => this._setDifficulty(Number(b.dataset.diff)));
    if (this._home.zen) this._home.zen.addEventListener("click", () => this._toggleZen());
    if (this._home.audiosurf) this._home.audiosurf.addEventListener("click", () => this._toggleAudiosurf());
    if (this._home.skin) this._home.skin.addEventListener("click", () => this._cycleSkin());
    this._syncHomeControls();
  }

  // Reflect the active difficulty + mode state on the home buttons.
  _syncHomeControls() {
    if (this._diffButtons) {
      for (const b of this._diffButtons) b.classList.toggle("is-active", Number(b.dataset.diff) === this._diffLevel);
    }
    if (this._home) {
      if (this._home.zen) this._home.zen.classList.toggle("is-on", this._zen);
      if (this._home.audiosurf) this._home.audiosurf.classList.toggle("is-on", this._audiosurf);
      if (this._home.skin) {
        const i = this._skinIndex ?? 0;
        // Preview the actual ball (a spherical swatch) instead of a paint-splash emoji.
        this._home.skin.innerHTML = `<img class="ball-swatch" src="${ballSwatchURL(i)}" alt="" /> ${BALL_SKINS[i].name}`;
      }
    }
  }

  // Show the home controls on the start / game-over overlay; hide them while playing or paused.
  _showHomeControls(show) {
    if (this._home && this._home.controls) this._home.controls.classList.toggle("is-hidden", !show);
  }

  _syncSettings() {
    const s = this._settings;
    if (!s) return;
    s.sound.textContent = `🔊 Sound: ${this.sound.muted ? "Off" : "On"}`;
    s.track.textContent = this._randomTrack ? "🎵 Track: 🎲 Random" : `🎵 Track: ${this.sound.trackName()}`;
    s.fx.textContent = `🎚️ Music FX: ${this.sound.reactive ? "On" : "Off"}`;
    s.motion.textContent = `🌿 Reduced Motion: ${this._reducedMotion ? "On" : "Off"}`;
    s.view.textContent = `👁 View: ${this._firstPerson ? "First-person" : "Third-person"}`;
    if (s.skin) s.skin.textContent = `🎨 Ball Skin: ${BALL_SKINS[this._skinIndex ?? 0].name}`;
    // Difficulty / Zen / Audiosurf live on the home screen now — _syncHomeControls reflects them.
    // Per-powerup spawn pool is a cheat-only tool — only show it when cheat is on.
    if (s.powerups) s.powerups.style.display = this._cheat ? "" : "none";
    if (this._puButtons) {
      for (const key in this._puButtons) {
        const on = this.field.enabledPowerups.has(key);
        const b = this._puButtons[key];
        // Show the same EMOJI used in-world (not the HUD vector icon) so the cheat
        // menu matches what you actually see on the pickups.
        b.innerHTML = `<span class="settings__puemoji">${POWERUP_DEFS[key].icon}</span> ${key}`;
        b.classList.toggle("off", !on);
      }
    }
    this._saveSettings(); // every toggle routes through here, so this captures all changes
  }

  // --- Per-difficulty records ----------------------------------------------
  // Best score/distance/jumps/airborne are kept SEPARATELY for each difficulty (a Hard run and an
  // Easy run no longer share one leaderboard). Stored as one JSON blob per tier under gr_best_<name>.
  _recordKey(level = this._diffLevel) {
    return "gr_best_" + CONFIG.gen.tiers[level].name.toLowerCase();
  }
  _loadRecords() {
    let r = {};
    try { r = JSON.parse(localStorage.getItem(this._recordKey()) || "{}"); } catch { r = {}; }
    this.bestScore = r.score || 0;
    this.bestDistance = r.distance || 0;
    this.bestJumps = r.jumps || 0;
    this.bestAirborne = r.airborne || 0;
  }
  _saveRecords() {
    localStorage.setItem(this._recordKey(), JSON.stringify({
      score: this.bestScore, distance: this.bestDistance, jumps: this.bestJumps, airborne: this.bestAirborne,
    }));
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
    this._userTrack = track !== null ? Number(track) : 0; // the player's MANUAL track choice — audiosurf forces its own track WITHOUT overwriting this
    const diff = get("gr_diff");
    if (diff !== null) {
      const i = Number(diff);
      if (i >= 0 && i < CONFIG.gen.tiers.length) this._diffLevel = i;
    }
    const zen = get("gr_zen");
    if (zen !== null) this._zen = zen === "1";
    // Audiosurf: if it was left on, force the rhythmic track now. The onBeat hook is
    // wired up lazily once audio starts (in _startGame), since there's no AudioContext yet.
    const audiosurf = get("gr_audiosurf");
    if (audiosurf !== null) this._audiosurf = audiosurf === "1";
    const rand = get("gr_randtrack");
    if (rand !== null) this._randomTrack = rand === "1";
    // Play audiosurf's rhythmic track while it's on, otherwise the saved manual choice.
    this.sound.setTrack(this._userTrack);
    // Audiosurf needs a steady beat; keep the saved pick if it's steady, else default.
    if (this._audiosurf && !this.sound.currentSteady()) this.sound.setTrack(CONFIG.audiosurf.track);
    // Random mode: start the session on a random track too (it re-rolls each run anyway).
    if (this._randomTrack) this.sound.randomTrack(this._audiosurf);
    this._applyDifficultyMult(); // apply restored (or default) level — forced to 0 in zen
    document.body.classList.toggle("is-zen", this._zen); // hide HUD counters if restored into zen
    this._diffSpeedMult = CONFIG.gen.tiers[this._diffLevel].pace;
    this._loadRecords(); // load the active tier's per-difficulty records
    const skin = get("gr_skin");
    this._skinIndex = this.player.setSkin(skin !== null ? Number(skin) : 0); // apply saved (or default) skin
  }

  _saveSettings() {
    localStorage.setItem("gr_view", this._firstPerson ? "1" : "0");
    localStorage.setItem("gr_motion", this._reducedMotion ? "1" : "0");
    localStorage.setItem("gr_muted", this.sound.muted ? "1" : "0");
    localStorage.setItem("gr_fx", this.sound.reactive ? "1" : "0");
    localStorage.setItem("gr_track", String(this._userTrack ?? this.sound.trackIndex())); // save the MANUAL pick, not the audiosurf-forced track
    localStorage.setItem("gr_diff", String(this._diffLevel));
    localStorage.setItem("gr_skin", String(this._skinIndex ?? 0));
    localStorage.setItem("gr_zen", this._zen ? "1" : "0");
    localStorage.setItem("gr_audiosurf", this._audiosurf ? "1" : "0");
    localStorage.setItem("gr_randtrack", this._randomTrack ? "1" : "0");
  }

  _toggleCheat() {
    this._cheat = !this._cheat;
    this.field.itemMultiplier = this._cheat ? CONFIG.cheat.itemMultiplier : 1;
    if (!this._cheat) this._setAllPowerups(true); // leaving cheat restores the full spawn pool
    this._toast(
      this._cheat ? "🎮 CHEAT ON · pick your spawn pool in ⚙️" : "CHEAT OFF",
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
    } else if (this.state === "dying") {
      // Cinematic fall-death: the camera is LOCKED where it was (position frozen,
      // forward progress stopped) and just tilts its gaze down to watch the ball drop
      // straight into the void. Gameplay is off.
      this._dyingT += dt;
      const pl = this.player, v = pl.vel;
      if (pl.mesh.visible) {
        v.y -= CONFIG.player.gravity * dt;          // only gravity — forward/sideways are locked
        pl.position.y += v.y * dt;           // position IS the mesh position — falls straight down
        pl._roll(dt);                        // keeps tumbling (its forward/side spin is retained)
        // Ease the gaze toward the ball (seeded from the live view dir in _die, so no snap).
        this._deathLook.lerp(pl.position, 1 - Math.exp(-dt / 0.5));
        this.camera.lookAt(this._deathLook);
        if (pl.position.y < this.camera.position.y - 110) { // plunged out of frame → splashdown
          pl.mesh.visible = false;
          this.particles.burst(pl.position, 0x9fb8ff, 22); // a small poof as it winks out
          this._splashT = this._dyingT;
        }
      }
      // Show the game-over card SHORTLY after splashdown (snappy), or on a JUMP press,
      // with a hard safety cap in case the fall never registers a splash. The press-to-
      // skip only arms after a short grace — otherwise the jump you were mashing to clear
      // the gap you just missed instantly skips the whole cinematic (it "just ends").
      const canSkip = this._dyingT > 0.8;
      if (canSkip && this.input.startPresses !== this._seenStart) { this._seenStart = this.input.startPresses; this._finishDeath(); }
      else if (this._splashT != null && this._dyingT - this._splashT >= 1.5) this._finishDeath();
      else if (this._dyingT >= CONFIG.world.fallDeathHang) this._finishDeath();
      if (!canSkip) this._seenStart = this.input.startPresses; // swallow presses during the grace so they don't queue a skip
    } else if (this.state === "paused") {
      // Frozen. A jump press (or Esc, handled in keydown) resumes — NOT a restart.
      if (this.input.startPresses !== this._seenStart) {
        this._seenStart = this.input.startPresses;
        this._resume();
      }
    } else if (this._restartLock > 0) {
      this._restartLock -= dt;
      this._seenStart = this.input.startPresses; // swallow any presses during the grace
    } else if (this.input.startPresses !== this._seenStart) {
      this._seenStart = this.input.startPresses;
      this._startGame();
    }

    // Audiosurf: decay the beat pulse every frame (fast, so it reads as a punch on
    // the beat, not a glow that lingers). _tickPlaying / _tickCamera fold the live
    // value into bloom + FOV; on the title screen we add the bloom kick here so the
    // pulse is visible there too (where the loop below skips _tickPlaying's bloom line).
    if (this._beatPulse > 0) this._beatPulse = Math.max(0, this._beatPulse - dt * CONFIG.audiosurf.decay);
    if (this._audiosurf && this.state !== "playing") {
      this.bloom.strength = this._bloomBase + (this._biomeBloom || 0) + this._beatPulse * CONFIG.audiosurf.bloomKick;
    }

    this.particles.update(dt);
    this.background.update(this.player.position.z, dt, this.state === "playing", this.player.position.x, this.player.position.y, this.field.emitterTarget);
    // Frozen during (and after) a cinematic fall-death so the camera holds its spot
    // and watches the ball drop away, then stays put on the empty scene.
    if (!this._cameraFrozen) this._followCamera(false);
    this._tickCamera(dt);
    this.composer.render(); // bloom (was wrongly blamed for the flip — that was the camera roll)
  }

  _startGame() {
    this.sound.start(); // this runs from a keypress/tap, so audio is allowed
    // If Audiosurf is on (e.g. restored from a saved pref before audio existed), make
    // sure the rhythmic track is forced and the beat hook is live now that audio runs.
    if (this._audiosurf) {
      if (!this.sound.currentSteady()) this.sound.setTrack(CONFIG.audiosurf.track); // any steady track is fine for the on-beat pulse
      if (!this.sound.onBeat) this._installBeatHook();
    }
    // Random-track mode: pick a fresh track for THIS run (respawn). Steady-only when
    // audiosurf is on so the beat-pulse still has a kick to ride. _startGame is the
    // fresh-run entry (resume goes through _resume), so this only fires on a real respawn.
    if (this._randomTrack) this._toast(`🎲 ${this.sound.randomTrack(this._audiosurf)}`, "#a94bff");
    if (this.state === "dead") this._resetWorld();
    this.player.jumpCount = 0;
    this.player._seenPresses = this.input.jumpPresses; // don't let the start press auto-jump
    this.gems = 0;
    this.state = "playing";
    this._showHomeControls(false); // difficulty/modes are locked once a run starts
    this._hud.overlay.classList.add("is-hidden");
    this._refreshHud();
  }

  _tickPlaying(dt) {
    // Difficulty ramp (capped so it stays playable). Frozen in zen — a calm, steady
    // pace, no getting-faster-and-faster.
    if (!this._zen) {
      this._speedTimer += dt;
      if (this._speedTimer >= CONFIG.world.speedRampEvery) {
        this._speedTimer = 0;
        this.baseSpeed = Math.min(CONFIG.player.maxForwardSpeed, this.baseSpeed + CONFIG.world.speedRampAmount);
      }
    }
    if (this._invuln > 0) this._invuln -= dt;
    // Count every timed effect down (list derived from POWERUP_DEFS — splat included now).
    for (const k of EFFECT_DURATIONS_KEYS) if (this._effects[k] > 0) this._effects[k] -= dt;
    // Splat's gunk clears when its timer runs out (it's a real timed effect now, not a CSS-only fade).
    if (this._splatActive && this._effects.splat <= 0) { this._clearSplats(); this._splatActive = false; }
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
    const m = 1 - this._darkLevel * (1 - CONFIG.effects.blackoutDim);
    // Audiosurf: flash the scene lights brighter on each beat — the "ground" pump.
    const beatLight = this._audiosurf ? this._beatPulse * CONFIG.audiosurf.lightKick : 0;
    this.hemi.intensity = this._hemiBase * (m + beatLight);
    this.sun.intensity = this._sunBase * (m + beatLight);
    this.background.dim = this._darkLevel; // fade the skyline/moon down too
    this.background.beat = this._audiosurf ? this._beatPulse : 0; // skyline windows flash on the beat
    this.field.blackout = this._effects.blackout > 0;
    this.field.beat = this._audiosurf && this._effects.blackout <= 0 ? this._beatPulse : 0; // tiles pulse colour on the beat (not during blackout)
    this.field.setEmissiveScale(m); // dim the self-lit plates (boost green / bouncy red) in step with the lights — otherwise they ignore the blackout
    // Night-driving darkness: a dark film right on the lens. The scene stays faintly
    // lit underneath (dimmed plates + edge outlines + glowing pickups), so you get
    // "faint outlines you have to focus on" rather than a flat black screen.
    if (!this._darkLensEl) this._darkLensEl = document.getElementById("dark-lens");
    this._darkLensEl.style.opacity = this._darkLevel;

    // Fog powerdown: ease the horizon in (distinct from blackout — this hides
    // DISTANCE while the lights stay on, so you can't read far-off platforms).
    const fogTarget = this._effects.fog > 0 ? 1 : 0;
    this._fogLevel += (fogTarget - this._fogLevel) * (1 - Math.exp(-dt / 0.5));
    this.scene.fog.near = CONFIG.effects.fogNear + (CONFIG.effects.fogBlindNear - CONFIG.effects.fogNear) * this._fogLevel;
    this.scene.fog.far = CONFIG.effects.fogFar + (CONFIG.effects.fogBlindFar - CONFIG.effects.fogFar) * this._fogLevel;
    // Tint the fog toward grey smoke as it rolls in — otherwise distance just fades
    // to the dark biome colour (reads as shadow, not smoke). Strong lerp so it wins
    // against the biome colour crossfade; when fog lifts, _fogLevel→0 hands the
    // colour back to the biome tint. (The wall of grey is what makes it impenetrable.)
    if (this._fogLevel > 0.01) this.scene.fog.color.lerp(this._fogSmoke, 0.15 * this._fogLevel);
    // Haze on the lens, right on the camera — grey wash + a blur that ramps with the
    // fog (everything goes soft), plus extra bloom so lights flare/halo like real fog.
    if (!this._fogLensEl) this._fogLensEl = document.getElementById("fog-lens");
    this._fogLensEl.style.opacity = this._fogLevel;
    const blur = (this._fogLevel * 2.7).toFixed(2); // a touch less blur — fog is slightly easier to see through now
    this._fogLensEl.style.backdropFilter = this._fogLensEl.style.webkitBackdropFilter = `blur(${blur}px)`;
    // Bloom = base + fog crank + the active biome's signature flare + a brief
    // entry-flash punch when you cross into a new zone.
    // Audiosurf adds a brief bloom kick on each beat (decayed in _loop) on top of
    // the usual base + fog + biome flare — the core "pulses with the music" feel.
    this.bloom.strength = this._bloomBase + this._fogLevel * 0.7 + this._biomeBloom + this._biomeFlash
      + (this._audiosurf ? this._beatPulse * CONFIG.audiosurf.bloomKick : 0);

    // Rain powerdown: heavy windshield rain. Fade the lens overlay in/out with the
    // effect + ramp a blur (wet, blurred vision — cousin of fog). The streaks and
    // sliding drops are pure CSS on #rain-lens; here we just drive opacity + blur.
    const rainTarget = this._effects.rain > 0 ? 1 : 0;
    this._rainLevel += (rainTarget - this._rainLevel) * (1 - Math.exp(-dt / 0.5));
    if (!this._rainLensEl) this._rainLensEl = document.getElementById("rain-lens");
    this._rainLensEl.style.opacity = this._rainLevel;
    // Keep the OVERALL veil blur very light — the distortion should come almost
    // entirely from the DROPS themselves (per-drop lens on .raindrop). A heavy
    // whole-screen smear just reads as "out of focus", not "rain on glass".
    this._rainLensEl.style.backdropFilter = this._rainLensEl.style.webkitBackdropFilter =
      `blur(${(this._rainLevel * 1.2).toFixed(2)}px)`;
    // Spawn fat drops at RANDOM positions/sizes/timing while it rains — each is a div
    // that slides down + fades then self-removes (no synced loop = real randomness).
    // Each drop carries its OWN backdrop-filter blur (a full-screen pass), so the count
    // must stay bounded or it tanks the framerate. Cap concurrent drops + a calmer spawn
    // rate: still reads as dense rain, but ~16 lens-passes instead of ~80.
    if (this._rainLevel > 0.25 && this._rainLensEl.childElementCount < 16) {
      this._rainDropT = (this._rainDropT || 0) + dt;
      if (this._rainDropT >= (this._rainDropNext || 0)) {
        this._rainDropT = 0;
        this._rainDropNext = 0.05 + Math.random() * 0.13; // next drop 50–180ms out
        const d = document.createElement("div");
        d.className = "raindrop";
        const sr = Math.random();
        const w = 22 + sr * sr * 248;             // ~22–270px: biased small, occasional MONSTER bead
        const dur = 2.8 + Math.random() * 6.4;    // 2.8–9.2s: drops crawl down the glass, no fast streaking
        const round = Math.min(1, (dur - 2.8) / 6.4); // slower drops are rounder
        const hMul = 2.05 - round * 0.95;         // fast = elongated streak, slow = near-round bead
        d.style.width = `${w.toFixed(0)}px`;
        d.style.height = `${(w * hMul).toFixed(0)}px`;
        d.style.left = `${(Math.random() * 100).toFixed(1)}%`;
        d.style.borderRadius = round > 0.5 ? "50%" : "48% 48% 54% 54% / 58% 58% 44% 44%";
        d.style.setProperty("--dur", `${dur.toFixed(2)}s`);
        d.addEventListener("animationend", () => d.remove());
        this._rainLensEl.appendChild(d);
      }
    }

    // Ease the actual speed toward the target. Easing INTO a slow-mo is extra
    // gradual (slowEase) so it doesn't yank the speed out and drop you short.
    const target = this._effectiveSpeed();
    // While riding a boost plate, chase the target FAST so the whole speed gain
    // lands before you lift off — otherwise the eased catch-up keeps climbing in the
    // air (felt like "accelerating mid-jump"). Slow-mo easing still wins when active.
    const tau = this._effects.slow > 0 && target < this._speed ? CONFIG.effects.slowEase
      : this.player.onBoost ? CONFIG.plates.accel.ease
      : 0.33;
    this._speed += (target - this._speed) * (1 - Math.exp(-dt / tau));
    const speed = this._speed;
    const magnetPos = this._effects.magnet > 0 ? this.player.position : null;
    // Rune cooldown = active-effect LOAD: tell the field how many powerups/downs are
    // live right now (timed ones + the boolean shield). The field scales the rune
    // spawn chance down by this, so runes thin out while you're juggling effects and
    // ease back as they expire.
    let active = this._effects.shield ? 1 : 0;
    for (const k of EFFECT_DURATIONS_KEYS) if (this._effects[k] > 0) active++;
    this.field.activeEffects = active;
    // Size generation gaps off the SUSTAINABLE auto-run speed (base × tier pace), NOT the
    // live boosted speed. With a long keep-ahead lead, a gap sized for a momentary accel/
    // surge/flipper spike would be unjumpable once that boost faded by the time you reach
    // it (the "impossible jump" bug). Boosts then only ADD clearance margin.
    const genSpeed = this.baseSpeed * this._diffSpeedMult;
    this.field.update(dt, this.player.position.z, genSpeed, magnetPos);

    // Score = distance * multiplier; the multiplier decays if you stop taking risks.
    // _effMult folds in the powerdown risk/reward bonus on top of the combo multiplier
    // (also used for gem pickups + the HUD this frame).
    this._effMult = this.multiplier + this._dangerBonus();
    if (!this._zen) this.score += speed * dt * CONFIG.scoring.scorePerMeter * this._effMult; // scoring is off in zen
    this._comboTimer += dt;
    if (this._comboTimer >= CONFIG.scoring.comboDecay && this.multiplier > 1) {
      this.multiplier -= 1; this._comboTimer = 0;
    }
    this._updateBiome(this.player.position.z, dt);

    const ctx = {
      forwardSpeed: speed,
      steerMult: this._effects.reverse > 0 ? -1 : 1,
      invuln: this._invuln > 0,
      shield: this._effects.shield,
      maxAirJumps: this._effects.doublejump > 0 ? 1 : 0,
      flight: this._effects.flight > 0,
      morph: this._effects.morph > 0,
      gravityScale: this._effects.lowgrav > 0 ? CONFIG.effects.lowgravScale : 1,
      flubber: this._effects.flubber > 0,
    };
    const ev = this.player.update(dt, this.input, ctx, this.field);

    // Airborne meters (just-for-fun stat): how much of the run's forward distance is spent in the
    // air. Accumulate the forward advance whenever the ball isn't grounded.
    if (!this.player.grounded) this._airborne += speed * dt;

    // Acceleration plates feel like a launch: while you ride, the build COMPOUNDS
    // (rate grows with the bonus already gathered) so it curves upward the longer
    // you stay. After you leave you coast at top speed for a beat (accelHold), then
    // bleed off in a steady LINEAR decel — momentum draining, not a hard cutoff.
    if (this.player.onBoost) {
      this._accelBonus = Math.min(CONFIG.plates.accel.max, this._accelBonus + (CONFIG.plates.accel.rate + this._accelBonus * CONFIG.plates.accel.growth) * dt);
      this._accelHold = CONFIG.plates.accel.hold;
    } else if (this._accelHold > 0) {
      this._accelHold -= dt; // still launched — hold the top speed before decel starts
    } else {
      this._accelBonus = Math.max(0, this._accelBonus - CONFIG.plates.accel.decay * dt);
    }

    if (ev.jumped) this.sound.jump();
    this._onLanded(ev);
    if (ev.hit) this._onHit(ev.hit);
    if (ev.nearMiss) this._onNearMiss();

    // Show every active effect on the ball (wings, hover board, orbiting glyphs).
    // The orbit glyphs draw a depletion ring, so hand them remaining/total per
    // effect (same math the HUD chips use) — player.js doesn't know durations.
    const fracs = {};
    for (const k of ["magnet", "slow", "reverse", "surge"]) fracs[k] = this._effects[k] / this._dur(k);
    this.player.updateVisuals(this._effects, dt, fracs);

    // Ball speed-trail — hidden for now (re-enable by uncommenting these two lines).
    // const tp = this.player.position.clone(); tp.y -= this.player.radius * 0.6;
    // this.particles.trail(tp, this._accelBonus > 1 || this._effects.surge > 0 ? 0x2bff6a : 0xffc24e);

    // Depth grid follows underneath.
    this.grid.position.z = Math.round(this.player.position.z / 5) * 5;
    this.grid.position.x = Math.round(this.player.position.x / 5) * 5;

    // Magnet pull happens inside field.update (so it doesn't fight the gem bob);
    // here we just harvest whatever's now in range.
    const grabbed = this.field.harvestGems(this.player.position, this.player.radius);
    for (const { pos, value } of grabbed) {
      // Zen mode doesn't count gems or score them — but they still sparkle on pickup. A CLUSTER gem
      // (off-path side quest) counts for `value` gems (5× / 10×) and scores accordingly.
      if (!this._zen) {
        this.gems += value;
        this.score += CONFIG.scoring.gemScore * value * (this._effMult ?? this.multiplier);
      }
      const cluster = value > 1;
      this.particles.burst(pos, cluster ? 0xffd34e : 0x66f0ff, cluster ? 30 : 16);
      if (cluster && !this._zen) this._toast(`+${value} 💎`, "#ffd34e");
    }
    if (grabbed.length) this.sound.gem();
    for (const u of this.field.harvestPowerups(this.player.position, this.player.radius)) {
      this._applyPowerup(u);
    }

    this._refreshHud();
    this._renderEffects();
    // Zen mode never dies — ignore the normal death signal. Instead the catch below
    // lets you actually FALL well past the boards before flinging you back up.
    if (ev.died && !this._zen && !this._god) this._die("fell");

    // Zen power-bounce: only once you've fallen a real distance BELOW the lowest
    // nearby board (zenCatchDepth) and are still descending. No teleport — the bounce
    // launches you from where you fell, so you watch the drop, then sail back up to
    // land and keep going. The rising apex sits above the catch line, so it won't
    // re-trigger until you fall back down.
    if ((this._zen || this._god) && this.player.vel.y < 0) {
      const floor = this.field.lowestTopNear(this.player.position.z);
      const catchLine = (floor === -Infinity ? 0 : floor) - CONFIG.zen.catchDepth;
      if (this.player.position.y < catchLine) {
        this.player.vel.y = CONFIG.player.jumpSpeed * CONFIG.zen.bounce;
        this.player.vel.x *= 0.5;
        this.particles.burst(this.player.position, 0x9affd6, 18);
        this.sound.bounce();
      }
    }
  }

  _onLanded(ev) {
    if (!ev.landed) return;
    const p = ev.pos.clone(); p.y -= this.player.radius;
    if (ev.landed === "bouncy") {
      this.particles.burst(p, 0xff3f7a, 22); this._shake = 0.35; this._toast("BOING!", "#ff3f7a"); this.sound.bounce();
    } else if (ev.landed === "flipper") {
      // Forward BLAST on top of the big vertical. Inject straight into the live speed
      // (uncapped by accelMax) so you genuinely fly FORWARD, not just up like a
      // trampoline — then it eases back. The accel bonus + hold sustain it briefly.
      this._speed = Math.min(CONFIG.plates.flipper.maxSpeed, this._speed + CONFIG.plates.flipper.forward); // fling FASTER than the normal ceiling — that's the power
      this._accelBonus = Math.min(CONFIG.plates.accel.max, this._accelBonus + CONFIG.plates.flipper.forward);
      this._accelHold = CONFIG.plates.accel.hold;
      this.particles.burst(p, 0xff7a1c, 28); this._shake = 0.5; this._toast("LAUNCH!", "#ff7a1c"); this.sound.bounce();
    } else if (ev.landed === "boost") {
      this.particles.burst(p, 0x2bff6a, 16); this.sound.boost(); // acceleration plate — speed builds while you ride it
    } else if (ev.landed === "flubber") {
      this.particles.burst(p, 0x6aff6a, 8); this.sound.bounce(); // auto-bounce, every landing
    } else if (ev.landed === "rune") {
      // Rune plate: fire its carried powerup/down the FIRST time you land. The board
      // we just landed on is the one we're now riding (player._ridePlat). _runeSpent
      // is a one-shot guard so riding/re-landing the same plate never re-triggers it.
      const plat = this.player._ridePlat;
      if (plat && plat.runePayload && !plat._runeSpent) {
        plat._runeSpent = true;
        const r = plat.runePayload;
        this._applyPowerup({ type: r.type, good: r.good, pos: ev.pos.clone() });
      } else {
        this.particles.burst(p, 0xbfc6d8, 7); this.sound.land();
      }
    } else {
      this.particles.burst(p, 0xbfc6d8, 7); this.sound.land();
    }
  }

  _onHit(hit) {
    if (this._effects.shield) {
      // Shield absorbs the hit, smashes the obstacle, and grants a mercy window —
      // but a survived mistake breaks your combo.
      this._effects.shield = false;
      this._invuln = CONFIG.effects.invulnTime;
      this.multiplier = 1; this._comboTimer = 0;
      this.field.removeObstacle(hit.platform, hit.obstacle);
      this.particles.burst(this.player.position, 0x35e0ff, 26);
      this._shake = 0.4; this._freeze = 0.07;
      this._toast("BLOCKED! combo lost", "#35e0ff");
      this.sound.clang();
    } else {
      this.particles.burst(this.player.position, 0xff3b3b, 30);
      this._die("hit");
    }
  }

  // A clean graze past a hazard: bonus, multiplier bump, juice.
  _onNearMiss() {
    this.multiplier = Math.min(CONFIG.scoring.multiplierMax, this.multiplier + 1);
    this._comboTimer = 0;
    this.score += CONFIG.scoring.nearMissBonus * this.multiplier;
    this._freeze = 0.05;
    if (!this._reducedMotion) this._shake = Math.max(this._shake, 0.2);
    this._toast(`CLOSE! ×${this.multiplier}`, "#ffd34e");
    this.sound.nearMiss();
    this.sound.combo(this.multiplier);
  }

  // Cross into a new biome: retint fog + sun AND drive the whole backdrop mood
  // (skyline window-glow, moon, nebula) to the zone's palette. Everything eases, so
  // a boundary is a smooth ~2s mood shift — plus a brief bloom flash to mark it.
  _updateBiome(z, dt = 0) {
    const i = biomeAt(z);
    if (i !== this._biome) {
      this._biome = i;
      this._biomeEntry(BIOMES[i]);
    }
    const b = BIOMES[i];
    // Stronger lerp than before so the fog/sun shift is actually FELT (a ~2s mood
    // change, matched to the backdrop ease) rather than a barely-there drift.
    this.scene.fog.color.lerp(new THREE.Color(b.fog), 0.04);
    this.sun.color.lerp(new THREE.Color(b.sun), 0.04);
    // Ease the biome's signature bloom level; decay the entry flash + FOV kick.
    this._biomeBloom += ((b.bloom || 0) - this._biomeBloom) * (dt > 0 ? 1 - Math.exp(-dt / 0.9) : 0);
    if (this._biomeFlash > 0) this._biomeFlash = Math.max(0, this._biomeFlash - dt * 1.8); // snappier punch than before
    if (this._fovKick !== 0) { // ease the kick back to 0 from EITHER side (some zones narrow, most widen)
      const dec = dt * 18;
      this._fovKick = this._fovKick > 0 ? Math.max(0, this._fovKick - dec) : Math.min(0, this._fovKick + dec);
    }
  }

  // The gateway "moment" when you cross into a new zone. Four beats fire together so
  // a boundary FEELS like arriving somewhere new, not a quiet tint drift:
  //   1) a big cinematic title card (zone name + mood tagline, in the zone's colour),
  //   2) a full-screen colour shockwave in that colour,
  //   3) a bloom + camera FOV punch on the 3D scene,
  //   4) a musical "portal" sting that arrives on the zone's chord.
  // Everything here is presentation — no gameplay/physics changes.
  _biomeEntry(b) {
    this.background.setBiome(b); // backdrop tints ease toward this zone (the slow ~2s mood shift)
    const css = hexCss(b.accent ?? b.skyline ?? 0x9fe0ff);

    // 1) Cinematic title card. Restart the animation by toggling the class off/on
    //    (the void-offsetWidth reflow forces the browser to replay it).
    const card = this._hud.biomeCard;
    if (card) {
      this._hud.biomeCardName.textContent = b.name;
      this._hud.biomeCardTag.textContent = b.tagline || "";
      card.style.setProperty("--c", css);
      card.classList.remove("is-show");
      void card.offsetWidth;
      card.classList.add("is-show");
    }

    // 2) Full-screen colour shockwave (same restart-the-animation trick).
    if (!this._biomeFlashEl) this._biomeFlashEl = document.getElementById("biome-flash");
    const flash = this._biomeFlashEl;
    if (flash) {
      flash.style.setProperty("--c", css);
      flash.classList.remove("is-cross");
      void flash.offsetWidth;
      flash.classList.add("is-cross");
    }

    // 3) Scene punch: a strong-but-brief bloom flare + a quick FOV widen that eases
    //    back. Reduced-motion players keep a gentler flare and skip the camera move.
    this._biomeFlash = this._reducedMotion ? 0.35 : 0.8;
    if (!this._reducedMotion) this._fovKick = b.fovKick ?? 7; // per-zone camera gesture (Void narrows; default widens)

    // 4) The audio half — an airy whoosh (no chime; it clashed with the music).
    this.sound.portal();
  }

  _applyPowerup(u) {
    const def = POWERUP_DEFS[u.type];
    // Different effects stack (run at once). Re-grabbing the SAME timed one ADDS its
    // full duration onto whatever's left, so a second blackout extends the blackout
    // rather than resetting it to the max. (Shield is a boolean; splat is instant.)
    if (u.type === "shield") this._effects.shield = true;
    else if (u.type === "splat") { this._splat(); this._effects.splat = (this._effects.splat || 0) + this._dur("splat"); this._splatActive = true; }
    else this._effects[u.type] = (this._effects[u.type] || 0) + this._dur(u.type);

    this.particles.burst(u.pos, u.good ? 0x66f0ff : 0xff7a1c, 20);
    this._toast(def.label, hexCss(def.color), u.type); // label + color come from POWERUP_DEFS
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
      setTimeout(() => b.remove(), 10000); // matches the splat effect duration (the HUD timer); the effect-expiry clear is the backstop
    }
  }

  _clearSplats() {
    const layer = document.getElementById("splats");
    if (layer) layer.innerHTML = "";
  }

  // Esc PAUSES (and resumes) — freezes the run with the option to keep going, rather
  // than assuming you quit. The actual quit-to-title is the "End Run" button in ⚙️.
  _togglePause() {
    if (this.state === "playing") {
      this.state = "paused"; // the loop stops ticking gameplay while paused
      // Sync the start-press counter NOW. During play we never advance _seenStart, so
      // every jump you made this run has left input.startPresses ahead of it. Without
      // this, the paused branch in _loop sees that stale delta on the very next frame
      // and instantly "resumes" — which is why a pause press looked like it did nothing.
      this._seenStart = this.input.startPresses;
      this._hud.subtitle.textContent = "⏸ Paused";
      this._hud.hint.textContent = this._isTouch ? "Tap JUMP to resume" : "Esc or JUMP to resume";
      if (this._hud.restart) this._hud.restart.classList.remove("is-hidden"); // offer Restart right here
      this._showHomeControls(false); // can't change difficulty mid-run, even paused
      this._hud.overlay.classList.remove("is-hidden");
    } else if (this.state === "paused") {
      this._resume();
    }
  }

  _resume() {
    this.state = "playing";
    if (this._hud.restart) this._hud.restart.classList.add("is-hidden");
    this._hud.overlay.classList.add("is-hidden");
    this._seenStart = this.input.startPresses;       // don't treat the resume press as a restart
    this.player._seenPresses = this.input.jumpPresses; // and don't auto-jump on resume
  }

  // Restart: bail out of the current run and go properly back to the title — the
  // world is reset RIGHT NOW (fresh field, ball at the start, camera snapped) so
  // it's a real return to the start screen, not a frozen run that only clears when
  // you press jump. Reachable from the pause screen and the ⚙️ panel; also the way
  // out of zen (where you can't die).
  _restartToTitle() {
    if (this.state !== "playing" && this.state !== "paused" && this.state !== "dying") return;
    this._resetWorld();        // fully reset NOW
    this.state = "start";
    this._restartLock = 0.3;   // no accidental instant re-launch
    this.canvas.classList.remove("is-tripping", "is-tripping--gentle");
    this._seenStart = this.input.startPresses; // don't let the click/press fall through into a start
    if (this._hud.restart) this._hud.restart.classList.add("is-hidden"); // hide the pause-screen button
    this._hud.subtitle.textContent = ""; // no tagline
    this._hud.hint.textContent = this._isTouch ? "Tap JUMP to roll" : "Press JUMP to roll";
    this._showHomeControls(true);  // back on the title — difficulty/modes pickable again
    this._syncHomeControls();
    this._hud.overlay.classList.remove("is-hidden");
    this._refreshHud();
  }

  _die(cause = "hit") {
    if (this.state === "dead" || this.state === "dying") return;
    // Log WHY the run ended — the fall case prints the numbers behind the call so a
    // "but I was right on a plank!" death can be diagnosed from the console.
    if (cause === "fell") {
      const floor = this.field.lowestTopNear(this.player.position.z);
      console.log(
        `[G-Roller] DEATH — fell off. ball.y=${this.player.position.y.toFixed(1)}, ` +
        `lowest landable surface near=${floor === -Infinity ? "NONE" : floor.toFixed(1)}, ` +
        `fallMargin=${CONFIG.world.fallMargin} (died once ball.y < surface-margin), ` +
        `grounded=${this.player.grounded}, z=${this.player.position.z.toFixed(1)}, speed=${this._speed.toFixed(1)}`
      );
    } else {
      console.log(`[G-Roller] DEATH — ${cause} at z=${this.player.position.z.toFixed(1)}`);
    }
    this.canvas.classList.remove("is-tripping", "is-tripping--gentle");
    this.sound.die();

    // A FALL gets the cinematic: freeze the camera, let the ball plummet through the
    // floor and vanish, THEN the game-over card. Obstacle hits (and reduced-motion)
    // go straight to game over.
    if (cause === "fell") {
      // (The fall-watch cinematic applies no camera shake — _followCamera is frozen —
      // so it's safe under reduced motion; we keep it rather than hard-cutting to the card.)
      this.state = "dying";
      this._dyingT = 0;
      this._splashT = null; // set at "splashdown" (the ball vanishing) — the card shows shortly after
      this._cameraFrozen = true;
      this._shake = 0.3;
      // Keep its velocity so it KEEPS SPINNING as it falls — but the dying loop only
      // applies the vertical part to position, so forward/sideways progress is locked.
      this._seenStart = this.input.startPresses;    // a pre-death jump press shouldn't skip the cinematic
      // Seed the eased death-gaze from the camera's CURRENT view direction so the
      // tilt-down to the falling ball starts exactly where we were looking (no snap).
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this._deathLook.copy(this.camera.position).addScaledVector(dir, 25);
      return;
    }
    this._shake = 0.6;
    this.particles.burst(this.player.position, cause === "fell" ? 0xffd34e : 0xff3b3b, 40);
    this._finishDeath();
  }

  // The actual game-over: tally the score, save bests, show the card. Reached
  // immediately for obstacle deaths, or after the fall-death plummet finishes.
  _finishDeath() {
    this.state = "dead";
    this._restartLock = 0.5; // 500 ms where no input restarts (no accidental instant replay)

    const dist = Math.max(0, Math.floor(this.player.position.z));
    const score = Math.floor(this.score);
    const jumps = Math.max(0, this.player.jumpCount);
    const air = Math.floor(this._airborne);
    // Records are PER-DIFFICULTY (zen runs don't score, so they don't set records).
    let isBest = false;
    if (!this._zen) {
      if (score > this.bestScore) { this.bestScore = score; isBest = true; }
      if (dist > this.bestDistance) this.bestDistance = dist;
      if (jumps > this.bestJumps) this.bestJumps = jumps;
      if (air > this.bestAirborne) this.bestAirborne = air;
      this._saveRecords();
    }
    const tierName = CONFIG.gen.tiers[this._diffLevel].name;
    const best = isBest ? " · 🏆 NEW BEST!" : "";
    this._hud.subtitle.innerHTML = `<b>${tierName}</b> · Score <b>${score.toLocaleString()}</b>${best}<br>${dist} m · ${jumps} jumps · ${this.gems} 💎 · ${air} m ✈`;
    this._hud.hint.textContent = this._isTouch ? "Tap JUMP to roll again" : "Press JUMP to roll again";
    this._showHomeControls(true);  // change difficulty / ball before the next run
    this._hud.overlay.classList.remove("is-hidden");
    this._syncHomeControls();
    this._refreshHud();
  }

  _toast(text, color = "#2bd6ff", iconKey = null) {
    const t = this._hud.toast;
    // Powerup toasts lead with their vector icon; plain toasts (BOING/BOOST) stay text.
    if (iconKey) t.innerHTML = `${iconImg(iconKey, color, 30)} ${text}`;
    else t.textContent = text;
    t.style.color = color;
    t.style.textShadow = `0 0 24px ${color}aa`;
    t.classList.remove("toast--show");
    void t.offsetWidth;
    t.classList.add("toast--show");
  }

  _renderEffects() {
    const e = this._effects;
    const rows = [];
    if (e.shield) rows.push(["shield", "Shield", hexCss(POWERUP_DEFS.shield.color), 1]); // no timer — lasts till hit
    // Every active timed effect, colour straight from POWERUP_DEFS (single source of truth).
    for (const key of EFFECT_DURATIONS_KEYS) {
      if (e[key] > 0) rows.push([key, `${Math.ceil(e[key])}s`, hexCss(POWERUP_DEFS[key].color), e[key] / this._dur(key)]);
    }
    this._hud.effects.innerHTML = rows
      .map(([key, label, color, frac]) => {
        const w = Math.max(0, Math.min(1, frac)) * 100;
        return `<span class="chip" style="--c:${color}"><span class="chip__top">${iconImg(key, color, 18)} <b>${label}</b></span><span class="chip__bar"><span class="chip__fill" style="width:${w}%"></span></span></span>`;
      })
      .join("");
  }

  _refreshHud() {
    this._hud.score.textContent = Math.floor(this.score).toLocaleString();
    // Show the EFFECTIVE multiplier (combo + powerdown risk bonus). Mark it when a
    // powerdown is juicing it, so the risk/reward is visible.
    const danger = this._dangerBonus();
    this._hud.mult.textContent = danger > 0 ? `×${this.multiplier + danger}🔥` : `×${this.multiplier}`;
    this._hud.distance.textContent = Math.max(0, Math.floor(this.player.position.z));
    this._hud.speed.textContent = Math.round(this._speed); // smoothed actual speed — spikes when you ride an accel plate
    if (this._hud.airborne) this._hud.airborne.textContent = Math.floor(this._airborne);
    this._hud.jumps.textContent = Math.max(0, this.player.jumpCount);
    this._hud.gems.textContent = this.gems;
    this._hud.bestScore.textContent = this.bestScore.toLocaleString();
    this._hud.bestDistance.textContent = this.bestDistance;
    this._hud.bestJumps.textContent = this.bestJumps;
    if (this._hud.bestAirborne) this._hud.bestAirborne.textContent = this.bestAirborne;
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
    const speedFov = Math.min(14, Math.max(0, this._speed - CONFIG.player.forwardSpeed) * 0.4);
    // Audiosurf: a quick FOV widen on each beat (rides the same decaying pulse as the
    // bloom kick) so the camera "breathes" with the music alongside the glow flash.
    const beatFov = this._audiosurf ? this._beatPulse * CONFIG.audiosurf.fovKick : 0;
    const targetFov = this._baseFov + speedFov + this._throttleSmooth * 6 + beatFov + this._fovKick;
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
