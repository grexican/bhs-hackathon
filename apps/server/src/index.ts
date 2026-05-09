import cors from "cors";
import express, { type Express } from "express";
import morgan from "morgan";

import { env } from "./env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFoundHandler.js";
import { healthRouter } from "./routes/health.js";
import { todosRouter } from "./routes/todos.js";

// Build the Express app. Exported so tests can hit it via supertest without
// actually opening a port.
export function buildApp(): Express {
  const app = express();

  // Allow the React dev server (default port 5173) to call this API in dev.
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

  // Parse incoming JSON bodies. 1 MB is plenty for a hackathon app.
  app.use(express.json({ limit: "1mb" }));

  // Tiny request log — comment out if you find it noisy.
  if (env.NODE_ENV !== "test") {
    app.use(morgan("dev"));
  }

  // Mount the routes.
  app.use("/api/health", healthRouter);
  app.use("/api/todos", todosRouter);

  // 404 + error handlers run after every other route. Order matters.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Boot the server unless we're running under vitest (tests import buildApp()
// directly via supertest and don't want the port bound).
if (!process.env.VITEST) {
  const app = buildApp();
  app.listen(env.PORT, () => {
    console.log(`API listening at http://localhost:${env.PORT}`);
    console.log(`Database: ${env.DATABASE_FILE}`);
  });
}
