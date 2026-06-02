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
    // C Lydian: C D E F# G A B. The F# (instead of F) is the signature bright,
    // floating colour. Diatonic chords only — Cmaj7 (I), D major (II, the bright
    // Lydian II), Em7 (iii), F#m7b5 (vii°, the #4 chord — root F#, b3 A, b5 C nat),
    // G major (V), Am7 (vi). Voicings stacked low→high for smooth voice leading.
    prog: {
      C:    { bass: 65.41, pad: [130.81, 164.81, 196.0],  arp: [261.63, 329.63, 392.0, 493.88] }, // C E G + maj7 B
      G:    { bass: 98.0,  pad: [196.0, 246.94, 293.66],  arp: [392.0, 493.88, 587.33, 739.99] }, // G B D + maj7 F#
      D:    { bass: 73.42, pad: [146.83, 185.0, 220.0],   arp: [293.66, 369.99, 440.0, 587.33] }, // D F# A (II major); arp D F# A D
      "F#m7b5": { bass: 92.50, pad: [185.0, 220.0, 261.63], arp: [369.99, 440.0, 523.25, 659.25] }, // F# A C(nat) — the #4 lift, now correct
      Am:   { bass: 110.0, pad: [220.0, 261.63, 329.63],  arp: [440.0, 523.25, 659.25, 783.99] }, // A C E + 7 G
      Em:   { bass: 82.41, pad: [164.81, 196.0, 246.94],  arp: [329.63, 392.0, 493.88, 587.33] }, // E G B + 7 D
    },
    // Diatonic to C Lydian, every section cadences home. The bright II (D) and the
    // #4 colour (F#m7b5) are used as passing/pre-dominant lifts that fall back to G→C.
    arrangement: [
      { name: "intro",  chords: ["C", "Am"],              layers: { bass: false, arp: false, drums: false } },
      { name: "introB", chords: ["Am", "Em", "G", "C"],   layers: { drums: false } }, // vi-iii-V-I lands on tonic
      { name: "verse",  chords: ["C", "Am", "Em", "G"] },                              // I-vi-iii-V
      { name: "verse",  chords: ["C", "Am", "D", "G"] },                               // I-vi-II-V (bright II)
      { name: "pre",    chords: ["Am", "Em", "D", "G"] },                              // builds to V (half cadence)
      { name: "chorus", chords: ["C", "G", "Am", "G"],    lift: 0.35 },                // I-V-vi-V
      { name: "chorus", chords: ["C", "Am", "F#m7b5", "G"], lift: 0.35 },              // vii°-V lift, resolves V
      { name: "verse",  chords: ["Am", "Em", "G", "C"] },                              // resolves to I
      { name: "verse",  chords: ["C", "Em", "Am", "G"] },
      { name: "pre",    chords: ["Em", "Am", "D", "G"] },                              // half cadence on V
      { name: "bridge", chords: ["Am", "Em", "G", "C"],   layers: { drums: false } },  // settles on I
      { name: "bridge", chords: ["C", "Am", "D", "G"],    layers: { drums: false } },
      { name: "chorus", chords: ["C", "G", "Am", "G"],    lift: 0.4 },
      { name: "chorus", chords: ["C", "Em", "F#m7b5", "G"], lift: 0.45 },
      { name: "chorus", chords: ["C", "Am", "G", "C"],    lift: 0.5 },                 // big authentic cadence V-I
      { name: "outro",  chords: ["Am", "F#m7b5", "G", "C"], layers: { drums: false } },// final V-I home
      { name: "settle", chords: ["C", "C"], layers: { bass: false, arp: false, drums: false } }, // pad-only on the tonic — matches the intro for a smooth loop
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
    // D natural minor (D E F G A Bb C) home, with the harmonic-minor leading tone
    // (C#) borrowed in the V chord so the ii–V–I really resolves: Em7b5 (ii°) →
    // A7 (V, with C# leading tone + G b7) → Dm9 (i). Gm9 = iv, Cmaj9 = bVII,
    // Bbmaj7 = bVI. All voicings now match their names exactly.
    prog: {
      Dm9:   { bass: 73.42,  pad: [174.61, 220.0, 261.63],  arp: [293.66, 349.23, 440.0, 523.25] }, // F A C over D; arp D F A C
      Gm9:   { bass: 98.0,   pad: [233.08, 293.66, 349.23],  arp: [392.0, 466.16, 587.33, 698.46] }, // Bb D F over G; arp G Bb D F
      A7:    { bass: 110.0,  pad: [220.0, 277.18, 329.63],   arp: [440.0, 554.37, 659.25, 783.99] }, // A C# E + b7 G (was G# — fixed)
      Cmaj9: { bass: 130.81, pad: [261.63, 329.63, 392.0],   arp: [523.25, 587.33, 659.25, 783.99] }, // C E G; arp C D E G
      Bbmaj7:{ bass: 116.54, pad: [233.08, 293.66, 349.23],  arp: [466.16, 587.33, 698.46, 880.0] },  // Bb D F + maj7 A
      "Em7b5": { bass: 82.41, pad: [196.0, 233.08, 293.66],  arp: [329.63, 392.0, 466.16, 587.33] },  // E G Bb + b7 D (ii°)
    },
    // Lo-fi jazz turnarounds. Every section ends on the ii–V–I (Em7b5 → A7 → Dm9)
    // or resolves to Dm9 directly, so the wandering always cadences home.
    arrangement: [
      { name: "intro", chords: ["Dm9", "Gm9"],               layers: { arp: false, drums: false } },
      { name: "intro", chords: ["Em7b5", "A7"],              layers: { drums: false } },           // half cadence on V
      { name: "verse", chords: ["Dm9", "Gm9", "Em7b5", "A7"] },                                    // i-iv-ii-V
      { name: "verse", chords: ["Dm9", "Bbmaj7", "Em7b5", "A7"] },                                 // i-bVI-ii-V
      { name: "pre",   chords: ["Gm9", "Cmaj9", "Em7b5", "A7"] },                                  // iv-bVII-ii-V
      { name: "hook",  chords: ["Dm9", "Bbmaj7", "Em7b5", "A7"], lift: 0.3 },                       // resolves V each pass
      { name: "hook",  chords: ["Cmaj9", "Bbmaj7", "Em7b5", "A7"], lift: 0.3 },
      { name: "verse", chords: ["Dm9", "Gm9", "Cmaj9", "A7"] },                                    // bVII walks to V
      { name: "verse", chords: ["Dm9", "Bbmaj7", "Gm9", "A7"] },
      { name: "bridge",chords: ["Bbmaj7", "Gm9", "Em7b5", "A7"], layers: { drums: false } },        // ends on V
      { name: "bridge",chords: ["Gm9", "A7", "Dm9", "A7"],   layers: { drums: false } },            // iv-V-i-V
      { name: "hook",  chords: ["Dm9", "Bbmaj7", "Em7b5", "A7"], lift: 0.35 },
      { name: "hook",  chords: ["Cmaj9", "Gm9", "Em7b5", "A7"], lift: 0.4 },
      { name: "outro", chords: ["Gm9", "Em7b5", "A7", "Dm9"], layers: { drums: false } },           // full ii–V–i home
      { name: "settle", chords: ["Dm9", "Dm9"], layers: { arp: false, drums: false } },             // pad+bass on the tonic — matches the intro, smooth loop
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
    swing: 0, drums: "none", arpRate: 8, gain: 1.05, feel: "float",
    // A major / F#m family (A B C# D E F# G#) — wide and open, but now the chords
    // are voiced correctly so the wash is consonant. F#m (vi), A (I), E (V),
    // Bsus2 (ii colour), Dmaj7 (IV — D F# A C#), C#m (iii — C# E G#). The repeated
    // 4th arp note gives the gentle pendulum a built-in turn-around chord tone.
    prog: {
      "F#m":   { bass: 92.50,  pad: [185.0, 220.0, 277.18],  arp: [369.99, 440.0, 554.37, 440.0] },  // F# A C#
      A:       { bass: 110.0,  pad: [220.0, 277.18, 329.63], arp: [440.0, 554.37, 659.25, 554.37] }, // A C# E
      E:       { bass: 82.41,  pad: [164.81, 207.65, 246.94], arp: [329.63, 415.30, 493.88, 415.30] }, // E G# B (V)
      Bsus:    { bass: 61.74,  pad: [185.0, 246.94, 277.18], arp: [369.99, 493.88, 554.37, 493.88] }, // B C# F# (sus2)
      "Dmaj7": { bass: 73.42,  pad: [185.0, 220.0, 277.18],  arp: [293.66, 369.99, 440.0, 554.37] },  // D F# A C# (was A major — fixed)
      "C#m":   { bass: 69.30,  pad: [207.65, 277.18, 329.63], arp: [277.18, 329.63, 415.30, 329.63] },// G#3 C#4 E4 = C#m; arp C# E G# (was G# major — fixed)
    },
    // Ambient tides, but harmonically anchored: each phrase falls onto F#m (vi, the
    // home colour) or A (I). E (V) → F#m is a deceptive cadence; Dmaj7 (IV) → A is
    // plagal. The whole arrangement opens and closes on F#m so it breathes home.
    // Re-anchored to A MAJOR (the I) as home — bright and open, the opposite of
    // Midnight Cruise's dark jazz minor, so the two never feel alike. F#m (vi) is a
    // colour, not the home. Plagal (Dmaj7→A) and authentic (E→A) cadences land on A;
    // the whole tide opens and closes on A, with a pad-only settle into the loop.
    arrangement: [
      { name: "wash",  chords: ["A", "Dmaj7"],              layers: { bass: false, arp: false } }, // I-IV pad wash
      { name: "wash",  chords: ["A", "E"],                  layers: { arp: false } },              // I-V
      { name: "drift", chords: ["A", "Dmaj7", "E", "A"],    layers: { arp: false } },              // I-IV-V-I
      { name: "drift", chords: ["A", "F#m", "Dmaj7", "A"] },                                       // I-vi-IV-I
      { name: "drift", chords: ["F#m", "Dmaj7", "E", "A"] },                                       // vi-IV-V-I
      { name: "rise",  chords: ["Dmaj7", "E", "F#m", "A"],  lift: 0.3 },                            // IV-V-vi-I
      { name: "rise",  chords: ["A", "E", "Dmaj7", "A"],    lift: 0.3 },                            // I-V-IV-I
      { name: "rise",  chords: ["Dmaj7", "C#m", "Bsus", "E"], lift: 0.4 },                          // builds to V
      { name: "ebb",   chords: ["A", "Dmaj7", "E", "A"],    layers: { arp: false } },               // resolves I
      { name: "ebb",   chords: ["F#m", "Dmaj7", "E", "A"],  layers: { arp: false } },
      { name: "rise",  chords: ["A", "Dmaj7", "E", "A"],    lift: 0.35 },
      { name: "ebb",   chords: ["Dmaj7", "A", "E", "A"],    layers: { arp: false } },               // plagal + auth to I
      { name: "wash",  chords: ["Dmaj7", "A"],              layers: { arp: false } },               // IV-I plagal
      { name: "settle",chords: ["A", "A"],                  layers: { bass: false, arp: false } },  // pad-only A — matches the intro, smooth loop
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
    // A Phrygian: A Bb C D E F G. The Bb (bII) is the signature dark tension, and
    // the Phrygian cadence is bII → i (Bb → Am). Diatonic triads: Am (i), Bb (bII),
    // Cmaj is bIII, Dm (iv), Edim (v° = E G Bb — NOT Em, since B is flat here),
    // F (bVI), Gm (bVII). Em was wrong (had a B natural) — now Edim.
    prog: {
      Am:   { bass: 110.0,  pad: [220.0, 261.63, 329.63],  arp: [220.0, 220.0, 261.63, 329.63] }, // A C E
      Bb:   { bass: 116.54, pad: [233.08, 293.66, 349.23], arp: [233.08, 233.08, 293.66, 349.23] }, // Bb D F (bII)
      Dm:   { bass: 73.42,  pad: [146.83, 174.61, 220.0],  arp: [146.83, 146.83, 220.0, 293.66] }, // D F A
      Edim: { bass: 82.41,  pad: [164.81, 196.0, 233.08],  arp: [164.81, 164.81, 233.08, 329.63] }, // E G Bb (v°, was Em)
      F:    { bass: 87.31,  pad: [174.61, 220.0, 261.63],  arp: [174.61, 174.61, 261.63, 349.23] }, // F A C (bVI)
      Gm:   { bass: 98.0,   pad: [196.0, 233.08, 293.66],  arp: [196.0, 196.0, 293.66, 392.0] },   // G Bb D (bVII)
    },
    // Dark driving D&B. Bb → Am is the Phrygian cadence and every section lands on
    // Am (i), so the tension always resolves home instead of wandering.
    arrangement: [
      { name: "intro", chords: ["Am", "Am"],          layers: { arp: false, pad: false } },
      { name: "A",     chords: ["Am", "F", "Gm", "Bb"] },                               // i-bVI-bVII-bII…
      { name: "A",     chords: ["Am", "Dm", "Bb", "Am"] },                              // …→ i (Phrygian cadence)
      { name: "A2",    chords: ["Am", "Gm", "F", "Bb"] },
      { name: "build", chords: ["Dm", "Gm", "F", "Bb"] },                               // builds to bII
      { name: "drop",  chords: ["Am", "Gm", "Bb", "Am"], lift: 0.5 },                    // resolves bII-i
      { name: "drop",  chords: ["Am", "F", "Bb", "Am"],  lift: 0.5 },
      { name: "break", chords: ["Dm", "Am", "Gm", "F"],  layers: { drums: false } },
      { name: "break", chords: ["F", "Gm", "Dm", "Bb"],  layers: { drums: false } },     // ends on bII pull
      { name: "A2",    chords: ["Am", "Edim", "Bb", "Am"] },                             // v°-bII-i
      { name: "build", chords: ["F", "Gm", "Dm", "Bb"] },
      { name: "drop",  chords: ["Am", "Gm", "Bb", "Am"], lift: 0.55 },
      { name: "drop",  chords: ["Am", "F", "Bb", "Am"],  lift: 0.55 },
      { name: "drop",  chords: ["Dm", "F", "Bb", "Am"],  lift: 0.6 },                     // full cadence to i
      { name: "outro", chords: ["Gm", "F", "Bb", "Am"] },                                // bVII-bVI-bII-i home
      { name: "settle", chords: ["Am", "Am"], layers: { arp: false, pad: false } },       // drop lead+pad, hold the bass+drums groove on i — matches the intro so the beat carries through the loop
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
    // E natural minor (E F# G A B C D). Diatonic triads: Em (i), F#dim (ii°),
    // G (bIII), Am (iv), Bm (v), C (bVI), D (bVII). The classic Em–C–G–D loop
    // resolves through D (bVII) back to Em. D now carries its third (F#).
    prog: {
      Em: { bass: 82.41,  pad: [164.81, 196.0, 246.94], arp: [329.63, 392.0, 493.88, 392.0] },  // E G B
      C:  { bass: 130.81, pad: [261.63, 329.63, 392.0], arp: [523.25, 392.0, 329.63, 392.0] },  // C E G
      G:  { bass: 98.0,   pad: [196.0, 246.94, 293.66], arp: [392.0, 493.88, 587.33, 493.88] }, // G B D
      D:  { bass: 73.42,  pad: [146.83, 184.99, 220.0], arp: [293.66, 369.99, 440.0, 587.33] }, // D F# A (added the 3rd)
      Am: { bass: 110.0,  pad: [220.0, 261.63, 329.63], arp: [440.0, 523.25, 659.25, 523.25] }, // A C E
      Bm: { bass: 123.47, pad: [246.94, 293.66, 369.99], arp: [493.88, 587.33, 739.99, 587.33] }, // B D F# (v)
    },
    // Outrun anthem. i-bVI-bIII-bVII (Em-C-G-D) is the genre staple; D (bVII) → Em
    // is the resolution, and every section lands on Em (or the v, Bm, into Em).
    arrangement: [
      { name: "intro", chords: ["Em", "Em"],          layers: { arp: false, pad: false } },
      { name: "A",     chords: ["Em", "C", "G", "D"] },                 // i-bVI-bIII-bVII
      { name: "A",     chords: ["Em", "Am", "C", "D"] },
      { name: "A2",    chords: ["Em", "G", "C", "D"] },
      { name: "build", chords: ["C", "G", "Am", "Bm"] },                // builds to v (Bm)
      { name: "drop",  chords: ["Em", "C", "G", "D"],  lift: 0.5 },
      { name: "drop",  chords: ["Em", "G", "C", "D"],  lift: 0.5 },
      { name: "break", chords: ["Am", "C", "G", "Bm"], layers: { drums: false } },
      { name: "break", chords: ["C", "G", "Am", "Bm"], layers: { drums: false } },
      { name: "A2",    chords: ["Em", "C", "Am", "D"] },
      { name: "build", chords: ["C", "G", "Am", "Bm"] },
      { name: "drop",  chords: ["Em", "C", "G", "D"],  lift: 0.55 },
      { name: "drop",  chords: ["Em", "Am", "C", "D"], lift: 0.6 },
      { name: "outro", chords: ["C", "G", "D", "Em"] },                 // bVI-bIII-bVII-i home
      { name: "settle", chords: ["Em", "Em"], layers: { arp: false, pad: false } }, // drop lead+pad, hold the four-on-the-floor on i — matches the intro so it no longer ends harsh
    ],
  },

  // 6) SOLAR DRIVE — bright MAJOR synth-pop / house. *** Audiosurf-suitable ***
  //    (steady four-on-the-floor, so the world can pulse on it too). 124bpm in C
  //    major — the upbeat, happy, daytime counterpart to Pulse Runner's darker
  //    minor outrun. Classic I–V–vi–IV pop engine, bright saw bass + square stabs.
  //    What sets it apart: the only fast MAJOR track — sunny and anthemic where the
  //    others are dreamy, jazzy, ambient, dark, or moody-minor.
  {
    name: "Solar Drive", tempo: 124,
    bassWave: "sawtooth", arpWave: "square", padWave: "sawtooth",
    gritty: true, bassCut: 520, arpCut: 2400, detune: 7, space: 0.22,
    swing: 0, drums: "full", arpRate: 16, gain: 0.92, feel: "run", steady: true,
    // C major (C D E F G A B). Diatonic triads: C(I) Dm(ii) Em(iii) F(IV) G(V) Am(vi).
    // I-V-vi-IV pop/house; G(V)→C(I) is the resolution and sections land on C.
    prog: {
      C:  { bass: 65.41,  pad: [130.81, 164.81, 196.0],  arp: [261.63, 329.63, 392.0, 329.63] }, // C E G
      G:  { bass: 98.0,   pad: [196.0, 246.94, 293.66],  arp: [392.0, 493.88, 587.33, 493.88] }, // G B D
      Am: { bass: 110.0,  pad: [220.0, 261.63, 329.63],  arp: [440.0, 523.25, 659.25, 523.25] }, // A C E
      F:  { bass: 87.31,  pad: [174.61, 220.0, 261.63],  arp: [349.23, 440.0, 523.25, 440.0] },  // F A C
      Dm: { bass: 73.42,  pad: [146.83, 174.61, 220.0],  arp: [293.66, 349.23, 440.0, 349.23] }, // D F A
      Em: { bass: 82.41,  pad: [164.81, 196.0, 246.94],  arp: [329.63, 392.0, 493.88, 392.0] },  // E G B
    },
    arrangement: [
      { name: "intro", chords: ["C", "C"],            layers: { arp: false, pad: false } }, // four-on-the-floor groove start
      { name: "A",     chords: ["C", "G", "Am", "F"] },                 // I-V-vi-IV
      { name: "A",     chords: ["C", "G", "F", "C"] },                  // resolves to I
      { name: "A2",    chords: ["Am", "F", "C", "G"] },                 // vi-IV-I-V
      { name: "build", chords: ["F", "G", "Am", "G"] },                 // builds to V
      { name: "drop",  chords: ["C", "G", "Am", "F"],  lift: 0.5 },
      { name: "drop",  chords: ["C", "G", "F", "C"],   lift: 0.5 },     // resolves to I
      { name: "break", chords: ["Am", "F", "C", "G"],  layers: { drums: false } },
      { name: "break", chords: ["Dm", "G", "C", "C"],  layers: { drums: false } }, // ii-V-I
      { name: "A2",    chords: ["C", "Em", "Am", "F"] },
      { name: "build", chords: ["F", "G", "Am", "G"] },
      { name: "drop",  chords: ["C", "G", "Am", "F"],  lift: 0.55 },
      { name: "drop",  chords: ["Dm", "G", "C", "C"],  lift: 0.6 },     // ii-V-I big resolve
      { name: "outro", chords: ["Am", "F", "G", "C"] },                 // vi-IV-V-I home
      { name: "settle", chords: ["C", "C"], layers: { arp: false, pad: false } }, // hold the groove on I — matches the intro, smooth loop
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
    // Only kick off the sequencer if it isn't already running, so restarting the
    // LEVEL doesn't restart the SONG — it keeps playing from where it was. (Track
    // switches still restart, via nextTrack/setTrack.)
    if (!this._musicOn) this._startMusic();
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

  // Is the current track beat-locked (safe for Audiosurf's on-beat pulsing)?
  // Lets Audiosurf run on ANY steady track, not just the one default — variety.
  currentSteady() {
    return !!TRACKS[this._trackIndex].steady;
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
        feel === "float"  ? (s === 0 || s === 6 || s === 12) : // 3 long, irregularly-spaced ambient tones (no pulse)
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

  // Pick the arp note for this 16th step given the track's melodic `feel`. Every
  // entry of `seq` is already a CHORD TONE of the current bar's chord (verified in
  // each track's `prog`), so whatever index we choose is in-harmony. The rule we
  // follow from functional-melody writing: land a strong chord tone (the root,
  // seq[0], or the 3rd/5th) on STRONG beats (the downbeat of each beat, s%4===0),
  // and let the in-between steps walk the other chord tones. That makes the line
  // OUTLINE the chord and resolve, instead of wandering. Per-track `feel` only
  // changes the contour SHAPE — never whether a note is in the chord.
  //   run      — ascends the chord across the beat, root on each downbeat.
  //   climb    — steady stepwise rise through the chord tones, restarting per beat.
  //   pendulum — gentle in/out bounce that returns to the root on the downbeat.
  //   stab     — root on the beat, a higher chord tone on the syncopated jab.
  //   sparse   — one chord tone per beat, walking root→3rd→5th→3rd across the bar.
  _arpNote(seq, s, phraseBar, songBar, feel) {
    const n = seq.length;
    const beat = Math.floor(s / 4);      // which quarter-note beat (0..3)
    const inBeat = s % 4;                // 0 = strong downbeat of the beat
    const eighth = Math.floor(s / 2);    // 0..7 within the bar

    if (feel === "climb") {
      // Gentle STEPWISE rise — only ever moves to an ADJACENT chord tone (no leaps,
      // which read as "random hopping"). Each beat picks a base tone that rises then
      // eases back, and the off-eighth is the very next tone up. Always resolves.
      const base = [0, 1, 2, 1][beat % 4];          // rise 0→1→2 then settle to 1
      return inBeat === 0 ? seq[base % n] : seq[(base + 1) % n];
    }
    if (feel === "pendulum") {
      // Gentle in/out that always returns home, moving by single steps (no jumps):
      // root → 3rd → 5th → 3rd → root … so it breathes rather than bouncing around.
      const order = [0, 1, 2, 1]; // one step at a time, symmetric
      return seq[order[beat % order.length] % n];
    }
    if (feel === "float") {
      // Ultra-sparse ambient drift (see playSlot: only ~3 long tones a bar) — a slow
      // wide arc through root → 5th → 3rd that outlines the chord without any pulse.
      return s < 6 ? seq[0] : s < 12 ? seq[2 % n] : seq[1 % n];
    }
    if (feel === "stab") {
      // Funky/DnB: root locked on the beat, a higher chord tone on the off jab.
      return inBeat === 0 ? seq[0] : seq[2 % n];
    }
    if (feel === "sparse") {
      // Lo-fi: one chord tone per beat, walking root→3rd→5th→3rd so the lazy line
      // still outlines the chord across the bar instead of repeating one pitch.
      const walk = [0, 1, 2, 1];
      return seq[walk[beat % walk.length] % n];
    }
    // "run" (default): ascend the chord, but anchor the root on each downbeat so the
    // line stays hooked to the harmony. Shift the run every other phrase for variety.
    if (inBeat === 0) return seq[0];
    const vary = (songBar % 8) >= 4 ? phraseBar : 0;
    return seq[(eighth + vary) % n];
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
    // Small random pitch + level spread so a sound played many times in a row
    // (gems, jumps) never feels mechanical — each instance is a touch different.
    const j = 0.97 + Math.random() * 0.06; // ±3% pitch
    f0 *= j; f1 *= j; peak *= 0.9 + Math.random() * 0.2; // ±10% level
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
