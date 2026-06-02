import { describe, it, expect } from "vitest";
import { makeSplineSampler } from "../src/gen/spline.js";

// A spread of ribbon shapes from gentle to extreme, to stress the slope cap.
const CASES = [
  { len: 70, opts: { ampY: 7, wavesY: 1.5, meanderX: 8, wavesX: 0.5, maxSlope: 0.9 } },
  { len: 180, opts: { ampY: 14, wavesY: 2.2, meanderX: 15, wavesX: 0.8, maxSlope: 0.9 } },
  { len: 320, opts: { ampY: 20, wavesY: 3.0, meanderX: 22, wavesX: 1.2, maxSlope: 0.9 } },
  { len: 90, opts: { ampY: 30, wavesY: 4.0, meanderX: 10, wavesX: 1.0, maxSlope: 0.6 } }, // deliberately too steep → must be scaled down
];

describe("spline sampler", () => {
  for (const { len, opts } of CASES) {
    it(`never exceeds maxSlope (len=${len}, ampY=${opts.ampY})`, () => {
      const s = makeSplineSampler(opts, len);
      const half = len / 2;
      const dz = len / 400; // finer than the build resolution
      let worst = 0;
      for (let z = -half; z < half; z += dz) {
        worst = Math.max(worst, Math.abs((s.heightAt(z + dz) - s.heightAt(z)) / dz));
      }
      // The cap is enforced at build resolution; allow a small margin for the finer probe.
      expect(worst).toBeLessThanOrEqual(opts.maxSlope * 1.08);
    });

    it(`windows height + meander to ~0 at both ends (len=${len})`, () => {
      const s = makeSplineSampler(opts, len);
      const half = len / 2;
      for (const z of [-half, half]) {
        expect(Math.abs(s.heightAt(z))).toBeLessThan(0.01);
        expect(Math.abs(s.meanderAt(z))).toBeLessThan(0.01);
      }
    });

    it(`reports a non-positive deepest offset (len=${len})`, () => {
      const s = makeSplineSampler(opts, len);
      expect(s.minOffset).toBeLessThanOrEqual(0);
    });
  }

  it("is deterministic: same opts → identical samples (DRY safety)", () => {
    // The geometry builder, the gem trail, and the death-check all call this. Proving
    // it's a pure function of its inputs is what guarantees they can't drift apart.
    const opts = { ampY: 12, wavesY: 2, meanderX: 14, wavesX: 1, maxSlope: 0.9 };
    const a = makeSplineSampler(opts, 200);
    const b = makeSplineSampler(opts, 200);
    for (let z = -100; z <= 100; z += 7) {
      expect(a.heightAt(z)).toBe(b.heightAt(z));
      expect(a.meanderAt(z)).toBe(b.meanderAt(z));
    }
  });
});
