// All audio is synthesized live with the Web Audio API — no sound files to load.
// A looping 80s/90s synthwave bed (gritty distorted bass + four-on-the-floor
// drums + arpeggio) and a set of short arcade SFX. Because browsers block audio
// until a user gesture, start() must be called from a key/tap (the game's start
// press handles that).

// A-minor synthwave progression: Am - F - C - G. Each entry is one bar.
const PROG = [
  { bass: 110.0, arp: [220.0, 261.63, 329.63, 261.63] }, // Am
  { bass: 87.31, arp: [174.61, 220.0, 261.63, 220.0] },  // F
  { bass: 130.81, arp: [261.63, 329.63, 392.0, 329.63] },// C
  { bass: 98.0, arp: [196.0, 246.94, 293.66, 246.94] },  // G
];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._musicOn = false;
    this._stepCount = 0;
    this._nextStepTime = 0;
    this._timer = null;
    this._tempo = 128;
  }

  // Lazily create the audio graph. Safe to call repeatedly; only builds once.
  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      // master -> compressor (glue / clip protection) -> speakers
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -10;
      this.comp.ratio.value = 6;
      this.comp.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.comp);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.master);

      this._distortion = this._makeDistortionCurve(28);
      this._noise = this._makeNoiseBuffer();
      this._sec16 = 60 / this._tempo / 4; // length of a sixteenth note
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    this._startMusic();
  }

  toggleMute() {
    if (!this.ctx) return this.muted; // not started yet
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  // --- Music sequencer ------------------------------------------------------

  _startMusic() {
    if (this._musicOn) return;
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
    const bar = Math.floor(step / 16) % PROG.length;
    const s = step % 16;
    const chord = PROG[bar];

    if (s % 2 === 0) this._bass(t, chord.bass);          // driving 8th-note bass
    this._arp(t, chord.arp[s % chord.arp.length]);        // 16th arpeggio
    if (s % 4 === 0) this._kick(t);                       // four on the floor
    if (s === 4 || s === 12) this._snare(t);              // backbeat
    if (s % 2 === 1) this._hat(t);                        // offbeat hats
  }

  // --- Music voices ---------------------------------------------------------

  _bass(t, freq) {
    const dur = this._sec16 * 1.7;
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._distortion;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 700; lp.Q.value = 6;
    const g = this.ctx.createGain();
    this._env(g, t, 0.5, 0.005, dur);
    shaper.connect(lp); lp.connect(g); g.connect(this.musicGain);
    // two slightly detuned saws for a thick, gritty low end
    for (const det of [-6, 6]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = freq; o.detune.value = det;
      o.connect(shaper); o.start(t); o.stop(t + dur + 0.02);
    }
  }

  _arp(t, freq) {
    const dur = this._sec16 * 0.9;
    const o = this.ctx.createOscillator();
    o.type = "square"; o.frequency.value = freq;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 400;
    const g = this.ctx.createGain();
    this._env(g, t, 0.12, 0.004, dur);
    o.connect(hp); hp.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(135, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.2);
  }

  _snare(t) {
    const n = this.ctx.createBufferSource(); n.buffer = this._noise;
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(bp); bp.connect(g); g.connect(this.musicGain);
    n.start(t); n.stop(t + 0.2);
  }

  _hat(t) {
    const n = this.ctx.createBufferSource(); n.buffer = this._noise;
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(hp); hp.connect(g); g.connect(this.musicGain);
    n.start(t); n.stop(t + 0.06);
  }

  // --- SFX ------------------------------------------------------------------

  // A pitch-sweeping blip, the workhorse for most arcade effects.
  _blip(f0, f1, dur, type, peak, target = this.sfxGain) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(target);
    o.start(t); o.stop(t + dur + 0.02);
  }

  jump() { this._blip(260, 680, 0.13, "square", 0.22); }

  // Soft, low landing thud — kept quiet so it sits in the background.
  land() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    g.gain.setValueAtTime(0.14, t); // soft
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.15);
  }

  gem() { this._blip(880, 1320, 0.1, "square", 0.16); }
  bounce() { this._blip(200, 900, 0.22, "sine", 0.28); }
  boost() { this._blip(300, 1200, 0.3, "sawtooth", 0.22); }
  clang() { this._blip(1200, 300, 0.18, "square", 0.2); }

  // Good powerup = bright ascending arpeggio; bad = gritty descending one.
  power(good) {
    const seq = good ? [523, 659, 784, 1047] : [392, 311, 247, 185];
    seq.forEach((f, i) =>
      setTimeout(() => this._blip(f, f, 0.12, good ? "square" : "sawtooth", 0.18), i * 70)
    );
  }

  die() {
    this._blip(440, 60, 0.7, "sawtooth", 0.3);
    if (this.ctx && !this.muted) {
      const n = this.ctx.createBufferSource(); n.buffer = this._noise;
      const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 800;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0.3, t);
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
