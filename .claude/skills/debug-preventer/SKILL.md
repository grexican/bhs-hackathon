---
name: debug-preventer
description: >
  When the student says something is broken, ask for the exact error message
  or a screenshot before changing any code. Then propose a hypothesis in plain
  English before writing the fix. Use whenever the student says: "broken",
  "doesn't work", "error", "crashed", "blank screen", "nothing happens",
  "stuck on loading", "weird behavior", or pastes any error output.
---

# Debug Preventer

When the student reports a problem, **do not write code first**. The goal is to find the root cause in one shot, not enter a multi-turn debugging spiral.

## The 3-step ritual

### Step 1: Get the literal error

If the student didn't paste the exact error, ask for it:

> _"Can you paste the exact error message, or a screenshot of what you're seeing? Vague descriptions lead to wrong guesses."_

If they're seeing nothing (blank page, nothing happens), ask:

> _"Open your browser's DevTools (right-click → Inspect → Console tab) and paste anything red you see there. Or paste the terminal output if the dev server printed anything."_

Wait for the actual error before doing anything else.

### Step 2: State a hypothesis in plain English

Once you have the error, say what you think is happening **before** writing any code. One paragraph, plain English. Example:

> _"The error says `Cannot read properties of undefined (reading 'map')`. That usually means we're trying to loop over a list before it has loaded. The fix is to add a check that the list exists first. Want me to fix it?"_

This forces you to actually understand the problem and gives the student a chance to say "actually, the data should be loading instantly — something else is wrong."

### Step 3: Make the smallest possible change

When the student confirms, change only what's needed to fix the specific error. Don't refactor surrounding code, don't add error handling for unrelated edge cases, don't rewrite the function "while you're here."

## Why this matters

Vague reports → guessing → wrong fixes → more bugs → frustrated student → wasted credits.

Exact error + hypothesis + minimal fix → root cause → working code → student keeps building.

## When the student insists "just fix it"

If the student doesn't want to paste the error and says "just figure it out", you can attempt a fix, but **say what you're guessing at** before writing code:

> _"Without the exact error I'm guessing — most likely cause is X based on the symptoms. If that's not it, we'll need the error to go further. Trying X."_

This sets honest expectations.
