---
name: fresh-chat-coach
description: >
  At natural transitions — finishing a feature, moving to a new section of the
  app, after a long debug session — proactively suggest the student start a
  new Claude Code chat. Provide a one-paragraph summary and the current state
  of key files so they can paste it into the next session. Trigger when: a
  feature ships, the conversation crosses ~20 turns, or the student says
  "moving on to…", "next I want to…", "now let's build…".
---

# Fresh Chat Coach

Long Claude Code conversations get **expensive and slow**. Every message includes the entire history, so message #50 costs 5–10× message #5. Fresh chats reset the cost.

## When to suggest a fresh chat

Say "this is a good moment for a fresh chat" when ANY of these is true:

1. **A feature just shipped.** Login works, the todo list works, the timer works — that piece is done. Before starting the next piece, suggest a fresh chat.
2. **Conversation has crossed ~20 turns.** Each turn is a back-and-forth. If you've been chatting a while, suggest it.
3. **The student says they're moving on.** "OK now I want to add…", "next let's build…", "moving on to the…" — perfect moment.
4. **A long debug session just ended with a fix.** Whew, it works. Don't carry that debugging history into the next feature.

## How to suggest it

Don't be preachy. One short suggestion + a paste-ready handoff:

> **Good moment for a fresh chat.** Long conversations get expensive — every new message includes the whole history. Here's a paste-ready summary you can drop into a new chat to keep going:
>
> ```
> ## What I'm building
> A flashcard app for studying chemistry. Single-page React app with an Express backend and SQLite database.
>
> ## What's working
> - Cards display with question on front, answer on back
> - Click to flip
> - Next/previous buttons cycle through cards
> - Cards are stored in the database via the /api/cards endpoint
>
> ## What I'm doing next
> Adding a form to create new cards. Should save to the database and refresh the list.
>
> ## Files I'm working on
> - apps/client/src/components/FlashcardForm.tsx (new)
> - apps/server/src/routes/cards.ts (already has GET, need POST)
> ```
>
> _Open a new Claude Code chat and paste that as your first message. I'll pick up where I left off._

## How to format the handoff

Four sections, every time:
- **What I'm building** — one sentence, the whole project.
- **What's working** — bullet list of features that already ship.
- **What I'm doing next** — the very next thing, one or two sentences.
- **Files I'm working on** — paths only, no code dumps.

If specific code matters for the next step (a tricky function, a custom hook the new code needs to call), include just that one snippet.

## What NOT to do

- Don't suggest a fresh chat after every single message — only at the natural breakpoints above.
- Don't include the whole conversation in the handoff. Summarize.
- Don't paste hundreds of lines of code into the handoff. The student's project files are still on disk; the new session will read them as needed.
