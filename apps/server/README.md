# Server

Express + TypeScript + better-sqlite3. The API your React app talks to.

## Run

```bash
# from the repo root
npm run dev:server     # just the server
npm run dev            # client + server together
```

Server boots at http://localhost:3001.

## What's here

```
apps/server/
├── db/
│   └── schema.sql           # tables — applied on every server start (idempotent)
├── src/
│   ├── index.ts             # buildApp() — Express bootstrap
│   ├── db.ts                # opens SQLite, applies schema
│   ├── env.ts               # process.env reader with defaults
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   └── notFoundHandler.ts
│   └── routes/
│       ├── health.ts        # GET /api/health
│       └── todos.ts         # CRUD example (GET/POST/PATCH/DELETE /api/todos)
├── tests/
│   └── routes/todos.test.ts # supertest hits buildApp() in-process
└── data.db                  # gitignored — your SQLite database
```

## Add your own resource

The `todos` route is the canonical example. To add a new resource (e.g. flashcards):

1. **Add a table** in `db/schema.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS flashcards (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     question   TEXT NOT NULL,
     answer     TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```

2. **Add a route file** at `src/routes/flashcards.ts`. Copy `todos.ts` as a starting point — same pattern with Zod schema + db.prepare().

3. **Mount it** in `src/index.ts`:
   ```ts
   import { flashcardsRouter } from "./routes/flashcards.js";
   app.use("/api/flashcards", flashcardsRouter);
   ```

4. **Restart the server** (Ctrl+C and `npm run dev:server` again, or it auto-restarts via tsx watch).

5. **Test it** with `curl http://localhost:3001/api/flashcards` or by adding a Vitest spec under `tests/`.

## Why better-sqlite3 (not sqlite3, not Prisma)

- **Synchronous API** — `db.prepare(...).all()` returns immediately. No callbacks, no async. Easier to read and reason about.
- **No code-generation step** — write SQL, get rows. No `prisma generate`, no schema-to-types pipeline.
- **One file is your database** — `data.db` in this folder. Delete it to wipe; copy it to back up.
- **Fast** — actually faster than the async `sqlite3` driver for most workloads.

For a 24-hour hackathon this is the right tradeoff. For a 24-month production app, look at Drizzle or Prisma.

## Why no auth

The starter has no login system on purpose. Adding auth properly takes hours, distracts from shipping, and is rarely the point of the student's project. If your app needs to "remember the user", start with a hard-coded `userId = 1` and revisit later.
