---
name: wrap
description: Wrap up a piece of work — review the diff, write a clear conventional-commit message, commit, optionally push to GitHub.
argument-hint: "[push | no push]"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---

# /wrap — wrap up a piece of work

Run a piece of completed work through the standard finish line: review what changed, build a clean commit, optionally push to GitHub.

## Inputs

`$ARGUMENTS` is one of:
- `push` — commit AND push to the student's branch
- `no push` / `nopush` / empty — commit only, don't push

If unclear, ask once via `AskUserQuestion`: "Push after committing?" with options "Push to GitHub" / "Just commit, don't push".

## Workflow

### 1. See what's changed

Run:
```bash
git status --short
git diff --stat HEAD
```

If nothing has changed, say `Nothing to commit. Working tree is clean.` and stop.

### 2. Look at unrelated files

If `git status` shows files outside the obvious scope of the work (e.g. a stray `.env` change, an unrelated component edit, a build artifact), list them and ask:

> _These look unrelated to what we were working on — exclude from the commit?_
>
> ```
> .env
> apps/server/data.db
> some-other-file.tsx
> ```

Default to **excluding** unless the student says otherwise. **Never** stage `.env`, `*.db`, or anything in `node_modules/`. The `.gitignore` already excludes most of this — if you see them in `git status`, something is wrong.

### 3. Pick a conventional-commit prefix

Look at the diff and pick:

| Prefix | Use for |
|---|---|
| `feat:` | new feature added |
| `fix:` | bug fix |
| `style:` | visual changes only (CSS, layout, copy) |
| `refactor:` | code cleanup, no behavior change |
| `docs:` | README or comment-only changes |
| `chore:` | config, dependencies, scaffolding |

### 4. Build the commit message

One line, ≤72 chars, present tense, lowercase after the prefix.

Examples:
- `feat: add flashcard flip animation`
- `fix: prevent crash when todo list is empty`
- `style: bigger timer text, center it`
- `chore: add openai dependency for image generation`

If the change is non-trivial, include a 1-3 line body explaining **why** (not what — the diff shows what).

### 5. Branch check

Check the current branch:

```bash
git rev-parse --abbrev-ref HEAD
```

If the branch is `main` or `master`, **stop and warn the student**:

> _You're on `main`. Every student should work on their own branch named `firstname-lastname`. Run `git checkout -b firstname-lastname` first, then `/wrap` again._

Otherwise proceed.

### 6. Stage and commit

Stage only the files relevant to this piece of work — do **not** use `git add -A` or `git add .` if step 2 flagged anything.

```bash
git add <files...>
git commit -m "feat: add flashcard flip animation"
```

If a multi-line message is needed, use a HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
feat: add flashcard flip animation

Cards now flip with a CSS transform when clicked, so the answer
slides in instead of jumping. Used because the abrupt swap was
confusing testers.
EOF
)"
```

### 7. Push (if requested)

If the student said `push`:

```bash
git push
```

If the branch isn't tracking a remote yet, the first push needs `-u`:

```bash
git push -u origin <branch-name>
```

Read the current branch from step 5; don't hardcode it.

### 8. Report

One short message:

> Committed `<short-hash>` on `<branch>` — `<commit message>`. Pushed to GitHub. ✓

Or, if not pushing:

> Committed `<short-hash>` on `<branch>`. Not pushed yet. Push when ready with: `git push`

## Guardrails

- **Never push to `main` or `master`.** Stop and tell the student to switch branches.
- **Never `git push --force`.** It destroys other people's work.
- **Never commit `.env`, `.db`, `node_modules/`** — refuse and tell the student.
- **Never `git add -A` or `git add .`** if there are unrelated changes. Stage specifically.
- **Never bypass `--no-verify`** unless the student explicitly asks.

## Context

$ARGUMENTS
