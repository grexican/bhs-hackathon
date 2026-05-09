---
name: onboard
description: First-time setup walkthrough. Asks the student a few questions, configures git, creates their branch, personalizes the README, makes an initial commit, and optionally pushes. Friendlier than the terminal-based `npm run onboard`. Run this once when you first open the project.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

# /onboard — first-time setup

You are walking a high school student through setting up this project for the first time. They have probably never used the terminal. They have probably never used git. **Be patient, explain every step in plain English BEFORE running anything, and never run multiple commands at once.**

There is also a `npm run onboard` script that does the same flow non-interactively. This Claude version is for students who would rather chat than type at a terminal.

## What you will do

1. Verify git is installed and Node 22+ is available.
2. Ask the student for their first name, last name, and email.
3. Configure git's `user.name` and `user.email` (only if they aren't already set, or if the student wants to change them).
4. Create a branch named `firstname-lastname` and switch to it.
5. Add a personal banner to the README.
6. Make the first commit.
7. Ask if they want to push to GitHub now.
8. Tell them how to run the app.

## Step-by-step

### 1. Pre-flight

Run these and report the results in plain English:

```bash
git --version
node --version
```

If `git --version` fails: stop, tell the student to install git from git-scm.com, and try again.
If `node --version` is below 22: stop, tell them to install Node 22+ from nodejs.org.

If `node_modules/` doesn't exist (`ls node_modules` fails), run `npm install` and explain that this downloads everything the project needs.

### 2. Greeting

Say something warm and short. Example:

> Welcome. Going to walk you through getting set up — should take about 2 minutes. I'll explain each step before I do it, and ask before anything that goes online.

### 3. Identity

Check if git is already configured:

```bash
git config user.name
git config user.email
```

Use `AskUserQuestion` to gather:

- First name
- Last name (optional but used for the branch)
- Email (the one they want on commits — school address is fine)

If git already has a name/email, mention what's there and ask if they want to keep it or change it.

### 4. Branch name

Default to `slugify(firstName + "-" + lastName)` — lowercase, hyphens for spaces, no special characters. Show them the proposed branch and let them override it via `AskUserQuestion`.

### 5. Confirm before changes

Show a summary:

> About to:
> - Set git user.name to "<full name>"
> - Set git user.email to "<email>"
> - Create branch "<branch>"
> - Add a personal banner to README.md
> - Commit it
>
> Sound good?

`AskUserQuestion`: "Looks right" / "Let me change something" / "Stop here".

### 6. Apply

Run each command separately, with a one-line "what this does" before each:

> _Saving your name to git so commits are credited to you:_
>
> ```bash
> git config user.name "Jane Doe"
> ```

> _Now your email:_
>
> ```bash
> git config user.email "jane@example.com"
> ```

> _Creating your branch and switching to it:_
>
> ```bash
> git checkout -b jane-doe
> ```

If a command fails, **stop**, paste the error verbatim to the student, and ask what they'd like to do.

### 7. Personalize the README

Use `Edit` to insert a banner just under the `# BHS Hackathon Starter` heading. Format:

```markdown
> **Jane Doe's build** — _My hackathon project_
```

If they didn't pick a project name, leave it as "_My hackathon project_" — they'll change it later.

### 8. Commit

```bash
git add README.md
git commit -m "chore: onboard Jane Doe (jane-doe)"
```

Show them the commit message and explain that this is now permanently saved in git history.

### 9. Push (ask first)

`AskUserQuestion`: "Push to GitHub now?" / "Skip — push later".

If yes:

```bash
git push -u origin jane-doe
```

If the push fails (e.g. they don't have access yet), explain in one sentence what the error means and tell them to ask a mentor — don't keep retrying.

### 10. Next steps

Tell them how to run the app:

> _You're set up. Run this to start the project (client + server both auto-reload when you save a file):_
>
> ```bash
> npm run dev
> ```
>
> _Then open **http://localhost:5173** in your browser._
>
> _To start building, just describe what you want. Try something like: "Replace the todos demo with a flashcard app for studying chemistry."_

## Guardrails

- **Never run multiple commands in one bash invocation.** Run them one at a time, with a one-line explanation before each.
- **Never `git push --force`.** If push fails, explain and stop — ask a mentor.
- **Never run a destructive command** (`git reset`, `git checkout -- .`, `rm -rf`) without explicit confirmation, and never as part of onboarding.
- **If the student gets confused at any step**, stop and explain what's happening in different words. Don't push forward.
- **Never commit `.env`, `*.db`, or `node_modules/`** — but the `.gitignore` already excludes these, so it shouldn't come up.
- **Keep the tone warm.** This is a 16-year-old's first time using git. They're allowed to be confused.
