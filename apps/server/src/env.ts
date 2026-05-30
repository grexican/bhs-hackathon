import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load .env from the repo root, no matter where the server is launched from.
// (npm runs this workspace with its cwd at apps/server/, so a bare
// dotenv.config() would miss the root .env where the keys actually live.)
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, "../../../.env") });

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  DATABASE_FILE: process.env.DATABASE_FILE ?? "./data.db",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  NODE_ENV: process.env.NODE_ENV ?? "development",

  // The "reading" brain. Required for the AI feed to work.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",

  // Gmail over IMAP. GMAIL_APP_PASSWORD is a 16-char Google App Password
  // (NOT your normal login password) — see docs/poc-plan.md / the README.
  GMAIL_USER: process.env.GMAIL_USER ?? "",
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD ?? "",
  GMAIL_IMAP_HOST: process.env.GMAIL_IMAP_HOST ?? "imap.gmail.com",
};
