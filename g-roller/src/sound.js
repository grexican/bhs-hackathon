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
// a chord VOCABULARY (`prog`, one entry per named chord) + an `arrangement` that
// strings those chords into a multi-section SONG (intro → A → B → break → drop …)
// so the music evolves over dozens of bars before repeating, instead of looping
// 4 bars forever. Each chord holds a bass root, a 4-note arpeggio, and a pad chord
// (held under the whole bar for the warm bed).
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
//   drums     — "full" | "soft" | "brush" | "none"  (the track's MAX drum feel)
//   arpRate   — 8 plays the arp every 8th note (slow/dreamy), 16 every 16th (busy)
//   gain      — per-track music level trim
//   feel      — melodic CONTOUR for the arp so tracks don't all do the same up/down:
//               "run" (canned shape, default), "climb" (steps up the chord),
//               "pendulum" (zig-zags out from the middle), "stab" (mostly the
//               root, jabbed — funky/DnB), "sparse" (only the downbeat note).
//   steady    — true on a beat-locked track (Audiosurf): kills the per-bar volume
//               swell and tames the fill bars so the kick + groove never wobble or
//               slow down. The onBeat grid is unaffected either way.
//
// SONG STRUCTURE — each track has:
//   prog        — { name: chordObj } dictionary of the chords the song draws from.
//   arrangement — ordered list of sections. The whole arrangement plays once, then
//                 repeats. A section is:
//      { name, chords:[...names], layers:{bass,arp,pad,drums}, lift }
//        chords  — chord names, one per bar; the section is chords.length bars long.
//        layers  — which voices play this section (drop drums in a breakdown, etc).
//                  Omitted layer = on. `drums:false` mutes the kit; the onBeat hook
//                  still fires regardless so Audiosurf stays locked to the grid.
//        lift    — small intensity bump 0..1 (slightly louder/brighter — used for
//                  "drop" sections). Defaults to 0.
// Fills, arp runs and dynamic swells are added in code, keyed off the song bar so
// even repeated sections never feel identical bar-to-bar.
const TRACKS = [
  // 1) VELVET HORIZON — bright, dreamy LYDIAN anthem (warm major with a #4 lift).
  //    Slow synth-ballad in C Lydian. Triangle/sine timbres, brushed kit, lots of
  //    space. Arp "climbs" the chord like a sunrise rather than running up/down.
  //    Song: airy pad intro → introB → verse ×2 → pre → big chorus ×2 → quiet
  //    bridge → verse → pre → soaring final choruses → outro. ~80 bars.
  //    What sets it apart: SLOW + MAJOR + brushed + climbing lead. The only major,
  //    the only brushed kit, the brightest pads — feels like daylight.
  {
    name: "Velvet Horizon", tempo: 82,
    bassWave: "sine", arpWave: "triangle", padWave: "triangle",
    gritty: false, bassCut: 300, arpCut: 1500, detune: 9, space: 0.5,
    swing: 0.18, drums: "brush", arpRate: 8, gain: 1.0, feel: "climb",
    // C Lydian: the F# (instead of F) is the signature bright/floating colour.
    prog: {
      C:    { bass: 65.41, pad: [130.81, 164.81, 196.0],  arp: [261.63, 329.63, 392.0, 493.88] },
      G:    { bass: 98.0,  pad: [196.0, 246.94, 293.66],  arp: [392.0, 493.88, 587.33, 739.99] },
      "F#dim": { bass: 92.50, pad: [185.0, 220.0, 277.18], arp: [369.99, 440.0, 554.37, 659.25] }, // the #4 lift
      Dm:   { bass: 73.42, pad: [146.83, 174.61, 220.0],  arp: [293.66, 349.23, 440.0, 523.25] },
      Am:   { bass: 110.0, pad: [220.0, 261.63, 329.63],  arp: [440.0, 523.25, 659.25, 783.99] },
      Em:   { bass: 82.41, pad: [164.81, 196.0, 246.94],  arp: [329.63, 392.0, 493.88, 587.33] },
    },
    arrangement: [
      { name: "intro",  chords: ["C", "Am"],              layers: { bass: false, arp: false, drums: false } },
      { name: "introB", chords: ["G", "C", "Em", "Am"],   layers: { drums: false } },
      { name: "verse",  chords: ["C", "G", "Am", "Em"] },
      { name: "verse",  chords: ["C", "G", "F#dim", "G"] },
      { name: "pre",    chords: ["Dm", "Em", "C", "G"] },
      { name: "chorus", chords: ["C", "G", "Am", "F#dim"], lift: 0.35 },
      { name: "chorus", chords: ["C", "G", "Em", "Am"],    lift: 0.35 },
      { name: "verse",  chords: ["Am", "Em", "C", "G"] },
      { name: "verse",  chords: ["C", "G", "Dm", "G"] },
      { name: "pre",    chords: ["Em", "Dm", "C", "G"] },
      { name: "bridge", chords: ["Dm", "Am", "Em", "G"],   layers: { drums: false } },
      { name: "bridge", chords: ["C", "G", "Dm", "G"],     layers: { drums: false } },
      { name: "chorus", chords: ["C", "G", "Am", "F#dim"], lift: 0.4 },
      { name: "chorus", chords: ["C", "Em", "F#dim", "G"], lift: 0.45 },
      { name: "chorus", chords: ["C", "G", "Am", "Em"],    lift: 0.5 },
      { name: "outro",  chords: ["C", "Am", "G", "C"],     layers: { drums: false } },
    ],
  },

  // 2) MIDNIGHT CRUISE — LO-FI JAZZ. The slowest track with a beat; lazy heavy
  //    swing, soft brush-ish kit, all sine/triangle, jazzy 7th/9th chords moving
  //    in ii–V–I turnarounds (D minor home). Bass walks (every-8th feel) and the
  //    lead is "sparse" — it lays back, plays mostly the downbeat, leaves space.
  //    What sets it apart: 70bpm + huge swing + extended jazz chords + sparse,
  //    behind-the-beat melody. No other track is this slow or this jazzy/swung.
  {
    name: "Midnight Cruise", tempo: 70,
    bassWave: "triangle", arpWave: "sine", padWave: "sine",
    gritty: false, bassCut: 340, arpCut: 1700, detune: 6, space: 0.45,
    swing: 0.55, drums: "soft", arpRate: 8, gain: 1.0, feel: "sparse",
    // Dm home with ii–V–I colour: Em7b5 → A7 → Dm, plus Gm9 / Cmaj9 / Bbmaj7.
    prog: {
      Dm9:   { bass: 73.42,  pad: [174.61, 220.0, 261.63],  arp: [293.66, 349.23, 440.0, 523.25] },
      Gm9:   { bass: 98.0,   pad: [233.08, 293.66, 349.23],  arp: [392.0, 466.16, 587.33, 698.46] },
      A7:    { bass: 110.0,  pad: [220.0, 277.18, 329.63],   arp: [440.0, 554.37, 659.25, 830.61] },
      Cmaj9: { bass: 130.81, pad: [261.63, 329.63, 392.0],   arp: [523.25, 587.33, 659.25, 783.99] },
      Bbmaj7:{ bass: 116.54, pad: [233.08, 293.66, 349.23],  arp: [466.16, 587.33, 698.46, 880.0] },
      "Em7b5": { bass: 82.41, pad: [196.0, 233.08, 293.66],  arp: [329.63, 392.0, 466.16, 587.33] },
    },
    arrangement: [
      { name: "intro", chords: ["Dm9", "Gm9"],               layers: { arp: false, drums: false } },
      { name: "intro", chords: ["Em7b5", "A7"],              layers: { drums: false } },
      { name: "verse", chords: ["Dm9", "Gm9", "Em7b5", "A7"] },
      { name: "verse", chords: ["Dm9", "Bbmaj7", "Em7b5", "A7"] },
      { name: "pre",   chords: ["Gm9", "Cmaj9", "Em7b5", "A7"] },
      { name: "hook",  chords: ["Dm9", "Bbmaj7", "Gm9", "A7"], lift: 0.3 },
      { name: "hook",  chords: ["Cmaj9", "Bbmaj7", "Gm9", "A7"], lift: 0.3 },
      { name: "verse", chords: ["Dm9", "Gm9", "Cmaj9", "Bbmaj7"] },
      { name: "verse", chords: ["Dm9", "Em7b5", "Gm9", "A7"] },
      { name: "bridge",chords: ["Bbmaj7", "Cmaj9", "Gm9", "Dm9"], layers: { drums: false } },
      { name: "bridge",chords: ["Gm9", "A7", "Dm9", "Dm9"],   layers: { drums: false } },
      { name: "hook",  chords: ["Dm9", "Bbmaj7", "Gm9", "A7"], lift: 0.35 },
      { name: "hook",  chords: ["Cmaj9", "Gm9", "Em7b5", "A7"], lift: 0.4 },
      { name: "outro", chords: ["Dm9", "Gm9", "Em7b5", "Dm9"], layers: { drums: false } },
    ],
  },

  // 3) LUCID DRIFT — surreal AMBIENT, no beat at all. The slowest of everything,
  //    widest detune, max space. Sine everywhere, F# minor / Lydian shimmer, the
  //    lead "pendulums" gently out from a center note (never the same up/down).
  //    Long swelling tide: layers fade in, two rises to a fuller middle, ebb back,
  //    rise again, thin all the way out. ~52 bars.
  //    What sets it apart: NO drums, slowest tempo, widest stereo-ish detune and
  //    longest echoes — pure floating wash, unmistakable next to anything else.
  {
    name: "Lucid Drift", tempo: 62,
    bassWave: "sine", arpWave: "sine", padWave: "sine",
    gritty: false, bassCut: 240, arpCut: 1200, detune: 16, space: 0.68,
    swing: 0, drums: "none", arpRate: 8, gain: 1.05, feel: "pendulum",
    // F#m / A Lydian family — wide, open, unresolved.
    prog: {
      "F#m":   { bass: 92.50,  pad: [185.0, 220.0, 277.18],  arp: [369.99, 440.0, 554.37, 440.0] },
      A:       { bass: 110.0,  pad: [220.0, 277.18, 329.63], arp: [440.0, 554.37, 659.25, 554.37] },
      E:       { bass: 82.41,  pad: [164.81, 207.65, 246.94], arp: [329.63, 415.30, 493.88, 415.30] },
      Bsus:    { bass: 61.74,  pad: [185.0, 246.94, 277.18], arp: [369.99, 493.88, 554.37, 493.88] },
      "Dmaj7": { bass: 73.42,  pad: [220.0, 277.18, 329.63], arp: [440.0, 554.37, 659.25, 554.37] },
      "C#m":   { bass: 69.30,  pad: [207.65, 246.94, 311.13], arp: [415.30, 493.88, 622.25, 493.88] },
    },
    arrangement: [
      { name: "wash",  chords: ["F#m", "Dmaj7"],            layers: { bass: false, arp: false } },
      { name: "wash",  chords: ["A", "E"],                  layers: { arp: false } },
      { name: "drift", chords: ["F#m", "A", "Dmaj7", "E"],  layers: { arp: false } },
      { name: "drift", chords: ["F#m", "C#m", "A", "E"] },
      { name: "drift", chords: ["Dmaj7", "A", "Bsus", "E"] },
      { name: "rise",  chords: ["Dmaj7", "A", "E", "Bsus"], lift: 0.3 },
      { name: "rise",  chords: ["F#m", "A", "Dmaj7", "E"],  lift: 0.3 },
      { name: "rise",  chords: ["A", "E", "Dmaj7", "Bsus"], lift: 0.4 },
      { name: "ebb",   chords: ["C#m", "F#m", "A", "E"],    layers: { arp: false } },
      { name: "ebb",   chords: ["Dmaj7", "A", "F#m", "E"],  layers: { arp: false } },
      { name: "rise",  chords: ["F#m", "Dmaj7", "A", "Bsus"], lift: 0.35 },
      { name: "rise",  chords: ["Dmaj7", "A", "E", "Bsus"], lift: 0.4 },
      { name: "ebb",   chords: ["C#m", "F#m", "A", "E"],    layers: { arp: false } },
      { name: "wash",  chords: ["A", "E"],                  layers: { arp: false } },
      { name: "wash",  chords: ["F#m", "Dmaj7"],            layers: { bass: false, arp: false } },
    ],
  },

  // 4) NEON HIGHWAY — DRUM & BASS / breakbeat energy. Fast (150bpm) and dark,
  //    A PHRYGIAN (the flat-2 Bb gives the tense, driving edge). Gritty saw bass,
  //    full kit, "stab"-feel lead that jabs the root for a syncopated, funky pulse
  //    rather than a smooth run. Builds & drops with breakdowns.
  //    What sets it apart: fastest with-drums track, dark Phrygian colour, stabby
  //    syncopated lead — aggressive and rhythmic where Pulse Runner is steady.
  {
    name: "Neon Highway", tempo: 150,
    bassWave: "sawtooth", arpWave: "square", padWave: "sawtooth",
    gritty: true, bassCut: 480, arpCut: 2200, detune: 11, space: 0.3,
    swing: 0.16, drums: "full", arpRate: 16, gain: 0.95, feel: "stab",
    // A Phrygian: A Bb C D E F G — the Bb (b2) is the signature dark tension.
    prog: {
      Am:  { bass: 110.0,  pad: [220.0, 261.63, 329.63],  arp: [220.0, 220.0, 261.63, 329.63] },
      Bb:  { bass: 116.54, pad: [233.08, 293.66, 349.23], arp: [233.08, 233.08, 293.66, 349.23] }, // bII — the Phrygian colour
      Dm:  { bass: 73.42,  pad: [146.83, 174.61, 220.0],  arp: [146.83, 146.83, 220.0, 293.66] },
      Em:  { bass: 82.41,  pad: [164.81, 196.0, 246.94],  arp: [164.81, 164.81, 246.94, 329.63] },
      F:   { bass: 87.31,  pad: [174.61, 220.0, 261.63],  arp: [174.61, 174.61, 261.63, 349.23] },
      Gm:  { bass: 98.0,   pad: [196.0, 233.08, 293.66],  arp: [196.0, 196.0, 293.66, 392.0] },
    },
    arrangement: [
      { name: "intro", chords: ["Am", "Am"],          layers: { arp: false, pad: false } },
      { name: "A",     chords: ["Am", "Bb", "Am", "Em"] },
      { name: "A",     chords: ["Am", "Bb", "Dm", "Em"] },
      { name: "A2",    chords: ["Am", "F", "Gm", "Em"] },
      { name: "build", chords: ["Dm", "Em", "F", "Gm"] },
      { name: "drop",  chords: ["Am", "Bb", "Am", "Em"], lift: 0.5 },
      { name: "drop",  chords: ["Am", "Bb", "F", "Em"],  lift: 0.5 },
      { name: "break", chords: ["Dm", "Am", "Bb", "Em"], layers: { drums: false } },
      { name: "break", chords: ["F", "Gm", "Dm", "Em"],  layers: { drums: false } },
      { name: "A2",    chords: ["Am", "Em", "Bb", "Am"] },
      { name: "build", chords: ["F", "Gm", "Dm", "Em"] },
      { name: "drop",  chords: ["Am", "Bb", "Am", "Em"], lift: 0.55 },
      { name: "drop",  chords: ["Am", "F", "Bb", "Em"],  lift: 0.55 },
      { name: "drop",  chords: ["Am", "Bb", "Am", "Am"], lift: 0.6 },
      { name: "outro", chords: ["Am", "Gm", "F", "Em"] },
    ],
  },

  // 5) PULSE RUNNER — driving OUTRUN SYNTHWAVE. *** AUDIOSURF track (index 4). ***
  //    Rock-steady FOUR-ON-THE-FLOOR at 128bpm — classic outrun tempo. NO swing
  //    (swing:0) and `steady:true` so there is ZERO per-bar volume swell and the
  //    fill bars are tamed: the kick lands dead on every quarter and never wobbles
  //    or slows, because the on-screen pulses ride this beat. E minor, bright saw
  //    lead that "runs" the chord (the one melodic, anthemic synthwave lead).
  //    What sets it apart: the only metronome-steady track, classic 128 outrun
  //    pulse, clean unswung groove — purpose-built for the world to pulse on.
  {
    name: "Pulse Runner", tempo: 128,
    bassWave: "sawtooth", arpWave: "sawtooth", padWave: "sawtooth",
    gritty: true, bassCut: 560, arpCut: 2600, detune: 8, space: 0.2,
    swing: 0, drums: "full", arpRate: 16, gain: 0.92, feel: "run", steady: true,
    prog: {
      Em: { bass: 82.41,  pad: [164.81, 196.0, 246.94], arp: [329.63, 392.0, 493.88, 392.0] },
      C:  { bass: 130.81, pad: [261.63, 329.63, 392.0], arp: [523.25, 392.0, 329.63, 392.0] },
      G:  { bass: 98.0,   pad: [196.0, 246.94, 293.66], arp: [392.0, 493.88, 587.33, 493.88] },
      D:  { bass: 73.42,  pad: [146.83, 220.0, 293.66], arp: [293.66, 440.0, 587.33, 440.0] },
      Am: { bass: 110.0,  pad: [220.0, 261.63, 329.63], arp: [440.0, 523.25, 659.25, 523.25] },
      Bm: { bass: 123.47, pad: [246.94, 293.66, 369.99], arp: [493.88, 587.33, 739.99, 587.33] },
    },
    arrangement: [
      { name: "intro", chords: ["Em", "Em"],          layers: { arp: false, pad: false } },
      { name: "A",     chords: ["Em", "C", "G", "D"] },
      { name: "A",     chords: ["Em", "C", "Am", "D"] },
      { name: "A2",    chords: ["Em", "G", "C", "D"] },
      { name: "build", chords: ["Am", "Bm", "C", "D"] },
      { name: "drop",  chords: ["Em", "C", "G", "D"],  lift: 0.5 },
      { name: "drop",  chords: ["Em", "G", "C", "D"],  lift: 0.5 },
      { name: "break", chords: ["Am", "Bm", "C", "D"], layers: { drums: false } },
      { name: "break", chords: ["C", "G", "Am", "Bm"], layers: { drums: false } },
      { name: "A2",    chords: ["Em", "Bm", "C", "D"] },
      { name: "build", chords: ["C", "D", "Am", "Bm"] },
      { name: "drop",  chords: ["Em", "C", "G", "D"],  lift: 0.55 },
      { name: "drop",  chords: ["Em", "C", "Am", "D"], lift: 0.6 },
      { name: "outro", chords: ["Em", "D", "C", "Bm"] },
    ],
  },
];

// Total bars in a track's arrangement (one full song before it repeats).
function _songBars(track) {
  let n = 0;
  for (const sec of track.arrangement) n += sec.chords.length;
  return n;
}

// Resolve a global song bar to its section + the chord playing that bar, plus how
// far we are into the section (for fills/swells) and which voices are active.
function _locate(track, songBar) {
  const total = _songBars(track);
  let b = ((songBar % total) + total) % total;
  for (const sec of track.arrangement) {
    if (b < sec.chords.length) {
      const layers = sec.layers || {};
      return {
        section: sec,
        chord: track.prog[sec.chords[b]],
        barInSection: b,
        secLen: sec.chords.length,
        lift: sec.lift || 0,
        bass: layers.bass !== false,
        arp: layers.arp !== false,
        pad: layers.pad !== false,
        drums: layers.drums !== false,
      };
    }
    b -= sec.chords.length;
  }
  // Fallback (shouldn't happen): first chord, everything on.
  const first = track.arrangement[0];
  return {
    section: first, chord: track.prog[first.chords[0]], barInSection: 0,
    secLen: first.chords.length, lift: 0, bass: true, arp: true, pad: true, drums: true,
  };
}

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
    const songBar = Math.floor(step / 16); // absolute bar counter (the arranger wraps it)
    const s = step % 16;
    const loc = _locate(track, songBar);   // section + chord + active layers for this bar
    const chord = loc.chord;

    // Beat hook: fire on every kick (quarter note, s % 4 === 0) so the game can
    // sync visuals to the audible beat. `time` is the AudioContext time the kick
    // will SOUND — the game converts that to a lead delay so a pulse lands ON the
    // beat, not early. Only set when a beat-reactive mode (Audiosurf) is on, so
    // normal play pays no cost. Fires on the grid regardless of which layers play,
    // so a drum-dropped breakdown can't knock Audiosurf out of sync.
    if (s % 4 === 0 && this.onBeat) this.onBeat({ time: t, sec16: this._sec16 });

    // Swing: push odd (offbeat) 16ths a little later for a looser, smoother feel.
    const swing = track.swing || 0;
    const swung = s % 2 === 1 ? t + this._sec16 * swing * 0.5 : t;

    // Intensity = base lift of the section + a gentle 4-bar swell so even a held
    // section breathes louder→softer instead of sitting flat. STEADY tracks
    // (Audiosurf) skip the swell entirely so the beat never rises/falls in level.
    const phraseBar = loc.barInSection;
    const swell = track.steady ? 0 : 0.12 * Math.sin((songBar % 4) / 4 * Math.PI); // 0..0.12 across 4 bars
    const lift = loc.lift + swell;

    // Last bar of a 4+ bar section = a "fill" bar: a busier drum turnaround and an
    // arp run that signals the change coming. Cheap, keyed off the bar so it's
    // deterministic (no per-frame work). STEADY tracks don't churn the bass/arp on
    // fills (that read as a "slowdown/stutter" against the locked pulse); their
    // drums still add a light snare turnaround via _drums, but the groove holds.
    const isFillBar = loc.secLen >= 4 && phraseBar === loc.secLen - 1;
    const churnFill = isFillBar && !track.steady; // bass-double + arp-run only when not steady

    // Pad chord: lay the whole chord down once at the top of each bar so a warm
    // bed hums under everything. This is the biggest "vibey" win.
    if (s === 0 && loc.pad) this._pad(t, chord.pad, track, lift);

    // 8th-note bass pulse. On a (non-steady) fill bar's back half, double up to
    // 16ths for a little driving run into the next section.
    if (loc.bass) {
      const bassHit = (s % 2 === 0) || (churnFill && s >= 12);
      if (bassHit) this._bass(t, chord.bass, track, lift);
    }

    // Arp: dreamy tracks pluck every 8th note (arpRate 8); busier ones every 16th.
    // The melodic CONTOUR is per-track (`feel`) so no two leads trace the same
    // up/down — see _arpNote.
    if (loc.arp) {
      const arpEvery = track.arpRate === 16 ? 1 : 2;
      // On a churn fill, run the arp at double rate for a fast lead flourish.
      const every = churnFill ? Math.max(1, arpEvery / 2) : arpEvery;
      const feel = track.feel || "run";
      // "stab"/"sparse" leads sit out most slots so they read as syncopated jabs /
      // laid-back downbeats instead of a constant stream.
      const playSlot =
        feel === "sparse" ? s % 4 === 0 :
        feel === "stab"    ? (s % 4 === 0 || s % 8 === 3) : // downbeat + an off-the-beat jab
        s % every === 0;
      if (playSlot) {
        let note = this._arpNote(chord.arp, s, phraseBar, songBar, feel);
        if (churnFill && s >= 12) note = note * 2; // octave-up tail on the run
        this._arp(swung, note, track, lift);
      }
    }

    // Steady tracks (Audiosurf) get the plain four-on-the-floor groove with no
    // fill churn, so the pulse the world rides never stutters.
    if (loc.drums) this._drums(s, swung, track, lift, churnFill);
  }

  // Pick the arp note for this 16th step given the track's melodic `feel`. Keeping
  // the contour per-track is what stops every lead from tracing the same up/down.
  //   run      — the canned 4-note shape, with a mid-phrase reshuffle for variety.
  //   climb    — steps up through the chord across the bar (a rising, hopeful line).
  //   pendulum — zig-zags out from the middle note (in/out, never a straight run).
  //   stab     — leans on the root with the occasional higher jab (funky/DnB).
  //   sparse   — just the downbeat tone, alternating low/high across phrases (lo-fi).
  _arpNote(seq, s, phraseBar, songBar, feel) {
    const n = seq.length;
    const eighth = Math.floor(s / 2); // 0..7 within the bar
    if (feel === "climb") {
      // Walk upward through the chord as the bar progresses; nudge the start each
      // bar so successive bars don't all begin on the same note.
      return seq[(eighth + phraseBar) % n];
    }
    if (feel === "pendulum") {
      // Bounce outward from the center: middle → up → middle → down → ...
      const order = [1, 2, 1, 0, 2, 3, 1, 0];
      return seq[order[eighth % order.length] % n];
    }
    if (feel === "stab") {
      // Mostly the root (index 0); the off-beat jab grabs a higher chord tone.
      return s % 4 === 0 ? seq[0] : seq[2 % n];
    }
    if (feel === "sparse") {
      // One note per beat, alternating a low and a high chord tone per phrase so the
      // sparse line still drifts instead of repeating one pitch.
      return seq[(phraseBar % 2 === 0 ? 0 : 2) % n];
    }
    // "run" (default): canned shape, but every other phrase reshuffle so repeats
    // don't sound identical bar-to-bar.
    const vary = (songBar % 8) >= 4;
    return vary ? seq[(eighth + phraseBar) % n] : seq[s % n];
  }

  // --- Music voices ---------------------------------------------------------

  // Soft sustained chord pad — the warm bed under each bar. Detuned pairs per
  // note give a slow chorus shimmer; a low-passed sine/triangle keeps it gentle.
  _pad(t, freqs, track, lift = 0) {
    const barLen = this._sec16 * 16;
    const dur = barLen * 0.98;
    const lp = this.ctx.createBiquadFilter();
    // lifted sections open the pad's top end a touch so a chorus/drop feels brighter
    lp.type = "lowpass"; lp.frequency.value = 900 + lift * 700; lp.Q.value = 0.4;
    const g = this.ctx.createGain();
    const peak = 0.05 * (1 + lift); // louder in lifted sections
    // long, smooth swell in and out so chords blur into each other
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + barLen * 0.25);
    g.gain.setValueAtTime(peak, t + dur * 0.6);
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

  _bass(t, freq, track, lift = 0) {
    const dur = this._sec16 * 1.7;
    const g = this.ctx.createGain();
    this._env(g, t, 0.42 * (track.gain || 1) * (1 + lift * 0.5), 0.008, dur); // louder when lifted
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
  _arp(t, freq, track, lift = 0) {
    const dur = this._sec16 * (track.arpRate === 16 ? 1.0 : 1.8); // longer notes on dreamy tracks
    const lp = this.ctx.createBiquadFilter();
    // lifted sections brighten the lead so a chorus/drop cuts through a bit more
    lp.type = "lowpass"; lp.frequency.value = (track.arpCut || 1800) * (1 + lift * 0.4); lp.Q.value = 1;
    const g = this.ctx.createGain();
    this._env(g, t, 0.1 * (track.gain || 1) * (1 + lift * 0.6), 0.006, dur); // gentle attack, no click
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
  _drums(s, t, track, lift = 0, isFillBar = false) {
    const kind = track.drums || "soft";
    if (kind === "none") return;
    const L = 1 + lift; // lifted sections hit a touch harder

    if (kind === "brush") {
      // Soft brushed groove: rounded kick, brushed backbeat, no hats.
      if (s % 4 === 0) this._kick(t, 0.55 * L);
      if (s === 4 || s === 12) this._brush(t);
      // Gentle brushed fill across the last bar's final beat.
      if (isFillBar && s >= 12 && s % 2 === 0) this._brush(t);
      return;
    }
    if (kind === "soft") {
      if (s % 4 === 0) this._kick(t, 0.65 * L);
      if (s === 4 || s === 12) this._snare(t, 0.22 * L);
      if (s % 4 === 2) this._hat(t, 0.07); // sparser, quieter hats
      // Soft snare fill on the last beat of a fill bar.
      if (isFillBar && s >= 12 && s % 2 === 0) this._snare(t, 0.18);
      return;
    }
    // "full" — energetic but still tamed vs. the old harsh version. The kick MUST
    // stay on every quarter (s % 4 === 0) — Audiosurf's onBeat hook is locked to it.
    if (s % 4 === 0) this._kick(t, 0.8 * L);
    if (s === 4 || s === 12) this._snare(t, 0.3 * L);
    if (s % 2 === 1) this._hat(t, 0.1);
    // Snare-roll fill across the whole last bar of a phrase (every 16th in the back
    // half), building into the next section — kick is untouched so the grid holds.
    if (isFillBar) {
      if (s >= 8 && s % 2 === 1) this._snare(t, 0.14 + (s - 8) * 0.015);
      if (s >= 12) this._hat(t, 0.12);
    }
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
