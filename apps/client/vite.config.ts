/// <reference types="vitest" />

import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Vite serves the React app and proxies /api/* to the Express server so the
// React code can call `fetch('/api/...')` without thinking about CORS. Both
// ports come from the shared .env at the repo root (two levels up), so you set
// them in one place. Defaults match the original starter if .env is missing.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(process.cwd(), "../.."), "");
  const clientPort = Number(env.CLIENT_PORT ?? 5173);
  const apiPort = Number(env.PORT ?? 3001);

  return {
    plugins: [react()],
    server: {
      port: clientPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
    },
  };
});
