# GiftPool — Person Surface: Action-Model Spec (v1 draft)

*Paper-first artifact. Resolves the action model for the person-centric / gift-occasion
surface. Input to Claude Design; nothing here goes to Claude Code until the layout is
resolved there. Companion to `giftpool-vision-spine.md` and
`giftpool-state-of-reality.md`.*

*Standing caveat, kept deliberately at the top: this model derives from one founder
rehearsal (Cacho's August birthday) plus the vision docs. It is a hypothesis with good
posture, not a validated loop. Designing this surface is not evidence anyone returns.
The first real test fixture is the actual Cacho pool in August.*

---

## 1. Purpose — one sentence

The page for a person answers **"what should we get them, and who's in?"** — powered by
circle-private memory, with the pool as *output*, not centerpiece.

The old page answered "who is this person?" (a record). This one answers "a gift
occasion is coming — what do I do?" (a launchpad).

## 2. Positioning

- **The competitor is the minus-one splinter thread, not WhatsApp.** The chat
  conversation stays in WhatsApp; GiftPool is where the durable artifacts land — ideas,
  decisions, coverage, history. A minus-one thread covers exactly one recipient;
  GiftPool is one group, N hidden pools.
- **Circle-private memory only.** GiftPool cannot and must not compete with Google on
  gift inspiration. Every ideation source on this page must be something Google cannot
  know: what this circle gave, proposed, rejected, learned, noticed. Any feature idea
  for this page that is not circle-private memory is out of scope by rule.
- **Insider consults (e.g. recipient's spouse) are not mediated.** The consult happens
  in WhatsApp; the surface captures the *output* as a note. (A no-account "ask link" is
  a parked future organizer-pull mechanic — not v1.)

## 3. Page identity — DECIDED

**This is `/users/:handle` restructured, not a new page.**

Reasoning: every raw ingredient (wishlist, birthday, mutual groups, mutual friends) is
already on the profile; a second person-page splits identity ("profile or gift page?");
and the future occasion reminder needs exactly one canonical landing URL per person.
The profile stops being a record and becomes this surface.

## 4. Temporal states (what the page leads with)

| State | Trigger | Page leads with |
|---|---|---|
| **Occasion near** | occasion within reminder window (existing 60-day birthday logic, or tighter) | Occasion header ("Cacho's birthday · Aug 14 · in 6 weeks") + primary actions |
| **Cold** (no occasion near) | default | Dossier + capture ("save an idea," notes). Year-round capture lives here. |
| **Post-occasion** | an occasion just passed with a pool or solo intent attached | Memory write: confirm what was given / whether it landed |

Post-occasion detail: pool gifts write memory automatically from pool completion. Only
solo gifts need a manual confirm. Never nag for memory writes on occasions where the
viewer did nothing.

Occasion scope v1: **birthday only** (the only occasion the data model knows). The
header is designed occasion-generic so Christmas / custom occasions slot in later
without redesign.

## 5. Terminal states of a visit

A visit "worked" if it ends in one of:

1. **Organized** — a pool for this person exists.
2. **Committed solo** — a private solo gift intent exists.
3. **Idea saved** — a gift-list entry for this person exists (the lightweight
   non-commitment; this is the "deferred with a trace" state).
4. **Declined** — explicitly sitting this occasion out.

Leaving without action is permitted and undesigned — the occasion persists and the
(future) reminder fires again. **No snooze mechanism.** Snooze is reminder-*delivery*
logic; building it now smuggles scheduling infrastructure into a surface PR. When beat-2
delivery exists, snooze becomes its concern, not this page's.

## 6. Action model × relationship context

### Access gate — RESOLVED (verified against code, 2026-07-02)

**Unlock rule:** the surface unlocks for `FRIENDS` **or** ≥1 shared active group
(`removedAt: null`). All other viewers keep the existing `FriendGateCard` stub
(verified to expose identity only: id, name, username, avatar).

**Visibility model — union of grants, with one absolute override.**
`birthdayVisibility` (global, relationship-scoped: EVERYONE / FRIENDS_OF_FRIENDS /
FRIENDS / NOBODY) and `shareBirthday` (per-member-per-group, default true, backfilled
true) are independent *grant channels*, not layers:

> Birthday visible to viewer ⟺
> [relationship satisfies `birthdayVisibility`] OR
> [∃ shared group with target's `shareBirthday = true`]
> — EXCEPT `birthdayVisibility = NOBODY`, which wins over everything.

Reasoning: an AND/ceiling model would hide birthdays from non-friend groupmates under
the default global setting (`FRIENDS`), silently gutting the group product's core use.
The per-group toggle's copy ("Share my birthday with this group") is an explicit
affirmative grant and should behave like one. But NOBODY is the user screaming "hide
it" and must be absolute — accepting the rare loss of "hidden from friends, visible to
one group."

**Implementation prerequisite: extract a single `canViewBirthday(viewer, target)`
server helper** implementing the rule above, consumed by ALL birthday surfaces: home
panel (today checks only `birthdayVisibility`), group overview (today checks only
`shareBirthday` — the live NOBODY inconsistency), friend row, profile, and this
surface's occasion header. This mirrors the planned `canView` helper extraction from
the address-visibility workstream. No birthday surface may embed its own gate logic.

**Wishlist:** visible ⟺ `FRIENDS` (today's behavior) OR [shared group with
`shareWishlist = true`] — giving `shareWishlist` its first-ever reader. Claim state
travels with wishlist visibility. Consulting both toggles for the first time only
*adds* visibility for groupmates (who currently see nothing), so no regression; the
defaults-true backfill is acceptable because joining a gift group is contextual
consent for exactly this, and the toggle is prominent and editable.

**Mutual friends: friends-only.** A groupmate enumerating your friend graph leaks more
than either toggle governs. Mutual groups: visible to both (shared by definition).
**Person notes: private to author in v1** (shared-scope notes deferred — needs a
write-time visibility picker; pool idea proposals already cover collaborative
pitch-in). Circle memory (gift history, idea archive): keyed to the circle — visible
iff the viewer was in the pool/group the memory came from, regardless of friendship.
Actions (organize / save idea / decline): available to anyone past the unlock.

Terminal states are context-invariant. Only the route to **Organized** varies, via one
variable: the candidate contributor set.

| Context | Organize | Solo | Save idea | Decline |
|---|---|---|---|---|
| Groupmate, one shared group | Pool in that group | ✓ | ✓ | ✓ |
| Groupmate, multiple shared groups | **Picker — always ask, never default.** Wrong-default in a secrecy product = worst bug class; picker friction is recoverable, a visibility leak isn't. | ✓ | ✓ | ✓ |
| Friend only, no shared group | Standalone pool. **PHASED (2026-07-03):** v1 = create pool + existing share-link flow (organizer sends the link). The select-mutual-friends flow (design frame 2b) is **PR 2: pool invitations** — consent-based invite→accept, reusing the friend-request pattern and the `GroupInvitation` precedent. Direct-add of contributors is REJECTED: it drops a financial expectation on someone without consent, and with zero pool notification events they'd never know (ghost contributors). The bridge framing ("you share Cacho — organize together") stays as v1 copy on the entry card. | ✓ | ✓ | ✓ |
| No mutuals | Not offered | ✓ | ✓ | ✓ |

### Decline semantics — DECIDED
- Per occasion instance ("Cacho's birthday 2026"), auto-resets next cycle.
- **Private to the decliner.** Never visible to the group — visible declines are social
  surveillance and poison the warmth. Suppresses my reminders; converts my occasion
  header to a quiet "sitting this one out — undo" state.

### Solo gift — DECIDED, now verified viable
- Under the hood: a pool of one. **Verified clean in code**: no minimum-contributor
  constraint; `calculateContributions` handles N=1; `createPool` already seeds the
  organizer as sole first contributor; no group-only cap assumptions.
- In the UI: **never called a pool.** No organizer/cap/contributor ceremony. Language
  like "I've got this one covered."
- **v1 shortcut (verified):** for wishlist items, `WishlistPurchase` (claim = purchase,
  one per item) already functions as a solo commitment with dedupe. v1 solo-for-wishlist
  may be *presentation only* over existing claims; pool-of-one is needed only for
  off-wishlist solo gifts. Decide the split in design — but do not build a third
  intent record.

## 7. The ideation block — the body of the page

The center of gravity. Not the pool button. Sources, ranked by defensibility:

1. **Their wishlist** (exists) — re-presented as a gift *source* with per-item actions
   ("I'm getting this" / "propose to pool"), not a read-only list.
2. **What this circle gave before** — gift history per recipient. Written automatically
   by pool completion (+ solo confirm). Never manually curated.
3. **Proposed-but-unused ideas** from past pools — auto-archived. Prevents re-treading
   rejected ground and resurfaces near-misses ("we almost got him X").
4. **Notes about the person** — durable ("buys everything he wants himself → go for
   novelty") and fresh ("started running," "wife says he needs gear"). The only fully
   manual memory write besides saved ideas. Author-visible + circle-visible; never
   recipient-visible. Exact visibility rule to resolve in design.
5. **My saved ideas for them** (gift-lists) — the year-round capture habit,
   promotable to a pool proposal or solo intent when an occasion arrives.
6. **Budget context** — "this circle can cover ~$X." Verified: `Pool` has no cap/goal
   field; the number is the sum of per-member defaults (`groupMemberDefaults`) for the
   chosen circle, minus the recipient. Shown as ideation constraint only. Cap
   inheritance/freeze mechanics are pool-domain (see §10).

### Empty-state rule — DECIDED
**Memory sections are earned, not scaffolded.** A section renders only when it has
content. Day-one page = occasion header (if near) + wishlist + capture actions. No
empty museum boxes. Every dossier — including the founder's — starts at zero and cannot
be backfilled; therefore **write paths ship first, read views inherit.**

## 8. What existing page elements become

| Today (fact) | Becomes (entry point) |
|---|---|
| Wishlist | Gift source with claim/propose actions |
| Birthday | Occasion header + its countdown state |
| Mutual groups | Contributor-circle candidates for Organize |
| Mutual friends | Contributor candidates for standalone pool (bridge seed) |
| Avatar/handle | Unchanged identity block |

## 9. Schema reality — VERIFIED against code

Genuinely greenfield (migrations required):
- **Gift-list item** — idea saved for a person, no pool attached. (`GiftIdea` is
  pool-bound; confirmed no standalone concept.)
- **Person note** — durable/fresh notes, circle-visibility, never recipient-visible.
- **Occasion decline** — per viewer × occasion instance.
- **"Did it land" feedback** — the only missing piece of gift outcome.

Exists already (build on, don't duplicate):
- **Gift outcome core**: `Pool.chosenIdeaId` + `Pool.finalPriceCents`, set at `DECIDED`.
  Gift history = query over completed pools by `recipientUserId`.
- **Solo intent for wishlist items**: `WishlistPurchase` (claim = purchase, unique per
  item). Off-wishlist solo = pool-of-one (verified clean, §6).
- **Idea archive is a view, not a table — CONFIRMED**: `GiftIdea where
  pool.recipientUserId = X` (exclude `chosenIdeaId`). Unindexed but irrelevant at
  current scale. Caveats: free-text (`recipientName`) pools can't attach to a person
  page; and see the cascade risk in §10.
- Occasion data: birthdays only. `GroupReminder` is just `offsetDays` per group — a
  reminder *setting*, not occasion data. Confirms §4's birthday-only v1.

## 10. Filed elsewhere (explicitly not this surface)

- **Recipient-exclusion invariant — VERIFIED single-layer, fix specced.** The normal
  group flow is safe (route filters recipient out of `groupMemberDefaults`), but the
  invariant lives only in the one caller; `createPool` itself does no recipient
  filtering and doesn't guard organizer===recipient (tamperable). Since this spec adds
  new `createPool` callers (solo pool-of-one, standalone pools), the invariant moves
  into `createPool` + regression tests BEFORE surface work multiplies callers.
  Standalone fix PR; prompt already written.
- **Live consent inconsistency (pre-existing, production):** group-overview birthday
  list checks only `shareBirthday`; home panel checks only `birthdayVisibility`. A
  `NOBODY` user is still surfaced on group overview today. Resolved by the
  `canViewBirthday` helper unification (see §6 access gate) — can ship as its own
  small PR ahead of the surface.
- **Pool deletion destroys memory:** `GiftIdea` has `onDelete: Cascade` from Pool. Once
  gift history/idea archive matter, deleting a pool erases circle memory. Direction:
  pools should end in `CANCELLED`, not row deletion (mirrors the existing soft-delete
  asymmetry note). File with the memory workstream.
- **`GiftGroup.createdById` migration never landed** (decided in a prior session,
  confirmed absent — exists only on `GroupInvitation`/`GroupReminder`). The pool→group
  bridge remains unmeasurable. Small migration, do it regardless of this surface.
- **Cap freeze semantics** — "contributions inherited from group at pool creation,
  frozen at some moment" is unresolved spec. Pool-domain. Do not let it ride into any
  implementation as vibes. (PR-3 lesson.)
- Reminder delivery: scheduler, cron, VAPID, notification consent — beat-2 infra.
- Pool-created-in-group notifications to members (needed for "everybody gets notified"
  — currently zero pool/group events feed notifications). Adjacent PR, not this page.
- WhatsApp integration — parked, named, far.
- App-wide mobile visual overhaul — separate workstream; do not leak in.

## 11. Codebase verification — DONE (2026-07-02)

All eight original questions answered against code; findings folded into §§4, 6, 9, 10.
One check remains open:

> Read-only — do not modify. In the `pools+/new` action (and any other `createPool`
> caller): when a group pool has a `recipientUserId` who is a member of that group, is
> the recipient excluded from the seeded `groupMemberDefaults` contributors? Show the
> exact filter. Also check: can the recipient end up notified or listed via any
> contributor-facing query if seeded? Report, don't fix yet.

## 12. Design-audit deltas (2026-07-03 — overrides to the Claude Design mock)

The mock (`Person Surface (Mobile).dc.html`) passed audit with these binding overrides:

1. **Gated = absent.** Do NOT implement 3b's "Mutual friends hidden" box. Sections a
   viewer can't see simply don't render — no placeholder, no explanation.
2. **Frame 2b is PR 2, not this PR** (see §6 phasing). v1 friends-only Organize =
   standalone pool + share link. No picker UI implying direct-add.
3. **Notes are private-to-author in v1.** Section title must say so ("Your notes ·
   private" pattern, matching "Your saved ideas · private"). Mock's bare "Notes" title
   is ambiguous — do not implement circle-visible notes.
4. **Copy fixes:** drop "We won't remind you about this one" (2c) until reminder
   delivery exists — the decline record still suppresses future reminders when built.
   Drop "comfortably" from budget copy — the number is a ceiling (sum of caps), not
   comfort. Every budget figure (header, picker rows) excludes the recipient.
5. **Action row is a function of temporal state, not memory richness:** day-one (3a)
   in occasion-near state gets the same Just me / Save idea / Not this time row as 1a.

## 13. Suggested build order (after design, after verification)

1. Write paths: save-idea, person-note, decline, solo intent. (Memory starts accruing.)
2. Page restructure: temporal states + occasion header + action row.
3. Ideation block read views (inherit from writes + existing wishlist).
4. Post-occasion memory write (pool completion hook + solo confirm).

Rationale: the compounding asset can't be backfilled — every week without write paths
is a week of memory lost. Reads without writes are an empty museum.
