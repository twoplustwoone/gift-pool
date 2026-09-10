# GiftPool — Vision & Strategy Spine

*Established over a multi-day working session. This is the product spine: what GiftPool
is, who it's for, how it acquires and retains, where it's going, and the boundaries that
keep it coherent. Companion to `giftpool-design-rules.md` (design) and
`giftpool-state-of-reality.md` (what's actually built + what the data says).*

---

## The one-line definition

**GiftPool lets a friend group coordinate gifts for each other without spoiling the
surprise or doubling up.**

The distinguishing clause ("without spoiling the surprise or doubling up") is
deliberately concrete. It names the two failure modes generic coordination tools
(group chats, shared docs) cannot solve, and it justifies the core architecture: the
hidden-from-recipient state isn't a feature, it's the reason the product exists.

Note on the earlier draft "without uncertainty and friction": rejected. Those are
abstract nouns that describe any coordination tool ever built — they'd survive being
pasted onto a competitor's landing page unchanged, which means they don't define
anything. The test for the definition's distinguishing clause: it must NOT be liftable
onto Asana's or Elfster's website.

---

## Hard boundaries (settled, do not reopen)

- **Coordinates contributions; never moves money.** GiftPool tracks who's covering what
  toward a gift — a shared ledger of intent. It never collects, holds, splits, or sends
  funds. The handoff to actual money (Venmo, cash) happens person-to-person, outside the
  app. Rationale: cross-border + multi-currency + money-handling liability is a swamp
  the app was never meant to enter, and it was never the problem being solved.
  - **Language discipline:** "distributing money" ≠ "coordinating money." One word apart,
    a legal department apart. The per-member contribution cap is a *coordination* feature
    (each person privately sets what they'll cover; the group sees "you're at $95 of $120"),
    NOT a payments feature. Mis-filing it as payments scares you off your own good idea.

- **Affiliate monetization is cost-offset only, never an engine.** Small, deliberate,
  never a growth lever. This is load-bearing, not modest: the moment affiliate becomes a
  money engine, it applies pressure toward scale, strangers, and a data product — i.e.
  toward Direction C (below), which kills the warm, friends-helping-friends soul of the app.
  Keeping affiliate small is what keeps GiftPool on the warm path.

---

## The shared primitive

Underneath everything is one primitive: **a secret gift-intent** = a recipient + a
visibility rule + the coordination around it.

Everything is an arrangement of this primitive:
- **Pool** = many-to-one arrangement (the group converges on one recipient, hidden from them).
- **Secret Santa** = one-to-one closed-loop arrangement + an assignment algorithm.
- **Gift-lists** (ideas saved for another person) = a personal arrangement.
- **Pool → group transition** = a visibility state-change on the primitive.
- **Gift feedback** = an annotation on the primitive.

**Pools and Secret Santa are two distinct products, one shared secrecy primitive.**
- NOT "Secret Santa is a kind of pool" (wrong topology — pool is many→one, Secret Santa
  is a closed loop of one→one).
- NOT "they're totally different" (undersells the reuse).
- **Implication:** when Secret Santa is built, reuse the visibility-boundary machinery;
  only write the genuinely new parts (assignment algorithm + closed-loop constraint).
  Do NOT reimplement the secrecy mechanism. Do NOT merge them into one first-class UI
  object — a user organizing a Secret Santa and a user chipping in for Dad are in
  different mental modes. Shared primitive underneath, distinct products on top.

Note: Secret Santa is table-stakes for a gift-coordination app ("bare minimum"), i.e. a
reason to be *considered*, not a differentiator and not a retention hook.

---

## Acquisition model

**Organizer-pull (Option 2 of three considered).** Every gift occasion has one person
who organizes. Build GiftPool to make *that person's* life dramatically easier; they
create a pool, send a link, and drag everyone else in. You only have to convince the
organizer — they do your customer acquisition for you. Value arrives for the others
*after* they're pulled in, not before.

The two rejected alternatives:
- *Option 1 (solo-first):* wishlist as a solo tool useful before any network exists.
  Real, but felt like "just another CRUD app" for the pool case.
- *Option 3 (recipient-initiated):* recipient shares a wishlist they wanted to make
  anyway. Rejected — felt like the wrong path.

Supporting mechanic: **guest/link-based join** lowers friction for the pulled-in people.
An invite link where the joiner logs in or creates an account (they always arrive
authenticated — this is NOT unauthenticated participation). The eventual model is
invite → accept/decline (mirrors the friend-request pattern), keeping membership
consent-based rather than link-drops-you-in. *Parked as future work.*

---

## The bridge (acquisition → retention)

**Pool → auto-suggested group.** This is the single most important conversion in the
whole product, and it did not exist as a named concept before this session.

- Acquisition lands people in a *pool* (episodic: gift given, done).
- Retention lives in *groups* (recurring).
- Without a bridge, every acquired user stays in the episodic thing and never reaches the
  sticky thing. The auto-suggest-a-group-after-a-pool moment is the escalator between them.

**Critical caution:** the pool was hidden from its recipient. Converting it to a group
means the recipient joins and becomes visible. That transition is a **secrecy
state-change** — precisely where visibility bugs hide. The group must carry over NO
residue of the hidden pool (past contributions, who-covered-what, the fact that the
person was a concealed target). Design this boundary explicitly; do not wing it.

**Status note (2026-07-11):** `GiftGroup.createdById` shipped (#460), which unblocks
*measuring* this bridge once it's built. Not yet confirmed: whether the bridge itself —
the actual auto-suggest mechanic — has been built, or whether the newly-shipped
person-surface actions (see state-of-reality doc) route through it or run parallel to
it. Treat the bridge as still unconfirmed-built until checked directly.

---

## Retention model

**The standing group is the retention object, because occasions recur on their own.**
This is real retention, not a hook: the calendar produces occasions (birthdays,
holidays) whether GiftPool exists or not. The group is the container that *remembers*
them so nobody has to scramble. GiftPool becomes the thing that quietly de-panics the
whole gift category for a fixed set of people.

**The retention loop has four beats:**
1. A group exists and persists (roster of people you recurringly give to).
2. The group knows occasions are coming and **surfaces them proactively** — reaches out
   *before* you'd otherwise remember. **This is the actual retention mechanism** — the
   only beat that brings someone back unprompted. A group that sits silent until you
   open it retains no better than a spreadsheet.
3. When an occasion hits, coordinating the gift is effortless (pool, caps, no-double-up).
4. After the gift, the memory persists (what was given, whether it landed) — which makes
   beat 2 smarter next time and is the compounding asset.

**Status note (2026-07-11):** beat 3's destination (the person-centric surface) and a
plausible start on beat 4 (person notes, purchase-outcome recording) now exist in code
— see state-of-reality doc for what shipped and what's still unverified about them.
**Beat 2 remains entirely unbuilt** — no scheduler exists anywhere in the app. Of the
four beats, beat 2 is now the one clear structural gap; it was already flagged as "the
actual retention mechanism," so this is not a minor omission.

**Honest distinction to hold onto:** polish affects whether people *sign up*. It does
almost nothing for whether they *come back*. The return-reason is the loop above, not
aesthetics. (Caveat: for a referral-shared app, looking legit may be part of why a
friend-of-friend trusts it enough to invest — plausible contributor, NOT proven cause.
Untested.)

---

## Long-term direction

**Direction A — go deep on the same people. The "group's gift memory over years" app.**
Chosen. GiftPool stays tightly about your fixed circles and gets richer: gift history,
"what worked," recurring-occasion memory, taste over time. "Spotify Wrapped for gifts"
is one expression — but the Wrapped is warm ONLY if the gift memory underneath is real.
Build the memory (accrued honestly over a year); the recap falls out of it for free.
Build the recap first and it's a hook with nothing behind it.

- The compounding asset is gift memory — worth more in year three than year one, which is
  exactly the property you want in a retention product. This is the thing the big one-off
  apps (Elfster, DrawNames, Giftster) structurally cannot offer, because they're built
  around single events, not enduring circles. **It is both the differentiator and the
  only real retention mechanism.**

**Direction B — go wide on occasions** (group coordination beyond gifts: surprise
parties, group trips). The *only sanctioned future expansion of A*, and only if the
primitive genuinely stretches. Risk: "smuggling in a second app." Be ruthless that each
expansion truly reuses the primitive rather than just sounding adjacent.

**Direction C — become infrastructure / a wishlist-gift-graph layer.** A flagged trap.
Sounds ambitious; kills the warmth. Implies scale, stranger network effects (the
cold-start monster at full size), and drifts toward an ad-adjacent data product. This is
where affiliate-as-engine would tempt you. Do NOT go here.

**Success definition:** a product a small number of real people love and use for years.
Not venture-scale, and nothing indicates it needs to be. "Small" only if you think a
product used warmly by close circles for years is small — it isn't.

Feedback on gifts ("did they like it?"): potentially lovely and enriches the memory, but
brushes the secrecy boundary and a social-awkwardness nerve. Giver-visible feedback is
warm; leaked or pressure-to-rate feedback is cold and possibly hurtful. Promising;
design the boundaries deliberately.

---

## Named future workstreams (not yet scoped)

- **The person-centric / gift-occasion surface** — ~~THE current keystone~~ **SHIPPED
  (2026-07-11, PR #461)**: no longer a "not yet scoped" item. It now has a real action
  model (six actions — see state-of-reality doc). Whether it's *working* (driving the
  pool→group bridge, generating gift memory anyone returns to see) is unvalidated —
  that's a usage question, not a build question. Do not re-scope this as if it still
  needs designing; it needs *observing*.
- **Proactive occasion reminders** (beat 2) — requires net-new scheduling infrastructure.
  **Still true, unchanged, and now the clearest remaining named gap** in the four-beat
  loop — see retention-model status note above.
- **Mobile visual-language overhaul, app-wide** — the app doesn't look like a real mobile
  app; this is a large, deliberate workstream, NOT folded into feature PRs. Unchanged;
  still unstarted as of 2026-07-11.
- **Gift-lists** (ideas saved for others, promotable to a target user when they join) —
  previously greenfield (did not exist in the data model). **Status unclear as of
  2026-07-11**: the person-surface ship included a "save gift-list item" action; not yet
  confirmed whether this created the standalone data-model concept described here, or
  writes into the existing pool-bound `GiftIdea` structure under a different UI label.
  Worth a direct check before treating this workstream as either done or still greenfield.
- **Secret Santa** — shipping as **Exchanges** (Sept 2026): distinct product, shared secrecy
  discipline. Phase A (core loop: setup → gather → draw → gift progress → reveal) is in review;
  notes/clues/guesses (Phase B) and standalone invites, splice, and the cross-year archive
  (Phase C) follow. See `.agents/plans/exchanges/plan.md` and the "Exchanges" section of
  `AGENTS.md`.
- **Activity feed / gift memory** — seeded from the (now hidden) Activity tab; build as
  the beginning of the gift record, not a shallow "X joined" log. Unchanged; Activity tab
  still hidden as of 2026-07-11. Note: the person-surface "create person note" and
  "record pool/purchase outcome" actions are adjacent to this workstream — worth checking
  whether they've quietly begun to satisfy it before scoping this as a separate effort.

---

## Standing principles (how the work is done)

- **Spec clarity before Claude Code is non-negotiable.** Ambiguous layout problems handed
  to Claude Code produce unsatisfactory results (hard-learned on PR 3). Resolve on paper
  (or in Claude Design) first.
- **Loose language is expensive.** Flag imprecise product language early ("distributing"
  vs "coordinating" money) — it prevents downstream rework.
- **Security verified server-side, not just enforced in UI.** Any permission-gated UI
  control must have a verified server-side authorization check on its action, with a test
  that a non-permissioned direct request is rejected. (Candidate line for
  `giftpool-design-rules.md`.)
- **Atomic commits within PRs**, even monolithic ones (sole reviewer; monolithic is
  acceptable, atomic commits are for recoverability). **Worth revisiting in light of
  #461**: six real user-facing actions landed in one PR on one 1,426-line component —
  confirm this PR still honored atomic, backable-out commits internally, or note it as a
  case where the monolithic-PR pattern strained against its own rationale.
- **Don't reimplement shared primitives.**
- **Claude Design for layout/hierarchy → Claude Code for implementation.** Deliberate
  sequencing.
