/// <reference types="vitest" />

import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Ports come from the repo-root .env (CLIENT_PORT for this dev server, PORT for
// the API it proxies to) so they're configured in one place. Falls back to the
// classic 5173/3001 if .env doesn't set them.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(import.meta.dirname, "../.."), "");
  const clientPort = Number(env.CLIENT_PORT) || 5173;
  const apiPort = Number(env.PORT) || 3001;

  return {
    plugins: [react()],
    server: {
      port: clientPort,
      strictPort: true,
      proxy: {
        // In dev, calls to /api/* are forwarded to the Express server so the
        // React code can call fetch('/api/...') without worrying about CORS.
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
