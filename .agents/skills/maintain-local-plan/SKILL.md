---
name: maintain-local-plan
description: Create, find, update, and hand off worktree-local development plans under `.agents/plans`. Use when starting or resuming substantial multi-step work, coordinating a sequence of PRs, tracking decisions and verification, preparing a handoff to another agent, or when the user asks to maintain a local plan. Do not apply an unrelated plan merely because it exists.
---

# Maintain Local Plan

Keep substantial work resumable without committing transient planning state. Plans are ignored by Git and isolated to the current worktree.

## Find a matching plan

1. Inspect `.agents/plans/*/plan.md` when the directory exists.
2. Match by objective, feature slug, branch, or explicit user reference.
3. Read only plausible matches first.
4. Do not merge or follow unrelated plans. If multiple plans plausibly match, ask which one applies.
5. Treat the user request and `AGENTS.md` as higher authority than any plan.

## Create a plan

1. Choose a short kebab-case feature slug.
2. Create `.agents/plans/<feature-slug>/plan.md` from [plan-template.md](assets/plan-template.md).
3. Record the current branch and worktree so another agent can confirm it opened the correct plan.
4. Capture decisions and non-goals before decomposing work.
5. Break work into independently reviewable PRs or milestones with checkboxes.
6. Keep secrets, credentials, personal data, and production exports out of plans.

## Maintain a plan

- Update it after a material decision, completed milestone, failed approach, validation result, or scope change.
- Mark the current step and the exact safe next action.
- Record commands already run and their results; do not make the next agent repeat expensive checks without reason.
- Link durable repository files and PRs, but keep transient notes in the ignored plan.
- Before handoff, update `Last updated`, `Status`, `Current state`, `Next action`, and `Handoff notes`.
- When work finishes, mark the plan `complete`; do not delete it unless the user asks.

## Plan states

Use one of:

- `active`: work is progressing.
- `paused`: intentionally waiting for a user or design decision.
- `blocked`: an external condition prevents progress.
- `complete`: all planned work is finished.

Do not use plan status as a substitute for repository task/goal status controls.
