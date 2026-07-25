---
name: ship
description: Ship the current changes end-to-end — dedicated branch, atomic commits, PR against main, and CI monitored to green. Use when the user wants a change landed cleanly through the full PR workflow.
---

# ship

Create a dedicated branch (never commit to main). Make atomic commits. Open a PR against main. Monitor CI: fix coverage gaps, Playwright flakes, and Sonar findings. Report status when all checks are green; do not merge without confirmation.

## Codex review

This repo has the Codex GitHub App auto-reviewing PRs (on open, and on an `@codex review` comment). Watch for it on the same cadence as CI, not just once at the end — checking only one of Codex's surfaces and reporting green is how a live finding gets missed.

Codex findings land on THREE different surfaces depending on the run, and a single check on only one of them is not sufficient:

- Line comments on the diff: `gh api --paginate repos/{owner}/{repo}/pulls/{number}/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]")'`
- Formal review summaries: `gh api --paginate repos/{owner}/{repo}/pulls/{number}/reviews --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]")'`
- Plain top-level PR comments (a "## Review finding" — this is a real surface, not hypothetical, and is easy to miss since it isn't a review or a line comment): `gh api --paginate repos/{owner}/{repo}/issues/{number}/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]")'`

`--paginate` is required on all three — GitHub's list endpoints default to 30 items per page, and a PR that's had a few review rounds can exceed that; without it, a finding on page 2 is invisible and the workflow reports clean when it isn't.

Check all three every time, not just the one that happened to have a hit last time.

**Scope every check to the current review run, not to all history.** A prior finding you already fixed (or already judged and declined) stays in these API responses forever — a clean re-review only adds a 👍 reaction, it never deletes or supersedes the old comment. Before evaluating what's outstanding:

- Capture a wall-clock baseline timestamp (`date -u +%Y-%m-%dT%H:%M:%SZ`) at the moment you push or post `@codex review` — a commit SHA cannot be compared against a comment's `created_at` (and commit-author time is not push/trigger time), so the two comment endpoints need a real timestamp boundary, not the SHA.
- `pulls/{number}/reviews` entries carry `commit_id` — filter to the review whose `commit_id` matches the commit you just pushed; that's the authoritative "is this round done yet" signal for the formal-review surface.
- For `pulls/{number}/comments` and `issues/{number}/comments`, filter to `created_at` at or after the captured baseline timestamp (inclusive — a finding posted in the same UTC second as the baseline must still count as current). Anything strictly older is a past round's finding, not this round's — don't re-treat it as newly outstanding just because it's still sitting there.

- While a review is running, Codex reacts to the triggering PR/comment with 👀; when done it either reacts 👍 (nothing found) or posts a finding on one of the three surfaces above. Reactions live on the PR/issue itself (`gh api --paginate repos/{owner}/{repo}/issues/{number}/reactions`) and, when a specific `@codex review` comment triggered the run, on that comment (`gh api --paginate repos/{owner}/{repo}/issues/comments/{comment_id}/reactions`).
- No 👀/👍 reaction and nothing new (per the scoping above) on any of the three comment surfaces usually means the review hasn't landed yet — check again rather than reporting green.
- A reply about no review usages/credits remaining is expected and can be ignored — it's not a finding.
- **Judge each finding before acting — do not blindly fix everything.** Verify it against the actual code the same way you would a human reviewer's comment (per `superpowers:receiving-code-review`): if it's real and in scope, fix it and add/adjust a regression test; if you determine it's incorrect, already handled, out of scope for this change, or a deliberate tradeoff, it is fine to leave it unaddressed — but say so explicitly in your report to the user (what the finding was, why you're not acting on it) rather than silently dropping it. Silence reads as "missed it," not "considered and declined."
- After pushing a fix (or after deciding a finding needs no code change), comment `@codex review` on the PR (`gh pr comment {number} --body "@codex review"`) to trigger a fresh pass — this is Codex's own documented re-review trigger, confirmed from its review-comment footer in this repo. Keep monitoring (all three surfaces) until a pass finds nothing new.

## A failed query must never read as a clean result

Every check above answers "is anything outstanding?" by looking for _absence_. That makes
each one a place where a broken command and a genuine all-clear produce identical output,
and the broken command is the more confident of the two. Guard against it:

- **`gh api --jq` takes exactly one query string and does NOT accept `--arg`.** Writing
  `--jq --arg b "$B" '... .created_at >= $b ...'` — the obvious way to apply the baseline
  from the section above — makes `--jq` swallow `--arg` as its value and gh exits 1 with
  `accepts 1 arg(s), received 4`, before fetching anything. Interpolate the baseline into
  the query instead: `--jq ".[] | select(.created_at >= \"$B\")"`. (`--arg` is a standalone
  `jq` flag; it only works if you pipe gh's output into `jq` yourself.)
- **Never `2>/dev/null` a command whose empty output you are treating as evidence.** Paired
  with `|| echo 0`, the failure above becomes an authoritative-looking "0 findings." Check
  the exit status and treat non-zero as **unknown**, never as clean.
- **Before reporting a review clean, re-run at least one surface unfiltered** and confirm
  the filter is not what is producing the silence.

The generalisable rule: never write a condition whose failure mode is a confident answer.
If you cannot distinguish "nothing found" from "the check did not run," the check is not
evidence yet.

## Verify CI against the pushed SHA

`gh pr checks` immediately after a push can return the _previous_ commit's completed
checks, so a run can look green before the new one has even queued.

- Confirm `git rev-parse HEAD` equals `gh pr view {number} --json headRefOid --jq .headRefOid`,
  then read `repos/{owner}/{repo}/commits/{sha}/check-runs` — that endpoint is anchored to
  the commit and cannot report a stale round.
- Decide "still running" with `jq '[.check_runs[] | select(.status != "completed")] | length'`.
  Hand-rolled `grep` guards over concatenated status strings misreport an `in_progress` run
  as a failure.
- The legacy `commits/{sha}/status` endpoint reports `pending` when its `statuses` array is
  empty. This repo publishes everything (including Sonar) as check-runs, so that `pending`
  is an artifact of the old API, not an outstanding check.
