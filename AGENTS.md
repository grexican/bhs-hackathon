# Commit & Git Workflow

Read this when the student asks you to commit, push, or wrap up work. Architecture rules and code style live in `CLAUDE.md` — this file is just the git workflow.

## Who you're working with

**The student is not technically savvy.** Most have never used git, never used a terminal, and have no instinct for "what does that command do." They will not catch a bad commit, won't notice if you push to `main`, and will trust you with their work.

That means **you do the git work**, but with two firm rules:

1. **Explain every command before you run it.** One short sentence in plain English ("This saves your work to git so it isn't lost"). Then run.
2. **Don't over-commit.** A commit per file change is noise. The right cadence is `make changes → run and verify it works → THEN commit and push`. Not `change → commit → push → discover bug → fix → commit → push`.

## The cadence — when to commit

The default is **build, run, see it work, then commit + push as a single act**.

A "commit moment" looks like:

- A feature now works end-to-end (the user can do the thing).
- A bug is fixed and you verified the bug is gone.
- A non-trivial chunk of styling or refactor is done and the page still renders.
- ~30 minutes have passed since the last commit AND something coherent works.

A "commit moment" does **not** look like:

- "I edited a file." (Did it run? Does it work?)
- "I tried something." (Did it land? If not, fix it first or revert.)
- "I added one line." (Group it with the next change.)
- "I committed five minutes ago." (Wait for something meaningful.)

When you're not sure, ask the student: _"This works in the preview — want to commit and push now, or keep building first?"_

## Quick reference

| Student says | What you do |
|---|---|
| `commit` / `wrap up` / `ship it` | Verify it runs in the preview first. Then stage relevant files, write a conventional-commit message, commit. Don't push. |
| `commit and push` / `wrap and push` / `ship to github` | Same as above + `git push`. |
| `/wrap` | Same as `commit`. |
| `/wrap push` | Same as `commit and push`. |
| `/onboard` | First-time setup — see `.claude/commands/onboard.md`. |

If the request is ambiguous (just "commit"), default to **commit but don't push**, and tell them they can run `git push` themselves or say "push" to do both.

## The flow (every commit)

### 1. Verify it works first

If we just changed code and haven't seen it run since, **don't commit yet**. Either:

- Tell the student: _"Reload the preview and click through it. If it works, say `commit` and I'll save it."_
- Or, if the student already said it works ("perfect", "looks good", "ship it"), proceed.

Committing untested code is how the student loses an hour later trying to figure out which commit broke things.

### 2. Inspect the state

```bash
git status --short
git diff --stat HEAD
git rev-parse --abbrev-ref HEAD
```

Run all three. Summarize the result for the student in plain English, e.g.:

> _Looks like 3 files changed: the React component, a CSS file, and the API route. Branch is `jane-doe`. Ready to commit._

### 3. Branch check

If the current branch is `main` or `master`, **stop**. Tell the student:

> _You're on `main` — nobody should commit there directly. Run `git checkout -b firstname-lastname` first (or say "make me a branch named X" and I'll do it)._

### 4. Stage carefully

Stage **only** the files relevant to the work. If `git status` shows files outside the obvious scope (a stray `.env`, a build artifact, a file the student never edited), list them and ask:

> _These look unrelated to what we just built — leave them out of the commit?_

Default to leaving them out unless the student explicitly says to include them.

**Never** stage:

- `.env` (or any `.env.*` except `.env.example`)
- `*.db` / `*.db-journal` / `*.db-shm` / `*.db-wal`
- Anything in `node_modules/`
- Anything in `dist/`, `build/`
- Files inside `tmp/` other than `.gitkeep`

The `.gitignore` already excludes these. If you ever see them in `git status`, something is wrong — say so and refuse to stage them.

**Use `git add <specific files>`, not `git add -A` or `git add .`** — they sweep up things the student may not realize are there.

### 5. Commit message

Conventional Commits format, lowercase after the prefix, ≤72 chars on the subject:

| Prefix | Use for |
|---|---|
| `feat:` | new feature added |
| `fix:` | bug fix |
| `style:` | visual changes only |
| `refactor:` | code cleanup, no behavior change |
| `docs:` | README or comment-only changes |
| `chore:` | config, dependencies, scaffolding |
| `test:` | test additions or fixes |

Examples:

- `feat: add flashcard flip animation`
- `fix: prevent crash when todo list is empty`
- `style: bigger timer text, center it`
- `chore: add openai dependency for image generation`

If the change is non-trivial, include a 1-3 line body explaining **why** (not what — the diff shows what). Use a HEREDOC for multi-line messages:

```bash
git commit -m "$(cat <<'EOF'
feat: add flashcard flip animation

Cards now flip with a CSS transform instead of swapping abruptly.
The abrupt swap was confusing testers.
EOF
)"
```

### 6. Push (only when asked)

```bash
git push
```

First push on a new branch needs `-u`:

```bash
git push -u origin <branch-name>
```

(Read the branch from step 2; never hardcode it.)

### 7. Report

One short, friendly message:

> _Committed `a3f2c19` on `jane-doe`: "feat: add flashcard flip animation". Pushed to GitHub. ✓_

Or, if not pushing:

> _Committed `a3f2c19` on `jane-doe`. Not pushed yet — say `push` when you're ready, or run `git push` yourself._

## Hard rules — never break these

- **Never push to `main` or `master`.** Even with explicit confirmation. Say no and explain.
- **Never `git push --force`.** Destructive — it can erase someone else's work.
- **Never `--no-verify`** or any other hook bypass.
- **Never `git commit --amend`** after a failed pre-commit hook. The original commit didn't happen, so amending modifies the *previous* commit (bad). Just make a new commit.
- **Never run a destructive git command** (`git reset --hard`, `git checkout -- .`, `git branch -D`, `git clean -f`, `rm -rf .git`) without explicit, scoped confirmation from the student.
- **Never commit `.env`** even if the student asks. If they want to share an API key, suggest they paste it directly into Claude — git history is permanent and public if pushed.
- **Never run multiple destructive-or-network commands in one bash call.** One thing at a time, with the explanation first.

## When something goes wrong

- A `git commit` fails (pre-commit hook, missing config, etc.) → paste the **exact error** to the student, explain in one sentence what it usually means, propose ONE fix. Don't loop.
- A `git push` is rejected (non-fast-forward, etc.) → STOP. This usually means someone else pushed first. Run `git pull --rebase` ONLY after explaining what it does and getting confirmation. Never `--force`.
- A merge conflict → STOP and tell the student to ask a mentor. Merge conflicts are confusing for non-coders; don't try to resolve them silently.

## Scratch space

When you need to write down a temporary file — a draft of something, a script you're going to delete, a plan you're working through — put it in `tmp/`. Everything inside `tmp/` is gitignored except for `.gitkeep`. You can read, write, delete freely there without polluting the student's working tree or history.

Don't put working code in `tmp/`. It's for ephemeral notes and one-off scripts only.
