import dotenv from "dotenv";

// Load .env from the repo root (two levels up from apps/server/).
// Defaults are inline at every call site so the server still runs without one.
dotenv.config();

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  DATABASE_FILE: process.env.DATABASE_FILE ?? "./data.db",
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  NODE_ENV: process.env.NODE_ENV ?? "development",
};
