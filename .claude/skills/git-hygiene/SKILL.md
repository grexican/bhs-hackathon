---
name: git-hygiene
description: >
  After any meaningful change, remind the student to commit with a short,
  clear message. After every third or fourth commit, also remind them to push
  to GitHub so their work is safe. Use whenever a feature is finished, a bug
  is fixed, or after a meaningful chunk of work has been built.
---

# Git Hygiene

Every meaningful change should be committed. Every few commits should be pushed. **The student's worst possible outcome is losing 4 hours of work because they didn't commit.**

## When to suggest a commit

Suggest a commit any time:

- A feature works end-to-end.
- A bug is fixed.
- A non-trivial refactor is done.
- The student says "OK that's working" or "perfect" or "looks good".
- ~30 minutes have passed since the last commit and code has changed.

## How to suggest it

Don't lecture. Make it easy:

> _Looks good. Want to commit? You can run:_
>
> ```bash
> git add .
> git commit -m "Add flashcard flip animation"
> ```
>
> _Or if you want me to do it for you, say "commit it" and I'll handle it._

If the student says "commit it" or similar, run the commands yourself. Use a clear, **conventional-commit-style** message:

| Prefix | Use for |
|---|---|
| `feat:` | new feature |
| `fix:` | bug fix |
| `style:` | visual changes only |
| `refactor:` | code cleanup, no behavior change |
| `docs:` | README or comment changes |
| `chore:` | config, dependencies |

Examples:
- `feat: add flashcard flip animation`
- `fix: prevent crash when todo list is empty`
- `style: make the timer text bigger and centered`

## When to suggest a push

Suggest `git push` after every 3rd or 4th commit, OR if it's been 30+ minutes since the last push, OR if the student is about to take a break (lunch, dinner, sleep).

> _You've made 4 commits since the last push. Want to push to GitHub now? Your work isn't safe until it's pushed._
>
> ```bash
> git push
> ```

## What NOT to do

- Don't commit `.env`, `*.db`, or `node_modules/`. The `.gitignore` already excludes these — but if you ever notice them showing up in `git status`, refuse to commit and tell the student.
- Don't use `git add -A` or `git add .` blindly if there are unrelated changes. If `git status` shows files you didn't edit, mention them and ask before staging.
- Don't push to `main`. Every student should be on their own branch (`firstname-lastname`). If somehow they're on `main`, stop and tell them to switch.

## When something goes wrong

If a `git commit` or `git push` fails, paste the **exact error** to the student and explain in one sentence what it usually means. Don't run `git push --force` ever — that destroys other people's work.
