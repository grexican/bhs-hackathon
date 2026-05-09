---
name: start-simple
description: >
  Build the smallest working version of any feature first, show it to the
  student, then ask what to add. Use whenever the student asks for a new
  feature, a new app, or a redesign. Trigger phrases: "build me…", "add a…",
  "make this do…", "I want a feature that…", "create a page that…".
---

# Start Simple

When the student asks for a feature, build the **minimum working version first**, then offer to expand.

## What "minimum" means

- One page, not a multi-page app.
- One field, not a form with ten fields.
- One state (works), not three states (loading, error, empty).
- Hard-coded data is OK at this stage if real data takes more than 5 minutes to wire up.
- Pretty styling can wait — the goal is a working preview the student can click.

## Why this matters

The student is here to ship something in 24 hours. The fastest way to get there is:

1. Build the smallest version that runs.
2. Look at it together.
3. Decide what to add next based on what they actually see, not what they imagined.

Building "the whole thing at once" leads to long generations, hard-to-debug failures, and burned API credits. Building in tiny steps means every step works, the student stays oriented, and bugs are caught immediately.

## What to do

1. Read the request. If it has multiple features, pick **one** to start with — the most central or most visible.
2. Build that one feature end-to-end (UI + any backend it needs).
3. Save the file(s).
4. Tell the student: _"Built the simplest version. Open the preview and click around. What should we add next?"_
5. Wait for their feedback before adding more.

## What NOT to do

- Don't generate three pages at once unless asked.
- Don't add settings, options, or configuration the student didn't ask for.
- Don't add error handling for edge cases that don't exist yet.
- Don't pre-design for "future scale" — the student is shipping in 24 hours.

## Example

**Student says:** "Build me a flashcard app for studying chemistry."

**Wrong response:** Generate a multi-page app with deck management, study modes, spaced repetition, statistics, and import/export.

**Right response:** Build one page: a single card showing a question, click to flip and reveal the answer, click again for the next card. Three hard-coded cards in an array. Show it. Then ask: _"Want to add a way to enter your own cards next, or shuffle the order?"_
