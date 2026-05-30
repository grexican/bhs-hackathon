import { defineConfig, loadEnv } from "vite";

// Read DEV_PORT / PREVIEW_PORT from the .env file so the ports live in one
// place. strictPort makes Vite fail loudly instead of silently picking another
// port if the chosen one is taken.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.DEV_PORT) || 5173;
  const previewPort = Number(env.PREVIEW_PORT) || 4173;

  return {
    server: { port: devPort, strictPort: true },
    preview: { port: previewPort, strictPort: true },
  };
});
