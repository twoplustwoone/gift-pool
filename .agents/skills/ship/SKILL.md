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
- **You get at most two `@codex review` re-triggers per PR. This is a count, not a judgement call.** Codex reviews once automatically when the PR opens (round 1). After that, before every `gh pr comment {number} --body "@codex review"`, write the round number down in your report to the user: "requesting Codex round N of max 3." If N would be 4, you are done reviewing — report the outstanding findings with your disposition on each and hand the decision to the user. Do not re-trigger. Do not keep monitoring for a pass that finds nothing; a clean pass is not the exit condition, the round cap is.

### Why the cap is a count and not a judgement

Each fix creates fresh surface to review, so the review never runs out of material on its
own. A docs-only PR in this repo reached four rounds, where rounds 3 and 4 were findings
about the text added to fix rounds 2 and 3.

The cap is mechanical because a judgement-based version does not work. An earlier revision
of this section listed sensible criteria — is it second-order, is the code illustrative, is
the failure reachable, is the fix proportionate — and the agent that wrote them proceeded to
blow through them, because at each individual round the next fix looked defensible. Criteria
that require you to talk yourself out of one more round will lose to a concrete finding
sitting in front of you. A count will not.

Two consequences worth internalising rather than re-deriving:

- **A clean Codex pass is not the goal and never was.** The goal is a change that is correct
  enough to ship. Chasing "nothing new found" hands the exit condition to a reviewer that
  always has something.
- **Findings are graded by class, not by what being wrong costs here.** A P1 on an
  illustrative snippet in a doc is not a P1 on shipped code. That weighting is yours.

Use the remaining budget on findings that would matter in production, and decline the rest
out loud: state what the finding was and why you are not acting on it. A judged-and-declined
finding is not a leak. Silently absorbing findings until the reviewer runs out of ideas is
not diligence — and it will not terminate.

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

Three conditions have to hold together — the expected checks have all registered, none is
still running, and every one concluded successfully — and stating them as separate prose
predicates repeatedly produced rules that passed while CI was broken. Use one expression
that returns a verdict, and copy it whole; each clause is load-bearing:

```bash
set -o pipefail   # else a failed `gh api` yields jq's status, and jq exits 0 on empty input
SHA=$(git rev-parse HEAD)
[ "$SHA" = "$(gh pr view {number} --json headRefOid --jq .headRefOid)" ] \
  || { echo "UNKNOWN: HEAD is not the PR head"; exit 3; }   # stop; never report a stale SHA
gh api --paginate "repos/{owner}/{repo}/commits/$SHA/check-runs" \
| jq -r --argjson want '["⬣ ESLint","ʦ TypeScript","⚡ Vitest","🎭 Playwright","SonarQube","SonarCloud Code Analysis"]' '
    ([.check_runs[].name] | unique) as $have
    | ($want - $have)                                                   as $missing
    | [.check_runs[] | select(.status != "completed")]                  as $running
    | [.check_runs[] | select(.status == "completed"
        and (.conclusion | IN("success","skipped","neutral") | not))
        | "\(.name)=\(.conclusion)"]                                    as $bad
    | if   ($bad|length)     > 0 then "FAILED: \($bad|join(", "))"
      elif ($missing|length) > 0 then "WAITING: not registered — \($missing|join(", "))"
      elif ($running|length) > 0 then "WAITING: \($running|length) still running"
      else "GREEN: \(.check_runs|length) checks" end'
```

Why each clause earns its place:

- **`$missing` (names)** — an empty `check_runs` makes any "nothing unfinished" count return
  `0`, so "not started" reads as "finished". Both Sonar checks must be listed: they register
  last, and on this PR `SonarCloud Code Analysis` was still absent while every other expected
  check was present and passing.
- **`$bad` (conclusions)** — a failed run is `status: "completed"` with its name present, so
  a name-plus-count rule accepts failed CI outright. Only `success` (and a legitimately
  no-op `skipped`/`neutral`) is green.
- **`cancelled` counts as failed here, deliberately.** On the SHA you are watching it means
  the run was aborted. It is routine only when it belongs to a SHA you have already
  superseded by pushing again — in that case re-anchor to the new HEAD and **stop the
  monitor pinned to the dead SHA**, because anchoring the query is pointless if the watcher
  is stale.
- The legacy `commits/{sha}/status` endpoint reports `pending` when its `statuses` array is
  empty. This repo publishes everything (including Sonar) as check-runs, so that `pending`
  is an artifact of the old API, not an outstanding check.
