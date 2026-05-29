# Gamma slide prompts — BHS Hackathon kickoff

Copy any block below into Gamma (gamma.app → "Generate") to draft that part of the opening deck. They're written so Gamma produces teen-friendly, low-text, visual slides. Tweak the bracketed bits. Order them however you present.

> Tip: keep slides sparse — one idea per slide, big visuals, you do the talking. Tell Gamma "minimal text per slide, large visuals, speaker notes for the rest."

---

## 0. Whole-deck prompt (fastest path — generates the full opener)

```
Create a punchy, visually bold opening keynote for a high school AI Builder Hackathon. Audience: ~20 teenagers, most have never coded. Tone: energetic, encouraging, a little irreverent. Minimal text per slide, large visuals, put detail in speaker notes.

Cover, in this order:
1. Title: "BHS AI Builder Hackathon — build something real in a day."
2. Why this matters now: in the last year, you no longer need to know a programming language to build real software; you need to think clearly and direct an AI well.
3. What you'll leave with: a working app at a real URL, your own code on GitHub, and credits to keep building.
4. The AI coding tool landscape: Claude Code (what we use) vs Cursor, GitHub Copilot, Lovable, Bolt, Base44, Replit Agent — one line each on what they're good at and why we picked Claude Code.
5. The stack you'll use today, in plain English: Claude Code, React (the screens), Express + SQLite (the data), Git/GitHub (saving + sharing), one command to run it all.
6. Temperature: same prompt, different answers — when you want a reliable machine vs a creative jazz musician.
7. Prompting: AI does what you SAY, not what you MEAN. Be specific and directed.
8. Skills & integrations: how giving the AI extra tools turns a good result into a great one.
9. The 5 rules of the road: default to Sonnet, fresh chat per feature, paste errors exactly, one clear spec, watch the preview.
10. Close: "Ship something you can text to your family by tomorrow morning."

Use a dark, high-contrast, slightly retro-technical look. Speaker notes on every slide.
```

---

## 1. Temperature (deterministic vs non-deterministic)

```
Make 3-4 slides explaining "temperature" in AI to high schoolers with no math.
- Slide 1: "Same prompt, different answers." Visual idea: one question going into a machine, several different answers coming out.
- Slide 2: Temperature is a dial. LOW = predictable, same answer every time (a vending machine). HIGH = creative and varied, occasionally off the rails (a jazz musician).
- Slide 3: When to turn it DOWN (one right answer): calculators, pulling facts from a document, code, a rules-following help bot.
- Slide 4: When to turn it UP (you want variety): brainstorming names, writing lyrics or stories, 10 marketing taglines, varied game-character dialogue.
Minimal text, bold visuals, speaker notes. Dark technical aesthetic.
```

## 2. The tool landscape + the stack we use

```
Make a slide set introducing AI coding tools and our chosen stack to non-coder high schoolers.
- One slide: a simple comparison of Claude Code vs Cursor, GitHub Copilot, Lovable, Bolt, Base44, Replit Agent — one short line each, and a callout that we chose Claude Code for its skills + MCP ecosystem and beginner-friendly desktop app.
- One slide per stack piece, one plain-English line each: Claude Code (the AI agent you talk to), React (the screens you see), Express + SQLite (where data lives — your database is one file), Git + GitHub (save points + sharing, everyone on their own branch), "npm run dev" (one command runs everything), Context7 (a tool that fetches up-to-date docs).
Use the restaurant analogy where helpful (frontend = dining room, backend = kitchen). Minimal text, speaker notes, dark technical look.
```

## 3. LLMs are a slice of a bigger field (with a quick history)

```
Make 2-3 slides showing how today's AI fits together, for teenagers.
- Nested-circles visual: AI > Machine Learning > Deep Learning > Large Language Models (Claude is an LLM).
- Analogy slide: AI = "all of sports", ML = "ball sports", LLMs = "basketball" — dominant right now, but not the whole field.
- A simple timeline: rules-based AI (1960s-80s) → statistical ML (1990s-2000s) → deep learning takes off (~2012) → the Transformer (2017) → ChatGPT moment (2022) → agentic tools (2024-26).
Minimal text, one strong visual per slide, speaker notes.
```

## 4. Agents vs chatbots

```
Make 1-2 slides contrasting a chatbot and an AI agent for high schoolers.
Chatbot = it talks: you ask, it answers, done. Agent = it acts: it uses tools, runs commands, edits files, checks the result, and loops until the job is done, with you supervising.
Analogy: a chatbot gives you directions; an agent gets in the car and drives. Note that Claude Code is an agent.
Minimal text, a clear two-column visual, speaker notes.
```

## 5. Frontend vs backend

```
Make 1 slide explaining frontend vs backend to non-coders using a restaurant analogy.
Frontend = the dining room and menu — what you see and click (React, at localhost:5173). Backend = the kitchen and fridge — where data is stored and the real work happens (Express + SQLite, at localhost:3001). They talk to each other through an API (the order window). Minimal text, one clean diagram, speaker notes.
```

## 6. APIs

```
Make 1-2 slides explaining what an API is to teenagers with no coding background.
An API is a doorway one program uses to talk to another, with agreed rules for what you can ask and what you get back. Analogy: a drive-through window — you don't walk into the kitchen, you use the window, order in the expected format, and food comes back. Mention: your app's frontend talks to its backend through an API, and when your app uses Claude it goes through Claude's API. Minimal text, one diagram, speaker notes.
```

## 7. Agentic frameworks / orchestrators (how Claude Code & Cursor work)

```
Make 1-2 slides explaining the "agent loop" / orchestrator behind tools like Claude Code and Cursor, for beginners.
The model only produces text; the orchestrator around it reads your prompt, picks a tool (read a file, run a command, search docs), feeds the result back to the model, and repeats: think → act → observe → think again, until the task is done.
Analogy: the model is a brilliant chef; the orchestrator is the kitchen manager handing it ingredients, tasting each dish, and sending it back until it's right. Visual: a labeled loop diagram. Minimal text, speaker notes.
```

## 8. Source control / Git

```
Make 1-2 slides introducing Git and GitHub to non-coders.
Git takes snapshots ("commits") of your project so you can't lose work and can rewind. GitHub stores those snapshots online and lets you share. In this event everyone works on their own branch (firstname-lastname) so no one breaks anyone else's work.
Analogy: Git is the save points in a video game; a branch is your own save file. Mention the rhythm: commit after every working feature, push every few commits. Minimal text, simple visual, speaker notes.
```

## 9. Planning before prompting

```
Make 1 slide on planning before prompting, for beginners building with AI.
Thirty seconds of thinking beats ten chatty prompts. Before asking the AI to build something, say it in 3-4 sentences: what it does, who it's for, what it should look like — and scope it small enough to finish today.
Analogy: you wouldn't tell a contractor "build me a house" and walk away; you'd describe the rooms first. Minimal text, speaker notes.
```

## 10. The 5 hygiene rules (the "rules of the road")

```
Make a single bold slide titled "5 Rules of the Road" for an AI hackathon, one line each:
1. Default to Sonnet, not Opus (cheaper, handles ~95% of the work).
2. Start a fresh chat when you finish a feature (long chats get expensive).
3. Paste error messages exactly (don't describe them).
4. One clear spec beats ten chatty prompts.
5. Watch the preview, not just the code.
Big numbered list, minimal extra text, dark technical aesthetic, speaker notes that expand each rule.
```

---

### Want this auto-built?
These are written to paste into Gamma yourself. If you'd rather, I can generate a starter deck for you directly and hand back an editable Gamma link — just say the word and which sections you want.
