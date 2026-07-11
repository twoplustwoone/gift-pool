# GiftPool — State of Reality

*What is actually built, what the production data actually says, and the honest
assessment of where the product is. This document exists to counter wishful thinking:
the vision is coherent, but coherent is not the same as true or built. Read this
alongside `giftpool-vision-spine.md`.*

---

## Shipped since this session (verified 2026-07-11)

A discovery pass against the live repo confirmed the following landed. Each was
verified against raw command output (`gh pr view`, `git show`, `git log`, direct
grep of the cited functions) — not taken on faith.

- **PR 3** (`fix/group-settings-rework`, #446) was never merged directly — it was
  **closed, superseded by #450**, which merged 2026-06-30 and delivered PR 3's scope
  plus PR 4 in full: admin action confirmations + permission matrix, mobile Members
  tab, profile hover-preview card, and the desktop group dashboard.
- **`createdById` on `GiftGroup` shipped** (#460, merged 2026-07-03, migration
  `20260703050411_add_group_created_by`), with a backfill ordering existing rows by
  `(role='OWNER') DESC, joinedAt ASC`. It's live-written at group creation
  (`__group-editor.server.tsx:76`). **Authorization was NOT migrated to use it** —
  `group-permissions.server.ts` still reads off `UsersInGiftGroups.role` exclusively.
  This field is provenance-only for now; see updated schema-gaps note below.
- **The person-centric surface (`/users/:handle`) is no longer read-only** (#461,
  merged 2026-07-03). It's now a 1,426-line component with six real actions backed
  by genuine writes: propose-to-pool, record pool outcome, record wishlist-purchase
  outcome, decline/undo occasion, create person note, save gift-list item. See the
  rewritten section below — this materially changes the "current keystone" framing.
- **`shareWishlist` / `shareBirthday` are now read**, in three independent places
  (person-surface loader, `birthday-visibility.server.ts`, `group-overview.server.ts`),
  closing the previously-flagged write-only gap.
- **Mobile horizontal-overflow fix confirmed merged** (#452, 2026-07-01) — the
  Members-tab overflow bug specifically, plus earlier batch fixes (#454–456, #422).

**What did NOT change:** the scheduler. No cron, worker, or scheduled Fly machine
exists anywhere in the app. `UPCOMING_BIRTHDAY` is still a literal stub. `GroupReminder`
is still write-only (confirmed case-insensitively — `prisma.groupReminder` calls exist
only as `.create`/`.delete` in `groups.server.ts`, zero readers). VAPID gating is
unchanged. See the notification section below, which stands as previously written.

---

## The core finding of this session

**GiftPool is earlier-stage than it has been treated.** Across two days, nearly every
"what next" question surfaced the same thing: the product's core isn't built or proven
yet. Not "which feature next" — the honest finding is that GiftPool has essentially never
been tested on people outside the founder's social graph, and the return-reason that
would make anyone come back does not yet exist.

This is not failure. It's the actual stage. But it means the priority is building and
proving ONE coherent return-loop, not polishing or launching.

**Still true as of the 2026-07-11 discovery pass.** The person-surface actions and the
`createdById` field are architecture, not evidence — nothing above changes the
validation picture. See "Honest open risks," updated below.

---

## What the production data says (validation pass)

Read-only queries against the production LiteFS SQLite DB (earliest data May 2026;
~70 user accounts).

**Pools — essentially no usage.**
- 2 pools in the entire production history (one May 2026, one June 2026).
- 2 one-time organizers, zero repeat organizing, zero cross-participation.
- 0 pools have ever been created inside a group (`Pool.giftGroupId` always null).
- Pools are a recent addition; nobody has really used them. The earlier "Christmas
  spike then drop" story was about **wishlists**, not pools — and cannot be sourced from
  the pool data at all.

*(This pass predates the person-surface actions shipping — re-run this validation
query after there's been time for the new actions to see any use, rather than
assuming shipped ≠ used or shipped = used.)*

**Users — heavily zero-inflated; the real population is tiny.**
- 39 / 70 have zero wishlist items.
- 36 / 70 look like dead signups (0 items AND ≤1 session).
- 25 / 70 never had a session OR an item (likely non-real / throwaway accounts; some
  handles are obvious junk).
- Real engaged population is ~8 users, and even that is generous.
- Of the 31 users with ≥1 wishlist item, 23 added everything on a single day
  (one-and-done). Only 8 ever returned on 2+ distinct days; only 4 hit 4+ days.

**The engagement table is mostly the founder and immediate family.**
- The top wishlist-builders — twoplustwoone (the founder), burrito (wife), nburroni
  (best friend), imjezabel (SIL), qsnyder (her husband) — are all inner circle.
- Subtracting them, the count of genuine external engaged users is close to zero.
- **Implication:** engagement stats to date measure the founder's relationships, not the
  product. Interviewing friends/family teaches ~nothing about product-market fit.

**The Christmas pattern is an occasion signal, not a polish signal.** People showed up
in Dec 2025, built a wishlist in one sitting, and left (~200 days idle, 0 sessions
after). Strangers signed up and used the core wishlist feature — polish did NOT stop
signup or first use. What failed was the *second visit*. The dominant pattern is
seasonality + no-reason-to-return, not aesthetic bounce.

**Distribution:** GiftPool has NEVER been deliberately shown to anyone outside the
founder's social graph. There is no stranger population to interview or measure. A
Reddit / public launch is planned but was correctly deferred — launching to strangers
now would drive them to the same "made a wishlist, no reason to return" dead-end, just
at larger scale, burning a first impression.

---

## Schema gaps that matter

- ~~**No group-creator field.**~~ **RESOLVED.** `createdById` shipped on `GiftGroup`
  (#460, 2026-07-03), backfilled for historical rows, live-written at creation. The
  pool→group bridge is now measurable going forward. Note: authorization still runs
  entirely off `UsersInGiftGroups.role` — `createdById` is provenance/attribution only,
  not a permission input. Don't conflate the two if extending permission logic later.
- **No `PoolContributor` role flag** — organizer-vs-joiner requires joining back to
  `Pool.organizerId`.
- **No `User.lastActiveAt`** — recency proxied via `Session.createdAt` or
  `AnalyticsEvent.createdAt`.
- **`GiftIdea` is pool-bound only** — there is NO standalone "gift-list / ideas saved for
  a friend" concept in the data model. That feature is greenfield, not an extension.
  *(Note: the person-surface "save gift-list item" action, shipped in #461, writes
  somewhere — confirm whether this closes the gap or writes into a pool-bound
  structure by another name. Not yet re-verified against this specific claim.)*
- **Soft-delete asymmetry:** `UsersInGiftGroups` soft-removes (`removedAt`);
  `PoolContributor` hard-deletes (rejoin history not preserved).
- Analytics has no historical backfill — pre-instrumentation behavior lives only in
  domain tables.
- ~~**`shareWishlist`/`shareBirthday` write-only.**~~ **RESOLVED.** Now read in three
  places (person-surface loader, `birthday-visibility.server.ts`, `group-overview.server.ts`).

---

## Notification / outbound-messaging capability (the retention-engine audit)

*Re-confirmed unchanged as of the 2026-07-11 discovery pass.*

The retention thesis (beat 2: proactively reach out about upcoming occasions) requires an
outbound channel that fires when no other user is acting. Findings:

- **In-app notifications:** EXISTS AND WORKING — but only friend-request events feed it.
  No pool/group/wishlist events notify anyone. In-app is near-useless for retention (if
  they're in the app, it didn't bring them back).
- **Outbound email (Resend):** EXISTS AND WORKING — but 100% transactional
  (signup, verify, password reset, friend requests, feedback). Zero scheduled/proactive.
- **Web push:** EXISTS BUT DORMANT — fully wired end-to-end; no-ops until VAPID keys are
  set as Fly secrets; even then only fires on the same friend-request events. Adoption
  among users unknown.
- **Scheduled / proactive outbound:** **DOES NOT EXIST.** No cron, no worker, no scheduled
  Action, no timer anywhere. `fly.toml` has a single app process; no scheduled machines.
  - `UPCOMING_BIRTHDAY` notification type is a registered **stub** (confirmed verbatim
    at `notification-service.server.tsx:44-46` — a bare placeholder comment + return).
  - `GroupReminder` table is written by add/remove reminder actions (`groups.server.ts:383,404`,
    both permission-gated) but **read by no sender** — a dormant config table nothing
    acts on. (Confirmed case-insensitively; earlier capital-`G` grep had produced a
    false negative.)
  - Birthday logic (`getUpcomingBirthday`, 60-day window) is display-only.

**The good news reframe:** the retention engine is ~one component away, not five. Delivery
channels exist (email working; push wired, needs VAPID keys). The data exists (birthday
logic, `GroupReminder`, `UPCOMING_BIRTHDAY` type). The fanout (`notifyUser`) exists. What's
missing is **a scheduler** that wakes daily, reads upcoming occasions, and calls the
existing sender. Someone built the skeleton of beat 2 and never wired the heart.

**But — pipe ≠ retention.** Having the capability to send occasion reminders does not
prove people act on them. That is an empirical question no code inspection answers.

**This is now the single largest remaining piece of unbuilt beat-2/beat-3 infrastructure**
— with the person-surface action model shipped, the scheduler is the next structural
gap, not a parallel one. See "Honest open risks."

---

## The person-centric surface — no longer read-only (UPDATED 2026-07-11)

**Previous framing (superseded):** the page existed but was CRUD-style — no actions,
missing "action model."

**Current state, verified against #461 (merged 2026-07-03):** `/users/:handle` is now
a 1,426-line component with six real, non-stub actions, each doing a genuine write +
`queueLogEvent` call:

- Propose to pool
- Record pool outcome
- Record wishlist-purchase outcome
- Decline / undo occasion
- Create person note
- Save gift-list item

All previously-listed raw materials (avatar, birthday, mutual groups, mutual friends,
wishlist, occasion state) are pulled and rendered.

**What this resolves:** the "fifteen questions" and the action-model ambiguity
described in the previous version of this section are no longer open architectural
questions — an action model was decided and shipped.

**What this does NOT resolve, and should not be conflated with:**
- **Whether anyone uses these actions.** The production-data section above still
  shows ~2 pools ever created and a real engaged population of ~8 people, all inner
  circle, from *before* this shipped. There is no post-ship usage data yet, because
  there hasn't been time to generate any. Do not read "the action model is built" as
  "the loop works."
- **Whether the pool→group bridge (vision-spine's most important conversion) is wired
  through these actions**, or just adjacent to them. Not yet confirmed either way —
  worth a targeted check: does "propose to pool" from this surface actually route into
  the auto-suggest-a-group mechanic described in the vision doc, or is it a parallel
  path that doesn't yet feed the bridge?

**Revised "why this mattered" note:** the three threads that made this the keystone —
reminder destination, gift-memory accrual point, pool→group bridge — are now
*addressable* by this surface rather than blocked by its absence. That's real
progress. It does not yet mean any of the three threads has been *proven* to work
end-to-end. The keystone shifted from "does the destination exist" to "does the
scheduler that would send someone here exist" (it doesn't — see notification section)
and "do people act once they land here" (unknown).

---

## Current UX / implementation state (as of this session)

- Desktop group experience: good. **Now includes the desktop group dashboard**
  (Action feed + context rail layout), shipped via #450.
- Mobile group experience: partially reworked. Mobile Members tab updated (and its
  horizontal-overflow bug independently fixed and merged via #452). Mobile group
  **Overview** reworked (structure-only, "Option A": cap strip pinned top, For you /
  Coming up flow below, permission-gated invite in header, "Group info" grab-bag
  dissolved, group description moved to settings). This shipped/merged.
- A class of **mobile horizontal-overflow bugs** across group tabs was fixed
  (confirmed: #452, #454, #455, #456, #422 batch — all merged).
- Activity tab: hidden (was a "coming soon" placeholder); "activity feed = gift memory
  seed" filed for later.
- Deferred: page transitions (polish); the app-wide mobile visual overhaul (named large
  workstream); requiring birthdays / notification consent / VAPID activation.

**Realization banked:** a Claude Design mock of the Overview looked like a real mobile app
and the current build does not — because of spacing, typographic hierarchy, and per-card
actions, NOT colors. That gap is the app-wide mobile visual-language workstream. Real and
worthwhile, but deliberately deferred; do not let it leak into feature PRs screen by screen.
This has not changed — the mobile visual-language overhaul remains unscoped and unstarted.

---

## Honest open risks (do not paper over) — UPDATED 2026-07-11

- The entire retention thesis (organizer-pull → bridge → group → recurring occasions →
  reminders bring people back) is **coherent but unvalidated**. Every "bet" is an
  assumption about human behavior, testable only with real strangers you don't yet have.
  **This has not changed with the person-surface ship** — architecture landing is not
  validation landing.
- **The scheduler, not the person-surface, is now the clearest remaining structural gap.**
  With the action model shipped, beat 2 (proactive reminders) is the one piece of the
  four-beat loop with literally nothing built — not "unwired," genuinely absent. Building
  the person-surface without the scheduler means there's now a nice destination with
  no path leading to it.
- **New risk, specific to this ship:** six real actions were added to a single
  1,426-line component in one PR. Worth confirming (not yet checked) whether this has
  test coverage proportional to its surface area, given the founder's own atomic-commit
  principle exists partly to keep changes reviewable and recoverable — a monolithic
  action-bearing component is a different risk profile than a monolithic layout PR.
- The founder's stated bias — build the cool/bounded thing before proving the messy human
  assumption; reach for polish because it's comfortable — recurred repeatedly this
  session and should be actively guarded against. **Worth naming plainly: shipping six
  new actions on the person-surface before the scheduler that would drive traffic to
  them, and before any validation that the existing two pools' worth of usage
  generalizes, is a live instance of exactly this pattern**, not a hypothetical one.
