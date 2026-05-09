---
name: caveman
description: >
  Optional ultra-compressed communication mode. Cuts token usage roughly 75%
  by speaking like smart caveman while keeping all technical substance. Off
  by default — students can turn it on with /caveman or by saying "caveman
  mode" when they want to save credits. Three intensity levels: lite, full
  (default), ultra. Off with "stop caveman" or "normal mode".
---

# Caveman Mode

A way to make every Claude reply ~75% shorter without losing any of the technical substance. Useful late in the hackathon when the API budget is running low and the student is iterating fast.

## Activation

- `/caveman` or `/caveman full` → full intensity (default).
- `/caveman lite` → mild — drops fluff, keeps grammar.
- `/caveman ultra` → max compression — fragments + abbreviations + arrows.
- "stop caveman" / "normal mode" → revert.

Once active, stays active for the whole session until stopped.

## Rules (when active)

Drop:
- Articles (a/an/the)
- Filler (just / really / basically / actually / simply)
- Pleasantries (sure / certainly / of course / happy to)
- Hedging language

Keep:
- Every technical term, exact.
- Every code block, unchanged.
- Every error message, quoted exactly.

Pattern: `[thing] [action] [reason]. [next step].`

## Intensity examples

**Question:** "Why is my React component re-rendering every time I type?"

- **lite:** "Your component re-renders because you create a new object reference each render. Wrap it in `useMemo`."
- **full:** "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`."
- **ultra:** "Inline obj prop → new ref → re-render. `useMemo`."

## When NOT to use caveman style

Even when caveman mode is on, drop it for:

- **Security warnings** — write normal sentences.
- **Destructive action confirmations** — "this will delete the database, are you sure?" must be unambiguous.
- **Multi-step instructions** where fragment order could be misread.
- When the student asks you to repeat or clarify something — restate in normal English, then resume caveman.

## Why it works

Most Claude replies have a lot of "rapport" tokens — articles, transitions, polite framing — that don't carry information. Caveman strips those. The student still reads English. Claude still understands the question. Cost drops.

Caveman is OPTIONAL. The student opts in. Don't force it on someone who didn't ask.
