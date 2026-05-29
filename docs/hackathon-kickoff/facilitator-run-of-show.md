# BHS AI Builder Hackathon — Kickoff Facilitator Pack

Everything you need to run the opening session, plus gist-level explainers for the core concepts and ready-to-paste prompts for building the slides in Gamma. Students clone this repo, so this doubles as reference material they can re-read during the event.

- **Live demos** (run these in front of the room): Temperature, and Prompting + Skills.
- **Mini-lessons** (gist-level, ~2 min each): the concepts you listed, each with a teen-friendly analogy and a matching Gamma slide prompt.
- **Operational**: how to buy Claude API credits and hand out keys.
- **Slide prompts**: see `./gamma-prompts.md`.

---

## How this maps to your opening (09:00–10:30)

Your plan doc already breaks the opener into five parts. This pack slots straight into them:

| Your part | Time | This pack provides |
|---|---|---|
| 1. Why this matters | 15 min | (your story — not scripted here) |
| 2. The tool landscape | 20 min | "The stack we're using" + your existing "tools we're not using" table → Gamma prompt #2 |
| 3. Live build demo | 20 min | Optional: swap in the **Prompting + Skills** demo, or keep your own 15-min build |
| 4. Skills & MCP | 20 min | **Prompting + Skills** demo (the 3 quantum sites) → the payoff for this section |
| 5. Rules of engagement | 15 min | Hygiene rules cheat sheet (appendix) |

The **Temperature** demo is a great icebreaker right at the very top (Part 1) — it's a 3-minute live bit that needs no setup and gets every student participating.

---

## LIVE DEMO 1 — "What is Temperature?" (the *Hi* demo)

**Goal:** in 3 minutes, make "temperature," "deterministic vs. non-deterministic," and "when you'd want each" concrete — using the students themselves as the model.

### Run it

1. **The hook.** Walk the front row and say "Hi" to five different students. Let each respond naturally. You'll get: "Hi," "Hey, what's up," "Hello!", a wave, an awkward silence, a joke.
2. **The reveal.** "I gave every one of you the *exact same prompt* — the word 'Hi' — and I got five different answers. None of them is wrong. That variety? That's basically **temperature**."
3. **Now make it a knob.** "Imagine a dial on each of you. Turn it *down* and everyone answers 'Hello.' every single time — same word, no surprises. Turn it *up* and you get jokes, tangents, the occasional 'why are you talking to me.' That dial is temperature. Low = predictable. High = creative and varied (and occasionally off the rails)."
4. **Name the two modes.**
   - **Deterministic** (temperature ≈ 0): same input → same output, every time. Boring, but reliable.
   - **Non-deterministic** (temperature high): same input → different outputs. Creative, but you can't guarantee what you'll get.

### When would you use each? (kid-friendly examples)

**Turn it DOWN (deterministic) when there's one right answer and you need it to be the same every time:**
- A calculator or a unit converter (8 × 7 should never "feel creative").
- Pulling a specific fact out of a document, or formatting data into a table.
- Code that has to run the same way for everyone.
- A help bot that must follow the rules exactly (e.g. "what's the return policy?").

**Turn it UP (non-deterministic) when you *want* variety and there's no single right answer:**
- Brainstorming names for your app or club.
- Writing song lyrics, a story opening, or jokes.
- Coming up with 10 different marketing taglines so you can pick the best.
- Generating different dialogue for characters in a game so they don't all sound identical.

> **One-liner for the slide:** *Low temperature = a vending machine. High temperature = a jazz musician.*

### Optional live version (if you want to show it on a screen)

You can show the *same* prompt run at temperature 0 vs. temperature 1 using the API. This also previews the API-key setup you'll teach later. Minimal script (drop your event key in):

```bash
# temperature 0 — run it 3 times, you'll get (near-)identical output
for i in 1 2 3; do
  curl -s https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d '{"model":"claude-sonnet-4-6","max_tokens":40,"temperature":0,
         "messages":[{"role":"user","content":"Give me a name for a lemonade stand."}]}' \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['content'][0]['text'])"
done
# now change temperature to 1.0 and run again — you'll get 3 different names
```

The contrast on screen (3 identical answers, then 3 wildly different ones) lands the point hard.

---

## LIVE DEMO 2 — "Prompting + Skills = Superpowers" (the 3 quantum sites)

**Goal:** show two things at once — (1) AI does *what you tell it to*, so being explicit and directed pays off, and (2) skills + integrations turn a good result into a great one.

**The artifacts** are in this repo at `demos/quantum-physics/`. Each was built by an AI agent from one prompt, and **each site shows the exact prompt it was built from in a bar at the bottom of its home page.** Just open each `index.html` in a browser.

| Version | The prompt (paraphrased) | What you get |
|---|---|---|
| **v1** `demos/quantum-physics/v1/index.html` | "Build me a website about quantum physics." | A plain, correct, single-page info site. 5 sections, basic styling, no interactivity. *It did exactly what was asked — nothing more.* |
| **v2** `demos/quantum-physics/v2/index.html` | A detailed prompt: "interactive… fun and playful… use interaction to explain… so even middle schoolers get it." | "Quantum Quest" — 8 concepts, each with a hands-on mini-simulation (double-slit you can fire particle-by-particle, a superposition coin you collapse, an entanglement demo, a quiz). *Same model, vastly better result — because the prompt was specific.* |
| **v3** `demos/quantum-physics/v3/index.html` | The detailed prompt **plus** "use skills from hyperframe, and design principles from impeccable and taste (pull them from GitHub)." | A multi-level site (overview → topic pages → drill-in sub-concepts) that actually cloned three real open-source skill repos and applied their design + animation guidance. *Tools and skills the model reached out and grabbed = a different league.* |

### How to run the demo (≈4 minutes)

1. Open **v1** first. "Here's what 'build me a website about quantum physics' gets you. It's fine. It's correct. It's also kind of… nothing." Read the prompt in the bottom bar aloud.
2. Open **v2**. Click a couple of the interactive demos (fire the double-slit, collapse the superposition coin). "Same AI. The *only* difference is I told it what I actually wanted — interactive, playful, for middle schoolers. **Be explicit. Be directed. AI does what you say, not what you meant.**"
3. Open **v3**. Drill from the map into a topic, then into a sub-concept. "For this one I also told it to *go get tools* — real design skills published on GitHub. It downloaded them and used them. **This is the superpower: skills and integrations.** You'll have skills pre-installed in your starter repo today, and you can add more."

### The two lessons (put these on slides)

1. **Prompting.** AI is powerful but literal. A vague prompt gets a vague result; a specific, directed prompt gets a specific, great result. Say *what it does, who it's for, and what it should feel like.*
2. **Skills & integrations.** Out of the box the model only knows what it was trained on. Skills (pre-written expertise) and integrations/MCP (live tools and data) extend it — that's the jump from v2 to v3.

> **Honesty note for you:** v3 genuinely cloned `heygen-com/hyperframes`, `pbakaus/impeccable`, and `Leonxlnx/taste-skill` and applied their guidance (OKLCH color discipline, a real type pairing, purposeful/seekable animation, and deliberately avoiding "AI slop" design tells). If a sharp student asks "did it *really* download those?" — yes, it did.

---

## Gist-level concept mini-lessons

Two to four sentences each — just enough to "get it," because you'll spend the rest of the day in Claude Code, not on theory. Each has a teen analogy and a matching Gamma slide prompt (in `./gamma-prompts.md`).

### LLMs are a small slice of a much bigger field
AI is the big umbrella. **Machine learning (ML)** is the part of AI where computers learn patterns from examples instead of being hand-coded with rules. **Deep learning** (neural networks) is a slice of ML. **Large language models (LLMs)** like Claude are one kind of deep-learning model — trained on enormous amounts of text to predict the next chunk of words. Quick history: rules-based AI (1960s–80s) → statistical ML (1990s–2000s) → deep learning takes off (~2012, image recognition) → the Transformer architecture (2017) → ChatGPT moment (2022) → today's agentic tools (2024–26). *Analogy: AI is "all of sports," ML is "ball sports," LLMs are "basketball." Useful, dominant right now — but not the whole field.*

### Agents vs. chatbots
A **chatbot** talks: you ask, it answers, done. An **agent** *acts*: it can use tools, run commands, read and write files, check the result, and loop until the job is done — with you supervising. Claude Code is an agent: it doesn't just tell you how to build a feature, it edits the files and runs the app. *Analogy: a chatbot is a friend who gives you directions; an agent is a friend who gets in the car and drives.*

### Frontend vs. backend
**Frontend** is everything you see and click — buttons, colors, the layout in the browser. **Backend** is the part you don't see — where data is saved, rules are enforced, and the real work happens. In your starter repo: the **client** (React) is the frontend at `localhost:5173`; the **server** (Express + SQLite) is the backend at `localhost:3001`. *Analogy: a restaurant. Frontend = the dining room and menu. Backend = the kitchen and the fridge.*

### APIs
An **API** is a doorway one program uses to talk to another, with agreed-upon rules about what you can ask for and what you'll get back. Your frontend talks to your backend through an API. When your app uses Claude, it does so through Claude's API. *Analogy: a drive-through window. You don't walk into the kitchen — you use the window, say your order in the expected format, and food comes back.*

### Agentic frameworks / orchestrators (how Claude Code & Cursor work)
The model itself just produces text. The magic of tools like **Claude Code** and **Cursor** is the **orchestrator** wrapped around it: it reads your prompt, decides which tool to use (read a file, run a command, search docs), feeds the result *back* to the model, and repeats — a "think → act → observe → think again" loop — until the task is done. *Analogy: the model is a brilliant chef; the orchestrator is the kitchen manager handing them ingredients, tasting each dish, and sending it back until it's right.*

### Source control (Git) — "are we using it?"
**Yes.** Git takes snapshots ("commits") of your project so you can never truly lose work and can always go back. **GitHub** is where those snapshots live online. In this event, **every student works on their own branch** (`firstname-lastname`) — a personal copy where your changes can't break anyone else's. You'll commit after every working feature and push every few commits. *Analogy: Git is the "save points" in a video game; a branch is your own save file so your sibling's playthrough doesn't overwrite yours.*

### Planning before prompting
Thirty seconds of thinking beats ten chatty prompts. Before you ask Claude to build something, say it in 3–4 sentences: **what it does, who it's for, and what it should look like.** Scope it small enough to finish today. *Analogy: you wouldn't tell a contractor "build me a house" and walk away — you'd describe the rooms first.* (This is also why v2 crushed v1 in the demo above.)

---

## The stack we're using (gist tour)

You're teaching one workflow, not twenty. Here's the whole stack in one line each — enough to gist it, then you live in Claude Code.

| Piece | What it is, in one line |
|---|---|
| **Claude Code (in the desktop app)** | The AI agent you talk to all day — it writes, runs, and previews your app for you. |
| **React (+ Vite + TypeScript)** | The **frontend**: how you build the screens people see. Vite makes it refresh instantly; TypeScript catches typos before they bite. |
| **Express (+ better-sqlite3 + Zod)** | The **backend**: the API server, a one-file database, and a validator that checks incoming data. |
| **SQLite** | Your database is literally one file (`data.db`). No setup, no cloud, no Postgres. |
| **npm workspaces** | Runs the frontend and backend together with one command: `npm run dev`. |
| **Biome** | Auto-formats and tidies your code on save so it always looks clean. |
| **Git + GitHub** | Saves and shares your work; each student on their own branch. |
| **Context7 (an MCP server)** | A live "look up the current docs" tool so Claude doesn't use outdated patterns. |

Pair this with your existing "tools we're **not** using and why" table (Cursor, Copilot, Lovable, Bolt, Base44, Replit) — that contrast is great for Part 2. (Gamma prompt #2 builds both into slides.)

---

## Buying & handing out Claude API credits (operational)

**Short answer to "against what account?":** not your claude.ai chat subscription — you set this up in the **Anthropic / Claude Developer Console** at **console.anthropic.com**, signed in with an account *you* control. It uses the same Anthropic login, but billing, credits, and API keys live in the Console, separate from the chat app. For clean event accounting, consider a dedicated account (or at least a dedicated **Workspace**) for the hackathon.

**The setup (≈15 minutes, do it the week before):**

1. **Sign in** at console.anthropic.com with the account that will own the event.
2. **Add billing** under *Billing*. Anthropic is pay-as-you-go — it charges the card for usage (you can also pre-load credits). A small initial credit gets you a working key immediately.
3. **Create a Workspace** named e.g. `BHS Hackathon May 2026`. Workspaces isolate usage and let you set a **workspace-level hard spend cap** (e.g. €600) — your safety net.
4. **Generate API keys inside that workspace.** Two valid options — pick whichever is less hassle for you:
   - **Per-student keys** (`student-01` … `student-20`), each with its own spend cap (~€30). Best visibility into who's spending what; matches your plan doc.
   - **One shared key** for everyone. Simpler to hand out; you lose per-student breakdown and one key can drain faster — lean on the workspace cap.
   - Keys are **scoped to the workspace they're created in** and can't be moved later, so create them in the event workspace from the start. Copy each key when created — it's shown only once.
5. **Hand keys out in person** at the setup clinic. Students paste the key (starts with `sk-ant-`) into Claude Code / Claude Desktop using the **"enter API key"** auth option (not "log in with my account"). Usage then draws from your pooled budget, not their personal accounts.
6. **Watch the usage dashboard** live during the event; if a key nears its cap you'll see it and can bump it.

**Footguns to avoid:**
- Don't tell students to authenticate Claude Code with a personal **Pro/Max subscription** for this — that bills the wrong place and defeats the pooled budget. Use the **API key you give them**.
- Don't paste keys into code or push them to GitHub. If one leaks, **rotate it** in the Console (that's the whole point of separate keys).
- Your plan doc's numbers (≈€8–12/student for a typical Sonnet day, €30/key cap, €600 workspace cap) line up with how the Console actually works today — that structure is sound.

*Sources: see the bottom of this doc.*

---

## More quick-win kickoff demo ideas

Short, high-impact bits you can sprinkle in:

- **"Same prompt, three models" race.** Ask Haiku, Sonnet, and Opus the same small question side by side. Point: pick the cheapest model that's good enough (ties to your Sonnet-by-default rule). Great lead-in to the budget talk.
- **The "paste the error" reflex.** Intentionally break something tiny, then paste the *exact* error into Claude vs. describing it vaguely. The verbatim error gets a one-shot fix; the vague description starts a guessing game. Sells hygiene Rule #3 instantly.
- **"Watch it think" walkthrough.** During your live build, narrate the agent loop out loud: "see — it wrote the file, ran it, saw the error, and is now fixing itself." Demystifies what an agent is.
- **Scope-creep theater.** Take a student's over-ambitious idea ("an AI social network") and shrink it live to a one-day version ("a poll your friends can vote on"). Teaches scoping, which is the #1 thing that derails day-of.
- **Deploy-and-text-it.** At the very end, drag a finished folder into Netlify Drop, get a URL, and text it to someone in the room. The "it's real and on the internet" moment is the emotional high of the day.

---

## Appendix — the five hygiene rules (cheat sheet)

These are from your plan; reprinted here so they're in the repo students clone.

1. **Default to Sonnet, not Opus.** Sonnet handles ~95% of hackathon work and is far cheaper. Opus only for genuinely hard reasoning.
2. **Start a fresh chat when you finish a feature.** Long chats get expensive; carry over a short summary.
3. **Paste error messages exactly.** Don't describe — copy/paste the literal error.
4. **One clear spec beats ten chatty prompts.** Say what it does, who it's for, what it looks like — up front.
5. **Watch the preview, not just the code.** Click through every feature after it's built.

---

## Sources (API credits & keys)

- [Creating and managing Workspaces in the Claude Console — Claude Help Center](https://support.anthropic.com/en/articles/9796807-creating-and-managing-workspaces)
- [Workspaces — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/workspaces)
- [How to Get Your Claude (Anthropic) API Key — Apideck](https://www.apideck.com/blog/how-to-get-your-claude-anthropic-api-key)
- [Anthropic API Pricing in 2026 — Finout](https://www.finout.io/blog/anthropic-api-pricing)
- [Authentication: API Keys, Subscriptions, and SSO — Claude Code Developer Toolkit](https://developertoolkit.ai/en/claude-code/quick-start/authentication/)
