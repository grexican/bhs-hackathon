# CLAUDE.md

This file is read automatically every time the student opens this project in Claude Code. It's the single source of truth for how to behave inside this repo. Anything in another file that conflicts with this one — this one wins.

## Who you're working with

The student is a **high school participant in the BHS AI Builder Hackathon**. Most have never written code before. They have 24 hours to ship a working web app, on their own branch, that they can demo at the end and keep building afterward.

Your job is to help them ship something they can be proud of, using as few API credits as possible, without overwhelming them with engineering jargon.

## The stack

- **`apps/client/`** — React 18 + Vite + TypeScript. The thing the student sees in the browser at http://localhost:5173.
- **`apps/server/`** — Express + better-sqlite3 + Zod + TypeScript. The API at http://localhost:3001. The database is one file: `apps/server/data.db`.
- **One database file, one running server, one running client.** No Docker, no Postgres, no auth, no deployment plumbing. Plain SQLite.
- **npm workspaces** (not pnpm, not yarn). `npm run dev` from the repo root starts everything.
- **Biome** for lint + format (replaces ESLint + Prettier). VS Code is set to format on save.

## Hygiene rules — reinforce these proactively

These are the practices that keep the student productive and inside their API budget. The pre-installed skills (`.claude/skills/`) will trigger on relevant phrases; reinforce them in your replies too.

1. **Default to Sonnet.** Don't push for Opus unless the task is genuinely hard reasoning (algorithm design, deep multi-step debugging). For "build me a feature" / "fix this bug" / "style this nicer", Sonnet is correct.
2. **Suggest a fresh chat at feature boundaries.** When a feature ships, when conversation crosses ~20 turns, when the student says "moving on to…" — offer a paste-ready handoff summary and recommend starting a new chat.
3. **Get the literal error before guessing.** If the student says "it's broken", ask for the exact error message or a screenshot. Then propose a hypothesis in plain English before writing any fix.
4. **Build the smallest version first.** When asked for a feature, ship the minimum working version, show the student, then ask what to add.
5. **Plain-English code comments.** Every function or route or component gets a one-line comment explaining what it does in everyday language so the student can read their own code tomorrow.
6. **Commit often, push every few commits.** After meaningful work, suggest `/wrap` (or run the git commands directly if the student says "commit it").

## Architecture rules — when writing code

- **One thing per file.** One component per `.tsx`. One route file per resource. Easier for a non-coder to navigate.
- **Server routes follow the `todos.ts` pattern.** Zod schema → `safeParse(req.body)` → 400 on failure → `db.prepare(...).run/get/all()` → JSON response. Don't invent new patterns; copy this one.
- **Client features follow the `useTodos.ts` pattern.** Custom hook owns the state, components stay dumb. Optimistic updates with rollback on error.
- **Server uses `better-sqlite3` (synchronous).** Never wrap `db.prepare()` calls in `await`. They return immediately.
- **Validation lives at the API boundary.** Validate request bodies with Zod, not inside the React form. Forms should feel forgiving; the API should be strict.
- **The API response shape is `{ ok: true, data: T } | { ok: false, error: ... }`.** Keep this consistent. The client's `api` wrapper depends on it.
- **No auth.** This is a hackathon starter. If the student's app needs to "remember the user", hardcode `userId = 1` and tell them they can add real login after the event.

## Code style

- **Comments explain WHY, not WHAT.** The variable names should already say what. A good comment captures a non-obvious reason: "skip mid-stream snapshots — debounced saver writes the final state", "optimistic update: roll back on failure".
- **No comment-only lines that restate the next line.** No "// set x to 5" above `const x = 5;`.
- **No empty `try/catch`** — surface errors so the student sees them.
- **Prefer plain CSS over Tailwind/CSS-in-JS.** Class names follow a relaxed BEM pattern: `.block__element--modifier`.
- **Zod for runtime validation.** Don't reach for Joi or class-validator.

## When the student says…

| The student says | You do |
|---|---|
| "Build me a [thing]" | Smallest working version first. Show them. Ask what to add. (See `start-simple` skill.) |
| "It's broken" / "doesn't work" / "error" | Ask for the exact error message or a screenshot first. Then propose a hypothesis. Then fix. (See `debug-preventer`.) |
| "Move on to [next thing]" | Offer a fresh-chat handoff summary. (See `fresh-chat-coach`.) |
| "Commit it" / "ship it" / "wrap up" | Run `/wrap`. With or without push depending on what they said. |
| "Push to GitHub" | `git push` (with `-u origin <branch>` on first push). Never push to `main`. |
| "It's slow" / "I'm running out of credits" | Suggest caveman mode (`/caveman`) and remind them to use Sonnet. |
| "Add [external service]" | Confirm the service, ask for the API key, store it in `.env` (gitignored), add `process.env.KEY` reads in `apps/server/src/`. |
| "Deploy it" | Vercel for the React app, or Render / Fly.io for the full stack. Walk them through it; don't just dump commands. |

## What NOT to do

- **Don't use `git add -A` or `git add .`** if `git status` shows unrelated changes. Always check first.
- **Don't commit `.env`, `*.db`, `node_modules/`.** The `.gitignore` covers these — but if they show up in `git status`, refuse and tell the student.
- **Don't push to `main` or `master`.** Every student should be on `firstname-lastname`. If they're somehow on main, stop and tell them to switch.
- **Don't `git push --force`** under any circumstance.
- **Don't add features the student didn't ask for.** "While I'm here, I also added…" is the wrong instinct.
- **Don't write multi-paragraph docstrings.** One line is enough.
- **Don't add `try/catch` around code that doesn't actually throw.** Trust the framework.
- **Don't refactor surrounding code while fixing a bug.** One fix at a time.
- **Don't fabricate fake data, fake API responses, or mocked metrics in production code.** Use real data or a real API; if it's not ready, say so plainly.
- **Don't reach for Postgres, Docker, Redis, or any heavyweight infra.** SQLite is the answer.

## Pre-installed skills (auto-loaded)

These live in `.claude/skills/`. They trigger on relevant phrases — you don't need to invoke them explicitly, but their guidance is always live:

- **`start-simple`** — minimum working version first
- **`debug-preventer`** — get the exact error before fixing
- **`fresh-chat-coach`** — suggest a new chat at feature boundaries
- **`explain-like-new`** — plain-English code comments
- **`git-hygiene`** — commit often, push every few commits, never to `main`
- **`model-discipline`** — Sonnet by default, Opus only when needed
- **`caveman`** — opt-in ultra-compressed mode for token savings

## Pre-installed slash commands

- **`/onboard`** — first-time setup walkthrough. Asks the student a few questions, configures git, creates their branch, personalizes the README, makes the first commit, and optionally pushes. Friendlier alternative to the terminal-based `npm run onboard`.
- **`/wrap [push | no push]`** — review the diff, write a conventional-commit message, commit, optionally push. The right way to finish a piece of work.

## Commit cadence — DON'T over-commit

The right cadence is **change → run and verify it works → commit and push as one act.** NOT change → commit → push → discover bug → fix → commit again.

A "commit moment" is when something coherent now works. Not when you typed a line of code. If you're in the middle of building and the preview hasn't been reloaded yet, **wait** — finish the change, see it work, then commit.

Full rules in `AGENTS.md`.

## Scratch space

`tmp/` is gitignored (except for the `.gitkeep` placeholder). Use it as scratch — drafts, throwaway scripts, working notes. Anything in there is invisible to git. Never put production code there.

## MCP servers

`.mcp.json` configures one server:

- **`context7`** — fetches current documentation for any library or framework. Add `use context7` to a prompt when you want Claude to look up docs (especially for fast-moving libraries like Vite, Express, React).

## Project context

- **Event**: Barcelona High School AI Builder Hackathon, May 30-31 2026 (setup meetup May 29).
- **Branch convention**: `firstname-lastname` per student.
- **Goal**: every student ships a working app at a public URL by the end of Sunday morning.
