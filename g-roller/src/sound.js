// All audio is synthesized live with the Web Audio API — no sound files to load.
// A looping retro-synth bed (warm bass + soft pad chords + a filtered arpeggio
// over gentle drums) plus a set of short arcade SFX. Because browsers block audio
// until a user gesture, start() must be called from a key/tap (the game's start
// press handles that).
//
// The vibe target: warm, spacious, 80s/90s DNA but EASY on the ears. Most tracks
// are dreamy/surreal; a couple are more energetic but still smooth. Each track
// carries its own tempo, key, timbres, drum feel, swing, and "space" (delay)
// amount so all five feel clearly different.

// Five soundtracks to cycle through. Each entry is a tempo + per-voice settings +
// a chord progression (one entry per bar). Each bar holds a bass root, a 4-note
// arpeggio, and a pad chord (held under the whole bar for the warm bed).
//
// Per-track knobs (all optional, sensible defaults applied in code):
//   tempo     — BPM
//   bassWave / arpWave / padWave — oscillator timbres
//   gritty    — true to use the soft distortion on the bass (off = clean & warm)
//   bassCut   — lowpass cutoff for the bass (lower = darker, mellower)
//   arpCut    — lowpass cutoff for the lead/arp (lower = softer, less fizzy)
//   detune    — cents of chorus spread on the lead (wider = dreamier)
//   space     — delay-send amount 0..1 (more = more surreal / cavernous)
//   swing     — 0..1, delays offbeat 16ths for a looser, smoother groove
//   drums     — "full" | "soft" | "brush" | "none"
//   arpRate   — 8 plays the arp every 8th note (slow/dreamy), 16 every 16th (busy)
//   gain      — per-track music level trim
const TRACKS = [
  // 1) Dreamy, slow, major-key. Clean sine bass, lots of space, brushed drums.
  {
    name: "Velvet Horizon", tempo: 84,
    bassWave: "sine", arpWave: "triangle", padWave: "triangle",
    gritty: false, bassCut: 320, arpCut: 1600, detune: 9, space: 0.5,
    swing: 0.25, drums: "brush", arpRate: 8, gain: 1.0,
    prog: [
      { bass: 65.41, pad: [130.81, 164.81, 196.0], arp: [261.63, 329.63, 392.0, 329.63] }, // C
      { bass: 87.31, pad: [174.61, 220.0, 261.63], arp: [349.23, 440.0, 523.25, 440.0] },   // F
      { bass: 73.42, pad: [146.83, 174.61, 220.0], arp: [293.66, 349.23, 440.0, 349.23] },  // Dm
      { bass: 98.0, pad: [196.0, 246.94, 293.66], arp: [392.0, 493.88, 587.33, 493.88] },   // G
    ],
  },

  // 2) Late-night cruise. Warm triangle bass, gentle swing, soft drums, minor 7ths.
  {
    name: "Midnight Cruise", tempo: 96,
    bassWave: "triangle", arpWave: "sine", padWave: "triangle",
    gritty: false, bassCut: 380, arpCut: 1900, detune: 7, space: 0.4,
    swing: 0.3, drums: "soft", arpRate: 8, gain: 1.0,
    prog: [
      { bass: 110.0, pad: [220.0, 261.63, 329.63], arp: [220.0, 261.63, 329.63, 392.0] },  // Am7
      { bass: 73.42, pad: [146.83, 174.61, 220.0], arp: [293.66, 349.23, 440.0, 349.23] }, // Dm
      { bass: 98.0, pad: [196.0, 246.94, 293.66], arp: [392.0, 440.0, 493.88, 440.0] },    // G
      { bass: 130.81, pad: [261.63, 329.63, 392.0], arp: [523.25, 392.0, 329.63, 392.0] }, // C
    ],
  },

  // 3) Surreal ambient drift. No drums, very wide detune, max space, floating arp.
  {
    name: "Lucid Drift", tempo: 80,
    bassWave: "sine", arpWave: "sine", padWave: "sine",
    gritty: false, bassCut: 260, arpCut: 1300, detune: 13, space: 0.62,
    swing: 0, drums: "none", arpRate: 8, gain: 1.05,
    prog: [
      { bass: 82.41, pad: [164.81, 196.0, 246.94], arp: [329.63, 392.0, 493.88, 392.0] },  // Em
      { bass: 110.0, pad: [220.0, 277.18, 329.63], arp: [440.0, 554.37, 659.25, 554.37] }, // A
      { bass: 92.50, pad: [185.0, 220.0, 277.18], arp: [369.99, 440.0, 554.37, 440.0] },   // F#m
      { bass: 123.47, pad: [246.94, 293.66, 369.99], arp: [493.88, 587.33, 739.99, 587.33] }, // B
    ],
  },

  // 4) Energetic but smooth. Filtered-saw lead, soft grit on bass, full drums, brighter.
  {
    name: "Neon Highway", tempo: 124,
    bassWave: "sawtooth", arpWave: "sawtooth", padWave: "triangle",
    gritty: true, bassCut: 520, arpCut: 2400, detune: 8, space: 0.28,
    swing: 0.12, drums: "full", arpRate: 16, gain: 0.95,
    prog: [
      { bass: 110.0, pad: [220.0, 261.63, 329.63], arp: [220.0, 261.63, 329.63, 440.0] }, // Am
      { bass: 87.31, pad: [174.61, 220.0, 261.63], arp: [174.61, 220.0, 261.63, 349.23] },// F
      { bass: 98.0, pad: [196.0, 246.94, 293.66], arp: [196.0, 246.94, 293.66, 392.0] },  // G
      { bass: 130.81, pad: [261.63, 329.63, 392.0], arp: [261.63, 329.63, 392.0, 329.63] },// C
    ],
  },

  // 5) The one hyper track. Driving but warmed-up: softer drums, capped lead brightness.
  {
    name: "Pulse Runner", tempo: 134,
    bassWave: "sawtooth", arpWave: "triangle", padWave: "sawtooth",
    gritty: true, bassCut: 560, arpCut: 2600, detune: 10, space: 0.22,
    swing: 0.08, drums: "full", arpRate: 16, gain: 0.92,
    prog: [
      { bass: 82.41, pad: [164.81, 196.0, 246.94], arp: [329.63, 392.0, 493.88, 392.0] }, // Em
      { bass: 130.81, pad: [261.63, 329.63, 392.0], arp: [523.25, 392.0, 329.63, 392.0] },// C
      { bass: 98.0, pad: [196.0, 246.94, 293.66], arp: [392.0, 493.88, 587.33, 493.88] }, // G
      { bass: 73.42, pad: [146.83, 220.0, 293.66], arp: [293.66, 440.0, 587.33, 440.0] }, // D
    ],
  },
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.reactive = true; // music reacts to active effects (toggleable)
    this._staticDet = 0;
    this._musicOn = false;
    this._stepCount = 0;
    this._nextStepTime = 0;
    this._timer = null;
    this._trackIndex = 0;
    this.onBeat = null; // optional per-beat callback (set by Audiosurf mode; null = no cost)
  }

  // Lazily create the audio graph. Safe to call repeatedly; only builds once.
  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      // master -> compressor (gentle glue / clip protection) -> speakers
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; // catch peaks a touch earlier for a softer top end
      this.comp.ratio.value = 4;       // gentler ratio = less squashed, more musical
      this.comp.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8; // honor a muted pref restored before audio started (0.9 was hot)
      this.master.connect(this.comp);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.26; // music sits softer in the mix now
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);

      // Atmosphere bus: a feedback delay that voices can send into for a wide,
      // surreal "space" without needing an impulse-response reverb file. A high
      // shelf rolls off the repeats so the tail stays warm, not fizzy.
      this.spaceIn = this.ctx.createGain();
      this.spaceIn.gain.value = 1;
      const delayA = this.ctx.createDelay(1.0); delayA.delayTime.value = 0.27;
      const delayB = this.ctx.createDelay(1.0); delayB.delayTime.value = 0.41; // second tap = lusher tail
      const fb = this.ctx.createGain(); fb.gain.value = 0.26; // feedback (kept well under 1 so it can't build up)
      const tone = this.ctx.createBiquadFilter();
      tone.type = "lowpass"; tone.frequency.value = 2600; // darken the echoes
      const spaceOut = this.ctx.createGain(); spaceOut.gain.value = 0.7;
      this.spaceIn.connect(delayA); this.spaceIn.connect(delayB);
      delayA.connect(tone); delayB.connect(tone);
      // Feed back through ONLY delayA — feeding both taps roughly doubled the loop
      // gain, so it accumulated all the note/SFX sends and rang louder and louder.
      tone.connect(fb); fb.connect(delayA);
      tone.connect(spaceOut); spaceOut.connect(this.musicGain);
      this._spaceTone = tone;

      this._distortion = this._makeDistortionCurve(12); // softened from 28
      this._noise = this._makeNoiseBuffer();

      // Reactive-music LFO: a slow sine whose gain (warble depth in cents) is
      // driven by active gameplay effects (e.g. trip => pitch warbles in waves).
      // Its output is patched into every note's detune param as it's created.
      this._lfo = this.ctx.createOscillator();
      this._lfo.type = "sine";
      this._lfo.frequency.value = 3; // ~3 Hz waves
      this._lfoGain = this.ctx.createGain();
      this._lfoGain.gain.value = 0;
      this._lfo.connect(this._lfoGain);
      this._lfo.start();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    this._startMusic();
  }

  // --- Reactive music (effect layering, toggleable) -------------------------

  // Called each frame with the live effects state. Maps effects to a warble
  // depth (LFO) + a static pitch offset so the music morphs WITH the gameplay
  // instead of switching tracks. trip = big psychedelic waves; morph = wobble;
  // slow = pitched down; surge = pitched up.
  setEffects(e) {
    if (!this.ctx) return;
    const on = this.reactive && !this.muted;
    const warble = on ? (e.trip > 0 ? 200 : 0) + (e.morph > 0 ? 90 : 0) : 0;
    this._lfoGain.gain.setTargetAtTime(warble, this.ctx.currentTime, 0.12);
    this._staticDet = on ? (e.slow > 0 ? -120 : 0) + (e.surge > 0 ? 90 : 0) : 0;
  }

  toggleReactive() {
    this.reactive = !this.reactive;
    if (this.ctx && !this.reactive) {
      this._lfoGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this._staticDet = 0;
    }
    return this.reactive;
  }

  // Patch the reactive LFO into a note oscillator's detune, plus the static offset.
  _react(o) {
    o.detune.value += this._staticDet || 0;
    if (this._lfoGain) this._lfoGain.connect(o.detune);
  }

  // Switch to the next soundtrack. Works even before audio has started (it just
  // sets which track will play). Returns the new track's name.
  nextTrack() {
    this._trackIndex = (this._trackIndex + 1) % TRACKS.length;
    if (this.ctx && this._musicOn) this._startMusic(); // restart sequencer on the new track
    return TRACKS[this._trackIndex].name;
  }

  trackName() {
    return TRACKS[this._trackIndex].name;
  }

  // Jump straight to a track by index (used to restore a saved choice). Wraps so
  // an out-of-range saved value can never crash. Swaps live if music is playing.
  setTrack(i) {
    this._trackIndex = ((Math.trunc(i) % TRACKS.length) + TRACKS.length) % TRACKS.length;
    if (this.ctx && this._musicOn) this._startMusic();
    return TRACKS[this._trackIndex].name;
  }

  trackIndex() {
    return this._trackIndex;
  }

  toggleMute() {
    if (!this.ctx) return this.muted; // not started yet
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  // --- Music sequencer ------------------------------------------------------

  _startMusic() {
    clearInterval(this._timer); // restart cleanly (used on first start and track switch)
    const track = TRACKS[this._trackIndex];
    this._sec16 = 60 / track.tempo / 4; // sixteenth-note length at this track's tempo
    this._stepCount = 0;
    this._musicOn = true;
    this._nextStepTime = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._scheduler(), 25);
  }

  _scheduler() {
    while (this._nextStepTime < this.ctx.currentTime + 0.12) {
      this._scheduleStep(this._stepCount, this._nextStepTime);
      this._nextStepTime += this._sec16;
      this._stepCount++;
    }
  }

  _scheduleStep(step, t) {
    const track = TRACKS[this._trackIndex];
    const prog = track.prog;
    const bar = Math.floor(step / 16) % prog.length;
    const s = step % 16;
    const chord = prog[bar];

    // Beat hook: fire on every kick (quarter note, s % 4 === 0) so the game can
    // sync visuals to the audible beat. `time` is the AudioContext time the kick
    // will SOUND — the game converts that to a lead delay so a pulse lands ON the
    // beat, not early. Only set when a beat-reactive mode (Audiosurf) is on, so
    // normal play pays no cost.
    if (s % 4 === 0 && this.onBeat) this.onBeat({ time: t, sec16: this._sec16 });

    // Swing: push odd (offbeat) 16ths a little later for a looser, smoother feel.
    const swing = track.swing || 0;
    const swung = s % 2 === 1 ? t + this._sec16 * swing * 0.5 : t;

    // Pad chord: lay the whole chord down once at the top of each bar so a warm
    // bed hums under everything. This is the biggest "vibey" win.
    if (s === 0) this._pad(t, chord.pad, track);

    if (s % 2 === 0) this._bass(t, chord.bass, track); // 8th-note bass pulse

    // Arp: dreamy tracks pluck every 8th note (arpRate 8); busier ones every 16th.
    const arpEvery = track.arpRate === 16 ? 1 : 2;
    if (s % arpEvery === 0) this._arp(swung, chord.arp[(s % 16) % chord.arp.length], track);

    this._drums(s, swung, track);
  }

  // --- Music voices ---------------------------------------------------------

  // Soft sustained chord pad — the warm bed under each bar. Detuned pairs per
  // note give a slow chorus shimmer; a low-passed sine/triangle keeps it gentle.
  _pad(t, freqs, track) {
    const barLen = this._sec16 * 16;
    const dur = barLen * 0.98;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.4; // very soft top
    const g = this.ctx.createGain();
    // long, smooth swell in and out so chords blur into each other
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + barLen * 0.25);
    g.gain.setValueAtTime(0.05, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(this.musicGain);
    if (this.spaceIn) g.connect(this.spaceIn); // pads carry the space
    const det = (track.detune || 6) * 0.6;
    for (const f of freqs) {
      for (const d of [-det, det]) {
        const o = this.ctx.createOscillator();
        o.type = track.padWave || "triangle"; o.frequency.value = f; o.detune.value = d;
        this._react(o);
        o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  _bass(t, freq, track) {
    const dur = this._sec16 * 1.7;
    const g = this.ctx.createGain();
    this._env(g, t, 0.42 * (track.gain || 1), 0.008, dur); // slightly softer + slower attack
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = track.bassCut || 420; lp.Q.value = 2; // darker, calmer Q

    // Optional soft grit: only the energetic tracks shape the bass. Mellow tracks
    // stay clean and round.
    let head = lp;
    if (track.gritty) {
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this._distortion;
      shaper.connect(lp);
      head = shaper;
    }
    lp.connect(g); g.connect(this.musicGain);

    // two slightly detuned oscillators for a thick but smooth low end
    for (const det of [-5, 5]) {
      const o = this.ctx.createOscillator();
      o.type = track.bassWave || "triangle"; o.frequency.value = freq; o.detune.value = det;
      this._react(o);
      o.connect(head); o.start(t); o.stop(t + dur + 0.02);
    }
  }

  // The lead/arp pluck. A couple of detuned voices + a slow lowpass make it
  // shimmery instead of fizzy; a chunk of it is sent to the space bus.
  _arp(t, freq, track) {
    const dur = this._sec16 * (track.arpRate === 16 ? 1.0 : 1.8); // longer notes on dreamy tracks
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = track.arpCut || 1800; lp.Q.value = 1;
    const g = this.ctx.createGain();
    this._env(g, t, 0.1 * (track.gain || 1), 0.006, dur); // gentle attack, no click
    lp.connect(g); g.connect(this.musicGain);

    // send to the atmosphere bus for surreal echoes
    if (this.spaceIn && track.space) {
      const send = this.ctx.createGain();
      send.gain.value = track.space * 0.5;
      g.connect(send); send.connect(this.spaceIn);
    }

    const det = track.detune || 7;
    for (const d of [-det, det]) {
      const o = this.ctx.createOscillator();
      o.type = track.arpWave || "triangle"; o.frequency.value = freq; o.detune.value = d;
      this._react(o);
      o.connect(lp); o.start(t); o.stop(t + dur + 0.03);
    }
  }

  // --- Drums (per-track feel) -----------------------------------------------

  // Drum router: each track picks a feel. "none" = pure ambient, "brush"/"soft"
  // = quiet & dark for mellow tracks, "full" = present for the energetic ones.
  _drums(s, t, track) {
    const kind = track.drums || "soft";
    if (kind === "none") return;

    if (kind === "brush") {
      // Soft brushed groove: rounded kick, brushed backbeat, no hats.
      if (s % 4 === 0) this._kick(t, 0.55);
      if (s === 4 || s === 12) this._brush(t);
      return;
    }
    if (kind === "soft") {
      if (s % 4 === 0) this._kick(t, 0.65);
      if (s === 4 || s === 12) this._snare(t, 0.22);
      if (s % 4 === 2) this._hat(t, 0.07); // sparser, quieter hats
      return;
    }
    // "full" — energetic but still tamed vs. the old harsh version
    if (s % 4 === 0) this._kick(t, 0.8);
    if (s === 4 || s === 12) this._snare(t, 0.3);
    if (s % 2 === 1) this._hat(t, 0.1);
  }

  _kick(t, peak = 0.8) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.22);
  }

  // Snare = a darkened noise burst. Lower center freq + lower gain than before so
  // it's a soft tick rather than a harsh crack.
  _snare(t, peak = 0.3) {
    const n = this.ctx.createBufferSource(); n.buffer = this._noise;
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 0.6;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500; // shave the fizz
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.musicGain);
    n.start(t); n.stop(t + 0.18);
  }

  // Brush hit: a very soft, low, short noise swish for the mellow groove.
  _brush(t) {
    const n = this.ctx.createBufferSource(); n.buffer = this._noise;
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.4;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.musicGain);
    n.start(t); n.stop(t + 0.14);
  }

  _hat(t, peak = 0.1) {
    const n = this.ctx.createBufferSource(); n.buffer = this._noise;
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 8000;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 12000; // tame the very top
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.musicGain);
    n.start(t); n.stop(t + 0.05);
  }

  // --- SFX ------------------------------------------------------------------

  // A pitch-sweeping blip, the workhorse for most arcade effects. Softened: a
  // lowpass rounds off the harsh edge of square/saw waves, and a little space
  // send gives effects a touch of the same dreamy tail as the music.
  _blip(f0, f1, dur, type, peak, target = this.sfxGain) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 4500; lp.Q.value = 0.7; // shave the fizz
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012); // slightly softer attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(target);
    if (this.spaceIn) { // light dreamy tail on effects too
      const send = this.ctx.createGain(); send.gain.value = 0.12;
      g.connect(send); send.connect(this.spaceIn);
    }
    o.start(t); o.stop(t + dur + 0.02);
  }

  jump() { this._blip(260, 680, 0.13, "triangle", 0.2); }

  // Soft, low landing thud — kept quiet so it sits in the background.
  land() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    g.gain.setValueAtTime(0.13, t); // soft
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.15);
  }

  gem() { this._blip(880, 1320, 0.1, "triangle", 0.15); }
  // Near-miss = a quick airy "whoosh"; combo riser pitches up with the multiplier.
  nearMiss() { this._blip(1500, 500, 0.16, "sine", 0.13); }
  combo(level) { const f = 500 + level * 55; this._blip(f, f * 1.5, 0.12, "triangle", 0.15); }
  bounce() { this._blip(200, 900, 0.22, "sine", 0.26); }
  boost() { this._blip(300, 1200, 0.3, "triangle", 0.2); }
  clang() { this._blip(1100, 320, 0.18, "triangle", 0.18); }

  // Good powerup = bright ascending arpeggio; bad = darker descending one. Both
  // use mellower waves now so they chime instead of buzz.
  power(good) {
    const seq = good ? [523, 659, 784, 1047] : [392, 311, 247, 185];
    seq.forEach((f, i) =>
      setTimeout(() => this._blip(f, f, 0.13, good ? "triangle" : "sine", 0.16), i * 70)
    );
  }

  die() {
    this._blip(440, 60, 0.7, "sawtooth", 0.26);
    if (this.ctx && !this.muted) {
      const n = this.ctx.createBufferSource(); n.buffer = this._noise;
      const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0.26, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      n.connect(lp); lp.connect(g); g.connect(this.sfxGain);
      n.start(t); n.stop(t + 0.5);
    }
  }

  // --- helpers --------------------------------------------------------------

  _env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _makeDistortionCurve(amount) {
    const n = 1024, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  _makeNoiseBuffer() {
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}
