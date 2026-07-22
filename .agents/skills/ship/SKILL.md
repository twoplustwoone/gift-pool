---
name: ship
description: Ship the current changes end-to-end — dedicated branch, atomic commits, PR against main, and CI monitored to green. Use when the user wants a change landed cleanly through the full PR workflow.
---

# ship

Create a dedicated branch (never commit to main). Make atomic commits. Open a PR against main. Monitor CI: fix coverage gaps, Playwright flakes, and Sonar findings. Report status when all checks are green; do not merge without confirmation.

## Codex review

This repo has the Codex GitHub App auto-reviewing PRs (on open, and on an `@codex review` comment). Watch for it on the same cadence as CI, not just once at the end:

- While a review is running, Codex reacts to the triggering PR/comment with 👀; when done it either reacts 👍 (nothing found) or posts line comments (`user.login == "chatgpt-codex-connector[bot]"`) — one per finding.
- Check with `gh api repos/{owner}/{repo}/pulls/{number}/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]")'` (and `.../reviews` for the summary review). No 👀/👍 reaction yet and no comment usually means the review hasn't landed — check again rather than assuming it's clean.
- A reply about no review usages/credits remaining is expected and can be ignored — it's not a finding.
- Treat each finding like a human review comment: verify it's real, fix it, add/adjust a regression test, then push.
- After pushing the fix, comment `@codex review` on the PR (`gh pr comment {number} --body "@codex review"`) to trigger a fresh pass against the new commit — this is Codex's own documented re-review trigger, confirmed from its review-comment footer in this repo. Keep monitoring until a pass finds nothing new.
