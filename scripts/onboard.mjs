#!/usr/bin/env node
// Interactive onboarding for first-time students.
//
// Run: `npm run onboard`
//
// What it does:
//   1. Checks Node + Git + npm install state.
//   2. Asks for the student's first + last name and an optional project name.
//   3. Configures git user.name / user.email if they aren't already set.
//   4. Creates a feature branch named `firstname-lastname` (or the project
//      name if they prefer) and switches to it.
//   5. Personalizes README.md with their name.
//   6. Stages + commits the personalization.
//   7. Optionally runs `git push -u origin <branch>`.
//   8. Tells them what to run next (`npm run dev`).
//
// This script is deliberately friendly — it explains every step in plain
// English BEFORE doing it, and it asks before anything that touches the
// network (push). Designed for students who have never used a terminal.
//
// There is also a /onboard slash command in Claude Code that walks the same
// flow conversationally. Either path is fine.

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const README_PATH = resolve(REPO_ROOT, "README.md");

const rl = createInterface({ input, output });

function header(title) {
  console.log("");
  console.log("─".repeat(60));
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function info(msg) {
  console.log(`  ${msg}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function warn(msg) {
  console.log(`  ! ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
}

async function ask(question, fallback) {
  const answer = (await rl.question(`  ${question}${fallback ? ` [${fallback}]` : ""}: `)).trim();
  return answer || fallback || "";
}

async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const raw = (await rl.question(`  ${question} (${hint}): `)).trim().toLowerCase();
  if (!raw) return defaultYes;
  return raw === "y" || raw === "yes";
}

function gitOk(args) {
  const r = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  return { ok: r.status === 0, stdout: r.stdout?.trim() ?? "", stderr: r.stderr?.trim() ?? "" };
}

function git(args, { silent = false } = {}) {
  const r = spawnSync("git", args, {
    cwd: REPO_ROOT,
    stdio: silent ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (r.status !== 0) {
    if (silent) console.error(r.stderr);
    throw new Error(`git ${args.join(" ")} failed`);
  }
  return r.stdout?.trim() ?? "";
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function main() {
  header("BHS Hackathon — onboarding");
  info("Welcome. This script gets your project set up in one shot:");
  info("  • configure git with your name and email");
  info("  • create your own branch");
  info("  • personalize the README with your name");
  info("  • commit + (optionally) push to GitHub");
  info("");
  info("It explains each step before doing it. Press Ctrl+C any time to stop.");

  // 1. Pre-flight checks
  header("Pre-flight checks");
  try {
    const gv = execSync("git --version", { encoding: "utf8" }).trim();
    ok(`git found — ${gv}`);
  } catch {
    fail("git is not installed or not on your PATH.");
    fail("Install it from https://git-scm.com/downloads then run this again.");
    process.exit(1);
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22) {
    fail(`Node ${process.versions.node} is too old. Need 22 or newer.`);
    fail("Install from https://nodejs.org and run this again.");
    process.exit(1);
  }
  ok(`node ${process.versions.node}`);

  if (!existsSync(resolve(REPO_ROOT, "node_modules"))) {
    warn("node_modules/ doesn't exist yet — running `npm install` first…");
    const r = spawnSync("npm", ["install"], { cwd: REPO_ROOT, stdio: "inherit", shell: true });
    if (r.status !== 0) {
      fail("npm install failed. Fix the error above and try `npm run onboard` again.");
      process.exit(1);
    }
    ok("dependencies installed");
  } else {
    ok("dependencies already installed");
  }

  // 2. Identity
  header("Who are you?");
  const existingName = gitOk(["config", "user.name"]).stdout;
  const existingEmail = gitOk(["config", "user.email"]).stdout;
  if (existingName && existingEmail) {
    info(`Git already knows you as: ${existingName} <${existingEmail}>`);
  }

  const firstName = await ask("First name", existingName.split(" ")[0]);
  const lastName = await ask("Last name", existingName.split(" ").slice(1).join(" ") || "");
  const email = await ask("Email (used by git for commit history)", existingEmail);

  if (!firstName || !email) {
    fail("Need at least a first name and an email to continue.");
    process.exit(1);
  }

  const fullName = lastName ? `${firstName} ${lastName}` : firstName;

  // 3. Branch name
  header("Your branch");
  info("Each student works on their own branch so nobody bumps into anyone else.");
  const defaultBranch = lastName ? slugify(`${firstName}-${lastName}`) : slugify(firstName);
  const branchName = (await ask("Branch name", defaultBranch)) || defaultBranch;

  // 4. Project name (optional flavor)
  header("Your project");
  info("What are you building? (Optional — you can change your mind later.)");
  const projectName = await ask("Project name", "My hackathon project");

  // 5. Confirm before mutating anything
  header("Ready to go");
  info(`  Name: ${fullName}`);
  info(`  Email: ${email}`);
  info(`  Branch: ${branchName}`);
  info(`  Project: ${projectName}`);
  if (!(await confirm("Proceed?", true))) {
    info("Aborted. Re-run when you're ready.");
    process.exit(0);
  }

  // 6. Configure git identity
  header("Configuring git");
  if (existingName !== fullName) {
    git(["config", "user.name", fullName]);
    ok(`set git user.name to "${fullName}"`);
  } else {
    ok("user.name already correct");
  }
  if (existingEmail !== email) {
    git(["config", "user.email", email]);
    ok(`set git user.email to "${email}"`);
  } else {
    ok("user.email already correct");
  }

  // 7. Create or switch to the branch
  header("Creating your branch");
  const currentBranch = gitOk(["rev-parse", "--abbrev-ref", "HEAD"]).stdout;
  if (currentBranch === branchName) {
    ok(`already on ${branchName}`);
  } else {
    const branchExists = gitOk(["rev-parse", "--verify", branchName]).ok;
    if (branchExists) {
      git(["checkout", branchName]);
      ok(`switched to existing branch ${branchName}`);
    } else {
      git(["checkout", "-b", branchName]);
      ok(`created and switched to ${branchName}`);
    }
  }

  // 8. Personalize README
  header("Personalizing README");
  if (existsSync(README_PATH)) {
    const original = readFileSync(README_PATH, "utf8");
    const banner = `\n> **${fullName}'s build** — _${projectName}_\n`;
    let next = original;
    if (!next.includes("**'s build**") && !next.includes(banner.trim())) {
      next = next.replace("# BHS Hackathon Starter", `# BHS Hackathon Starter${banner}`);
    }
    if (next !== original) {
      writeFileSync(README_PATH, next, "utf8");
      ok("added a personal banner to README.md");
    } else {
      ok("README.md already has a banner — no change");
    }
  }

  // 9. Stage + commit
  header("Saving your first commit");
  const status = gitOk(["status", "--porcelain"]).stdout;
  if (!status) {
    info("No changes to commit yet — that's fine.");
  } else {
    git(["add", "README.md"]);
    const commitMessage = `chore: onboard ${fullName} (${branchName})`;
    git(["commit", "-m", commitMessage]);
    ok(`committed: "${commitMessage}"`);
  }

  // 10. Optional push
  header("Push to GitHub?");
  info("Pushing now means your work is safely backed up on GitHub.");
  info('If you skip, you can push later by saying "/wrap push" to Claude.');
  if (await confirm("Push to GitHub now?", true)) {
    try {
      git(["push", "-u", "origin", branchName]);
      ok("pushed to origin");
    } catch {
      warn("Push failed — that's OK if you don't have GitHub access yet.");
      warn("Ask a mentor if you need help.");
    }
  } else {
    info("Skipped. Push later with `/wrap push` or `git push -u origin " + branchName + "`.");
  }

  // 11. Next steps
  header("You're set up — now build something");
  info("Run the app (client + server, both auto-reload on file changes):");
  console.log("");
  console.log("    npm run dev");
  console.log("");
  info("Then open http://localhost:5173 in your browser.");
  info("");
  info("To start building, open this folder in Claude Desktop's Code tab and");
  info("describe what you want. Try something like:");
  info("");
  info('    "Replace the todos demo with a flashcard app for studying chemistry."');
  info("");
  info("Have fun. We can't wait to see what you ship.");

  rl.close();
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
