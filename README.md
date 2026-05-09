# BHS Hackathon Starter

Welcome to the **Barcelona High School AI Builder Hackathon**.

This is the starter repo every student forks. In the next 24 hours you will turn it into your own working web app — a flashcard trainer, a workout tracker, a study planner, a game, whatever you want — and ship it to a real URL you can share.

You don't need to know how to code. You need to know how to describe what you want, click around, and pay attention. Claude does the rest.

---

## What you need installed

Four things, all free:

1. **VS Code** — your code editor → [code.visualstudio.com](https://code.visualstudio.com/)
2. **Claude Desktop** — the AI assistant you'll be talking to all day → [claude.com/download](https://claude.com/download)
3. **Node.js 22 or newer** — runs your app → [nodejs.org](https://nodejs.org/)
4. **Git** — saves your work → [git-scm.com/downloads](https://git-scm.com/downloads)

If anything in the install gives you trouble, come to the **Friday May 29 setup meetup** — that's exactly what it's for.

---

## Get the code on your computer

In a terminal (the Terminal app on Mac, or PowerShell on Windows):

```bash
# Replace [your-folder] with wherever you want it (e.g. ~/projects)
cd [your-folder]
git clone https://github.com/grexican/bhs-hackathon.git my-hackathon
cd my-hackathon
```

---

## One command to set up everything

From inside the `my-hackathon` folder, run:

```bash
npm install
npm run onboard
```

That second command walks you through the entire first-time setup:

- Configures git with your name and email
- Creates your own personal branch (so your work doesn't bump into anyone else's)
- Personalizes the README with your name
- Makes your first commit
- Optionally pushes it to GitHub

It explains every step in plain English **before** doing anything, and asks before anything goes online. Should take about 2 minutes.

> **Prefer to chat your way through setup instead?** Open the project in Claude Desktop's Code tab and run `/onboard` — Claude will walk you through the same flow conversationally.

---

## Run it

From inside the `my-hackathon` folder:

```bash
npm run dev
```

Two things will start:
- **Server** at http://localhost:3001 — your backend (Express + SQLite database)
- **Client** at http://localhost:5173 — your React app (open this in a browser)

Both the client and the server **auto-reload** on every file save — no need to restart anything as you build.

Open http://localhost:5173 in your browser. You should see a working todo list. Add a todo, check it off, delete it, refresh the page — it persists. That's because the data is stored in a real SQLite database file (`apps/server/data.db`).

---

## Open the project in Claude Code

1. Open Claude Desktop.
2. Switch to the **Code** tab.
3. Start a new session and point it at the `my-hackathon` folder.
4. Claude will read `CLAUDE.md` automatically and load the pre-installed skills.

Now you're ready to build. Try saying:

> _"Replace the todos demo with a flashcard app for studying chemistry. Each card has a question and an answer, and I can flip the card to see the answer."_

Watch what happens.

---

## What's in this repo

```
my-hackathon/
├── apps/
│   ├── client/          ← The React app you see in the browser
│   └── server/          ← The Express + SQLite backend
├── .claude/             ← Pre-installed skills + the /wrap command for Claude
├── .vscode/             ← Editor settings (format on save, etc.)
├── CLAUDE.md            ← Instructions Claude reads automatically
├── AGENTS.md            ← How to commit and push your work
├── README.md            ← This file
└── package.json         ← Project config and npm scripts
```

You can ignore most of it. The two folders that matter are `apps/client/` and `apps/server/`. Each has its own README explaining what's inside.

---

## The five rules of the road

These will save you time and credits. They're also reinforced by the pre-installed skills, so Claude will gently remind you when you slip.

### 1. Default to **Sonnet**, not Opus
Sonnet is the cheaper model. It handles 95% of what you'll do today. Use Opus only when you're stuck on something genuinely complicated.

### 2. **Start a fresh chat** when you finish a feature
Long conversations get expensive. When something works and you're moving on, start a new Claude Code chat. Claude will offer you a paste-ready summary.

### 3. **Paste error messages exactly**
When something breaks, copy the literal error and paste it. Don't describe it in your own words. Pasting works on the first try; describing leads to a guessing game.

### 4. **One clear spec beats ten chatty prompts**
Before asking for a feature, write what you want in 3-4 sentences: what it does, who uses it, what it looks like. One thorough prompt produces better code than ten "wait, also…" follow-ups.

### 5. **Watch the preview, not just the code**
Claude's job is to make something that works. Your job is to notice when it doesn't. Click through every feature after it's built. Catching bugs in the moment is way cheaper than catching them an hour later.

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start client + server together |
| `npm run dev:client` | Just the React app |
| `npm run dev:server` | Just the Express API |
| `npm run build` | Build for production |
| `npm test` | Run all the tests |
| `npm run typecheck` | Check that the TypeScript types are happy |
| `npm run lint` | Find code style issues |

When you finish something, commit and push:

```bash
git add .
git commit -m "feat: add flashcard flip animation"
git push
```

…or just tell Claude **"`/wrap` with push"** and it'll do all of that for you.

---

## When you get stuck

1. **Paste the exact error** to Claude.
2. **Try a fresh chat** — sometimes long conversations get confused.
3. **Find a mentor.** Look up. There's almost certainly one nearby.

You're going to ship something today. We're glad you're here.
