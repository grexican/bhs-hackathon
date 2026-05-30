import { defineConfig, loadEnv } from "vite";

// Read DEV_PORT / PREVIEW_PORT from the .env file so the ports live in one
// place. strictPort makes Vite fail loudly instead of silently picking another
// port if the chosen one is taken.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.DEV_PORT) || 5173;
  const previewPort = Number(env.PREVIEW_PORT) || 4173;

  return {
    // Relative asset paths in the build so it runs from any static host /
    // subpath (e.g. GitHub Pages at /<repo>/). Dev stays at the server root.
    base: command === "build" ? "./" : "/",
    server: { port: devPort, strictPort: true },
    preview: { port: previewPort, strictPort: true },
  };
});
