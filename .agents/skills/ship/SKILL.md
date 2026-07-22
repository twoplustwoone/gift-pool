---
name: ship
description: Ship the current changes end-to-end — dedicated branch, atomic commits, PR against main, and CI monitored to green. Use when the user wants a change landed cleanly through the full PR workflow.
---

# ship

Create a dedicated branch (never commit to main). Make atomic commits. Open a PR against main. Monitor CI: fix coverage gaps, Playwright flakes, and Sonar findings. Report status when all checks are green; do not merge without confirmation.

## Codex review

This repo has the Codex GitHub App auto-reviewing PRs (on open, and on an `@codex review` comment). Watch for it on the same cadence as CI, not just once at the end — checking only one of Codex's surfaces and reporting green is how a live finding gets missed.

Codex findings land on THREE different surfaces depending on the run, and a single check on only one of them is not sufficient:

- Line comments on the diff: `gh api repos/{owner}/{repo}/pulls/{number}/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]")'`
- Formal review summaries: `gh api repos/{owner}/{repo}/pulls/{number}/reviews --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]")'`
- Plain top-level PR comments (a "## Review finding" — this is a real surface, not hypothetical, and is easy to miss since it isn't a review or a line comment): `gh api repos/{owner}/{repo}/issues/{number}/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]")'`

Check all three every time, not just the one that happened to have a hit last time.

- While a review is running, Codex reacts to the triggering PR/comment with 👀; when done it either reacts 👍 (nothing found) or posts a finding on one of the three surfaces above. Reactions live on the PR/issue itself (`gh api repos/{owner}/{repo}/issues/{number}/reactions`) and, when a specific `@codex review` comment triggered the run, on that comment (`gh api repos/{owner}/{repo}/issues/comments/{comment_id}/reactions`).
- No 👀/👍 reaction and nothing on any of the three comment surfaces usually means the review hasn't landed yet — check again rather than reporting green.
- A reply about no review usages/credits remaining is expected and can be ignored — it's not a finding.
- **Judge each finding before acting — do not blindly fix everything.** Verify it against the actual code the same way you would a human reviewer's comment (per `superpowers:receiving-code-review`): if it's real and in scope, fix it and add/adjust a regression test; if you determine it's incorrect, already handled, out of scope for this change, or a deliberate tradeoff, it is fine to leave it unaddressed — but say so explicitly in your report to the user (what the finding was, why you're not acting on it) rather than silently dropping it. Silence reads as "missed it," not "considered and declined."
- After pushing a fix (or after deciding a finding needs no code change), comment `@codex review` on the PR (`gh pr comment {number} --body "@codex review"`) to trigger a fresh pass — this is Codex's own documented re-review trigger, confirmed from its review-comment footer in this repo. Keep monitoring (all three surfaces) until a pass finds nothing new.
