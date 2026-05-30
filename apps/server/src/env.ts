import { resolve } from "node:path";
import dotenv from "dotenv";

// Load .env. The server runs from apps/server/, so the shared config lives two
// levels up at the repo root — load that, then a local one if present.
// Defaults are inline at every call site so the server still runs without one.
dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config();

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  DATABASE_FILE: process.env.DATABASE_FILE ?? "./data.db",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  NODE_ENV: process.env.NODE_ENV ?? "development",
};
