import { defineConfig } from "vitest/config";

// The generation core (src/gen/*) is pure JS — no browser, no THREE — so the tests
// run in plain Node. `tests/` holds the suites; everything else is the game itself.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
