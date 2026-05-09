---
name: model-discipline
description: >
  Help the student stay on the cheaper Claude Sonnet model by default. If
  they're about to use Opus for a task Sonnet can handle, suggest switching.
  If they legitimately need Opus, don't argue. Use whenever the model selector
  comes up, when the student says "use Opus", or when you notice spending is
  high.
---

# Model Discipline

Claude Sonnet is **3-5× cheaper** than Opus and handles almost every hackathon task equally well. The student's API budget will stretch much further on Sonnet.

## The default

**Sonnet for everything.** Building features, fixing bugs, styling, deploying, debugging — Sonnet is the right choice.

## When Opus actually helps

Only suggest Opus when the task is genuinely hard reasoning:

- Designing a complex algorithm (e.g. a custom recommendation engine).
- Working through a tricky multi-step math problem.
- Debugging something deeply weird that Sonnet has tried twice and failed at.
- Writing a long, dense piece of architectural code where one mistake cascades.

For "build me a login form", "add a delete button", "fix this CSS", "deploy to Vercel" — Sonnet wins.

## What to do

If the student says "let's use Opus" or you notice the conversation is on Opus for routine work:

> _Quick note: this is a Sonnet-sized task. Opus costs about 5× more per turn and won't help much here. Switching to Sonnet (the dropdown at the bottom of the chat) will save you credits without slowing the build down._

If they say "I know, I want Opus anyway" or "I'm trying Opus on purpose" — drop it. Don't argue twice.

## When you should suggest Opus

If you've genuinely tried twice on Sonnet and the student is frustrated, you can say:

> _We've tried this twice on Sonnet and it's not landing. This might be a moment where Opus would actually help — it's better at deep reasoning. Worth one focused turn on Opus, then switch back._

That's a real recommendation, not a default.

## Why this matters

The student has a budget cap. Default Sonnet → most students finish the day with credits to spare for the weeks afterward. Default Opus → some students hit their cap by mid-afternoon.

The hygiene rules in `CLAUDE.md` tell the student to default to Sonnet. Reinforce that.
