/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite serves the React app at http://localhost:5173.
// In dev, calls to /api/* are proxied to the Express server (port 3001) so
// the React code can call `fetch('/api/todos')` without thinking about CORS.
// Override the API target with VITE_PROXY_TARGET when running on another port.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
