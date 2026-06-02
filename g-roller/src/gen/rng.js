// A tiny random-number source the generator draws from. In the real game we pass
// Math.random (truly random each run). In tests we pass a SEEDED generator so the
// same seed always produces the same world — that's what makes the generator
// testable: run it, assert properties, get the same result every time.

// mulberry32: a small, fast, decent seeded PRNG. Given a seed it returns a function
// that yields a new float in [0, 1) each call — a drop-in replacement for Math.random.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bundle the small random helpers around a chosen source, so the generator never
// touches Math.random directly (and tests can swap in a seeded source).
//   rand(a, b)    — a float in [a, b)
//   randInt(a, b) — an integer in [a, b] (inclusive both ends)
//   pick(arr)     — a random element
//   chance(p)     — true with probability p (0..1)
//   clamp(v,lo,hi)— v held inside [lo, hi] (deterministic helper, here for one import)
export function makeRng(next = Math.random) {
  const rand = (a, b) => a + next() * (b - a);
  return {
    next,
    rand,
    randInt: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  };
}
