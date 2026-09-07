# Gift Pool UI Rework — Accepted Product and Implementation Handoff

Status: accepted for implementation planning on 2026-07-19

This document is the durable handoff from the repository audit, four Stitch iterations,
and the subsequent product-design grilling session. It defines the app-wide redesign
contract. It does not authorize treating generated Stitch copy, terminology, sample
data, or invented behavior as source of truth.

## 1. Authority and intent

Use these inputs in this order when they disagree:

1. Privacy, authorization, lifecycle, and domain rules in the repository and
   `CONTEXT.md`.
2. The accepted decisions in this handoff and ADRs.
3. Existing supported behavior, unless this handoff explicitly relocates, replaces, or
   deprecates it.
4. The latest accepted Stitch export as the visual and interaction anchor.
5. Generated Stitch terminology, copy, sample content, and behavior as proposals only.

The redesign is not a generic reskin and is not a conversion-focused SaaS launch. Gift
Pool should feel like a warm, capable companion that helps a small number of real people
care for one another over years. It should make organizing feel lighter without turning
friendship into a workflow dashboard or personal financial comfort into social pressure.

## 2. Product definition, users, and jobs

Gift Pool lets a friend group coordinate gifts for each other without spoiling the
surprise or doubling up. It coordinates intent and responsibilities; it never collects,
holds, or transfers money.

Primary users:

- The organizer who notices an occasion, starts a Pool, and keeps it moving.
- A contributor who joins, sets a private Contribution Limit, suggests or votes on a
  gift, and later pays the purchaser outside Gift Pool.
- The purchaser or deliverer who completes a concrete task on behalf of the Pool.
- A recurring Group member who wants upcoming occasions, useful gift memory, and a calm
  view of what needs attention.
- A wishlist owner who records useful items for friends and family.
- An invited visitor who needs enough human context and trust to join without first
  understanding the whole product.
- An administrator who needs dense, reliable operational information rather than the
  full consumer expression of the brand.

Core jobs:

1. Notice that someone matters soon.
2. Decide whether to organize, handle the gift privately, save an idea, or sit out this
   occurrence.
3. Coordinate a concealed gift with the right people.
4. Move the Pool through choosing, buying, and delivery without implying in-app payment.
5. Preserve factual gift memory that makes the next occasion easier.

Non-goals:

- Payments, balances, transfers, crowdfunding, or fundraising campaigns.
- Generic project management, party planning, or group chat replacement.
- Public social feeds, recipient surveillance, gift-performance scoring, or a photo
  album product.
- Decorative stock or lifestyle photography.
- A mascot-led illustration system or venture-style growth marketing posture.
- Secret Santa as part of this rework; it is a distinct future product over a shared
  secrecy primitive.

## 3. Canonical language

Use the glossary in `CONTEXT.md`. The most visible rules are:

- `Group` is the functional noun. `Circle` may appear only in warm prose about close
  relationships.
- `Pool` is an occasion-specific, recipient-concealed coordination effort, not a fund.
- Pool stages are `Collect ideas`, `Choose the gift`, `Buy the gift`, `Deliver it`, and
  `Complete`. `Cancelled` is separate. Joining is not a stage.
- A `Contribution Limit` is one person's private ceiling.
- `Available Budget` is the shared, dynamically derived sum of current limits. It is not
  directly editable.
- `Gift Price` is an estimated or final product cost. It is not a Pool goal.
- A `Contribution Share` is the calculated portion of Final Price owed directly to the
  purchaser. In context, the UI may say `your share`.
- `Received` means the purchaser confirmed receiving that share outside Gift Pool. The
  contributor cannot self-confirm it.
- `Person Notes` are author-private and labeled `Your notes · private`.
- An `Occasion Decline` is the private, undoable `Not this time` choice for one occurrence.
- `Gift Memory` is a factual history visible only to people who participated in that gift
  intent. Do not invent recipient sentiment.

Avoid `raised`, `funded`, `collected`, `gathered`, `pledge`, `campaign`, and other language
that implies Gift Pool holds money. Use `committed` only when describing coordination
capacity rather than completed payment.

## 4. Product posture and visual system

### Emotional posture

The core consumer experience should be joyful, familiar, and quietly personal. Joy comes
from thoughtful hierarchy, specific copy, warm color, expressive but restrained icons,
real avatars and gift images, and tactile feedback. The interface should not constantly
sell, celebrate itself, or manufacture urgency.

The same design system has three expressions:

1. **Companionable consumer:** Home, people, Groups, Pools, Friends, and Wishlist receive
   the fullest warmth.
2. **Quiet trust:** marketing, invites, authentication, and legal pages use the same
   system with less decoration and stronger clarity, privacy, and reassurance.
3. **Calm operations:** settings and admin use denser, more neutral composition with
   minimal decoration while retaining tokens, typography, accessibility, and interaction
   behavior.

### Typography

- Self-host variable Plus Jakarta Sans for display and major headings.
- Nunito Sans for body text, navigation, controls, forms, and dense operational content.
- Use system fallbacks and a deliberately small weight set.
- The foundation milestone must replace the current incomplete Nunito loading rather
  than layering new fonts over it.

### Semantic color

- Coral: primary action, emotional emphasis, and selected state.
- Teal: privacy, supportive coordination, completion, and calm secondary emphasis.
- Warm neutrals: canvas, grouping, and low-emphasis surfaces.
- Red: destructive actions and errors only.
- Amber: warning, waiting, time sensitivity, or blocked progress.
- Green: unambiguous success only, never generic money styling.
- Muted neutral: disabled, historical, or intentionally inactive states.

Do not use decorative gradient progress, color alone for meaning, or green merely because
an amount is shown. Dark mode needs dedicated warm, low-glare tokens rather than mechanical
inversion.

### Shape, elevation, and imagery

- Cards represent distinct interactive objects or important state, not every section.
- Ordinary sections use spacing, headings, dividers, and subtle tonal grouping.
- Controls use modest radii, cards medium radii, and sheets or large groupings larger
  radii. Reserve full pills for compact badges and segmented controls.
- Keep shadows low and ambient.
- Use only domain imagery: avatars and Wishlist, idea, chosen-gift, or product images.
- Every hierarchy must remain intentional with missing, loading, or broken images.
- Small expressive icons or occasional restrained illustrations are welcome; a mascot or
  full scene system is not.

### Motion

Routine interactions may have brief tactile feedback. One-time, non-blocking milestone
celebration is appropriate only for:

- first Wishlist item added;
- Pool created;
- gift chosen;
- gift delivered; and
- outcome recorded.

Do not celebrate settings, Contribution Limits, payment coordination, reminders, admin
work, errors, or permission changes. Respect reduced-motion preferences with equivalent
non-animated feedback.

## 5. Global information architecture

Primary navigation is identical in concept on mobile and desktop:

1. Home
2. Wishlist
3. Groups
4. Gifting — one tab owning two sibling surfaces, Pools (`/pools`) and Exchanges (`/exchanges`), switched by a segmented control at the top of each index. (Amended Sept 2026 when Exchanges shipped: a sixth top-level tab was rejected as too tight at 390px, and burying Pools under a renamed parent kept every pool deep link intact.)
5. Friends

Person pages are contextual destinations reached from Home, Friends, Groups, and Pool
recipient context. Profile, settings, notifications, feedback, and admin are utilities.
Creation actions belong in the surface where their meaning is clear; do not add an
ambiguous global floating `+`.

Mobile uses bottom navigation below 768px. Desktop uses top navigation at 768px and
above. Preserve visible current-location state, keyboard focus, pending feedback, safe
areas, notification access, and install-banner spacing.

## 6. Surface contracts

### 6.1 Public Home

Job: help a likely organizer recognize the problem and begin without presenting Gift
Pool as a product being aggressively sold.

Hierarchy:

1. A human, concrete explanation of coordinating gifts without spoiling the surprise or
   doubling up.
2. `Start a pool` as the primary action.
3. `Make a wishlist` as the secondary action.
4. A short, scannable explanation of how coordination works and what remains private.
5. A brief first-person note attributed only `A note from the maker`—no name, portrait,
   title, or founder persona.
6. Quiet trust/support/footer content.

Avoid repeated CTA bands, sales metrics, social proof inventions, pricing-style feature
grids, excessive benefit claims, and generic lifestyle imagery. The About page may carry
the fuller maker story.

Post-auth continuation is contextual:

- invite entry returns to that invite;
- explicit Pool intent continues to Pool creation;
- an organic empty account starts with the first Wishlist item;
- a returning account goes to temporal Home.

### 6.2 Authenticated Home

Job: answer `What deserves my attention, and who is it for?`

Hierarchy:

1. `For you`: at most three highest-value next actions, ranked by time and responsibility.
2. Upcoming occasions, leading to the relevant person page.
3. Active Pools, showing the viewer's responsibility rather than generic status alone.
4. Groups.
5. Recent earned Gift Memory.

All-caught-up states remain quiet. Secondary memory/history remains hidden until earned.
Do not turn Home into an analytics dashboard or duplicate whole Pool workspaces.

Current-code note: the existing route already branches between public and authenticated
Home and defers secondary panels through `/resources/home/panels`; its recent-activity
payload is currently an explicit stub. Do not disguise that stub as finished Gift Memory.

### 6.3 Friends and person pages

Friends is a directory of direct accepted friendships and pending requests only. A Group
member is not automatically a Friend. Groupmates remain reachable through Group rosters,
Home occasions, and contextual person links.

The person page is the durable person-and-occasion hub. It answers what the viewer can do
for this person, not merely who the person is.

Temporal hierarchy:

- Occasion near: occasion, countdown, and the next meaningful actions lead.
- Cold: Wishlist, private capture, and existing memory lead.
- Post-occasion: factual outcome/memory completion appears only when the viewer
  participated.

Actions:

- `Organize` creates or continues the appropriate Pool.
- `Just me` is a secondary private solo gift intent without Pool ceremony.
- `Save idea` writes private, durable capture.
- `Not this time` privately declines one occurrence and offers undo.

When a Pool already exists, show a compact status, participation, and next-action summary
with `Continue planning`; do not reproduce Pool controls on the person page. Label notes
`Your notes · private`. Sections the viewer cannot access are absent rather than rendered
as explanatory locked boxes.

### 6.4 Groups

A Group is the recurring occasion-and-memory home for one enduring set of people.

Hierarchy:

1. Upcoming occasions and Group-specific actions.
2. Active Pools.
3. Compact member context.
4. Earned past Gift Memory.
5. Supporting activity only when it is useful rather than a shallow join log.

Mobile uses clear `Overview` and `Members` destinations. Desktop composes a primary work
column with a compact contextual rail. Role-aware administration remains in Settings.
Show the viewer's own default Contribution Limit privately; do not show peer limits.

### 6.5 Pools

Pool detail is the sole operational workspace. Keep a stable shell—recipient/occasion,
stage, membership context, and appropriate utilities—while changing the main hierarchy
by stage:

- **Collect ideas:** idea capture and current ideas dominate.
- **Choose the gift:** comparison, voting or organizer choice, and decision state dominate.
- **Buy the gift:** chosen gift, Final Price, purchaser, Available Budget comparison, and
  private Contribution Share coordination dominate.
- **Deliver it:** deliverer and delivery completion dominate; payment status remains
  visible only where operationally necessary.
- **Complete:** factual Gift Memory dominates, with prior work collapsed into history.

Before a concrete gift price exists, show commitments or Available Budget without a
percentage. After an estimated or final product price exists, comparison or progress may
use that price as the denominator. Never invent a Pool funding goal.

Contribution and payment privacy is binding:

- A contributor sees their own Contribution Limit, Contribution Share, and status.
- Contributors may see aggregate Available Budget.
- A Pool Manager may see that a limit is missing, not the private amount.
- The purchaser sees each amount and Received status owed to them.
- Peers and non-purchasing managers do not see those individual amounts or statuses.
- Only the purchaser can mark a share `Received`.
- Copy must state that payment happens directly outside Gift Pool.

For a nonexistent, unauthorized, or authenticated-recipient-blocked Pool, return the same
ordinary `Not found` experience without revealing the Pool, recipient, or reason.

### 6.6 Wishlist

Wishlist is item-first. Adding and using items is primary; organizational machinery is
secondary.

- Categories appear only when used and should not dominate normal browsing.
- Category creation, movement, deletion, and reordering live in an explicit, accessible
  `Organize` mode.
- Past items are secondary memory.
- Viewer and public-share modes never expose owner controls.
- Link enrichment remains a convenience: only untouched fields are filled, failures are
  silent and manual entry remains complete.
- Product links continue through the existing safe outbound redirect and affiliate
  disclosure behavior.

Do not regress optimistic item/category behavior, claims, archives, public shares, image
fallbacks, validation, or accessible reordering while simplifying the visual surface.

### 6.7 Invites and authentication

Invite landings are context-first acquisition surfaces. Show the inviter and the specific
Group, Pool, person, or relationship context before asking for authentication. Explain
the relevant privacy or participation consequence in plain language. `Create account` is
primary for anonymous visitors and `Log in` secondary; both preserve the complete
`redirectTo` chain.

Dead or expired links receive a friendly state before authentication. Generic marketing
does not interrupt the invitation. Pool-recipient secrecy rules remain indistinguishable
from a bad link where required.

Authentication screens use the quiet-trust expression. Preserve verification resend,
start-over, target email, safe redirects, honeypot protection, and the login password's
presence-only validation rule.

### 6.8 Notifications, settings, and account

Notification settings should explain effective behavior, not expose sparse-row storage or
raw precedence rules. Use progressive disclosure around:

- global channel state;
- user-facing topics and categories;
- Group or Pool activity level;
- inherited behavior;
- explicit overrides; and
- reset to parent/default.

A disabled channel cannot be re-enabled by a child setting, but choices made while the
channel is disabled remain durable. Muted contexts, inherited mute awareness, and custom
topics must retain their current semantics.

Profile, privacy, security, session, and destructive account flows use the calm-operations
expression. Preserve confirmation, validation, reauthentication, success redirects, and
recoverable failure states. All modal account flows still follow the responsive-dialog
rule.

### 6.9 Admin

Admin is a dense operational product, not a consumer dashboard with extra cards. Preserve
the persistent seven-tab layout, role gate, live versus cached data semantics, tables,
search, drill-down, status filters, destructive confirmations, and last-admin protection.
Use compact responsive tables/lists, semantic status, and strong scanability. Decoration
is subordinate to reliability and information density.

## 7. State system

Every milestone must inventory relevant states rather than adding one global skeleton or
one generic error page.

### Loading and pending

- Use full-route skeletons only for navigation where the destination hierarchy is known.
- Use local skeletons for image/content regions whose layout is stable.
- Use inline pending labels or progress for mutations (`Saving…`, `Choosing…`) while
  preserving context and preventing duplicate submission.
- Preserve optimistic Wishlist and notification behavior where rollback is safe.
- Do not optimistically reveal secret resources or claim completion of irreversible
  lifecycle transitions before the server succeeds.

### Empty and no-result

- Primary destinations use one purposeful activation step.
- Secondary history/memory is hidden until earned.
- Search no-results and `all caught up` are quiet, local, and do not advertise unrelated
  features.
- An image-absent state is ordinary content, not an error.

### Validation and recoverable errors

- Keep entered values and associate messages with fields.
- State what happened and the next safe action.
- For transient failures, keep the user's context and offer retry.
- For rate limits, explain when to retry without shaming the user.
- For offline or interrupted mutations, distinguish unsaved local input from committed
  server state.

### Permission and lifecycle

- Hide actions the viewer is not authorized to perform.
- If an authorized viewer reasonably expects an action but timing, stage, or a prerequisite
  blocks it, keep it visible and disabled with a specific explanation.
- For everyone else, show the responsible person or state as information rather than a
  disabled control.
- Secret-resource errors intentionally remain generic.

### Success

- Prefer in-context state change plus concise confirmation.
- Redirect only when the user's job has moved to a different canonical surface.
- Reserve celebration for the five milestone events defined above.

## 8. Responsive and accessibility contract

Breakpoints and QA widths:

- Below 640px: every modal is a bottom sheet.
- At 640px and above: centered dialogs are permitted.
- Below 768px: bottom navigation.
- At 768px and above: top navigation.
- At 1024px and above: contextual rails and multi-column composition where useful.
- Maximum content width: 1400px.
- Required visual QA widths: 390, 640, 768, 1024, 1280, and 1440px.

Responsive behavior adapts hierarchy rather than mechanically stretching or stacking a
desktop page. Mobile prioritizes one job and keeps touch targets reachable; desktop uses
space for context without creating competing independent scroll columns.

Target WCAG 2.2 AA. At minimum verify:

- logical heading and landmark structure;
- keyboard access and visible focus for every interactive control;
- 44-by-44px practical touch targets for primary mobile controls;
- labels, descriptions, field errors, and status announcements;
- focus entry/return and dismissal for sheets/dialogs;
- non-color status cues and light/dark contrast;
- reduced-motion parity;
- zoom/reflow and long-name/long-title resilience;
- accessible Wishlist reordering with a non-drag alternative;
- no hover-only disclosure of essential information; and
- safe-area behavior for bottom navigation and sheets.

Use `ResponsiveDialog` for all modals. Raw `Dialog` and `MobileBottomSheet` remain
low-level primitives, not route-level choices.

## 9. Reusable implementation seams

Implementation should deepen existing primitives rather than create screen-local copies.

Shared foundation candidates:

- semantic color, typography, radius, elevation, motion, and focus tokens;
- application shell and canonical primary navigation configuration;
- page header with optional contextual identity, stage, and actions;
- `SectionHeader` and low-chrome section grouping;
- actionable person/occasion row or card;
- Pool stage indicator and stage-to-user-label mapping;
- `ForYou` action item with urgency, responsibility, and destination;
- domain image frame with loading, absent, and broken fallbacks;
- earned-memory section;
- inline status/success/error notice with announcement behavior;
- activation, no-result, not-found, and retry states;
- responsive action footer and `ResponsiveDialog` composition; and
- dense admin table/list primitives built over the existing `admin-ui.tsx` seam.

Reuse or evolve these existing areas rather than bypassing them:

- `app/components/nav/` and `app/root.tsx` for shell and navigation;
- `app/components/ui/responsive-dialog.tsx` for every modal;
- `app/components/ui/empty-state.tsx`, `skeleton.tsx`, and
  `app/components/error-boundary.tsx` for the state system;
- `app/components/invite-landing.tsx` for all invite kinds;
- `app/components/users/person-surface.tsx` for the canonical person experience;
- `app/components/wishlist/` for item, category, share, optimistic, and reorder behavior;
- Group overview server/view modules rather than duplicating occasion/action queries; and
- Pool route/server modules and the contribution calculator rather than computing lifecycle
  or financial projections in presentation components.

Implementation recommendation: establish small, typed view models at privacy-sensitive
loader boundaries. Components should receive only what the current viewer may render,
especially for Contribution Limits, Contribution Shares, birthday visibility, Wishlist
visibility, and recipient-concealed Pool data.

## 10. Data, server, and migration work

The redesign does not authorize adding domain behavior merely because a mock shows it.
Known implementation work includes:

1. **Contribution privacy migration.** Enforce private server projections first, add
   direct authorization tests, remove Group and member budget-visibility settings, then
   migrate away `GiftGroup.budgetVisibility` and
   `UsersInGiftGroups.budgetVisibilityOverride` in the same milestone. See ADR 0001.
2. **Private payment projections.** Separate contributor, purchaser, manager, and peer
   views. Current `PoolContributor.hasPaid` may remain the persistence primitive, but UI
   and mutations must express purchaser-confirmed `Received` and enforce purchaser-only
   writes.
3. **Home aggregation.** Build the accepted temporal action model from current domain
   queries. Replace the recent-activity stub only with factual Gift Memory, not synthetic
   activity.
4. **Pool stage mapping.** Keep internal statuses stable unless a separate domain need
   requires migration; map them to the accepted user-facing stages in one shared module.
5. **Existing person primitives.** `GiftListItem`, `PersonNote`, `OccasionDecline`, Pool
   outcomes, and Wishlist claims already exist. Reuse them; do not create parallel intent
   records.
6. **Notification UI.** Preserve the existing policy seam and sparse storage. The rework
   is primarily an effective-policy presentation problem, not a reason to rewrite the
   dispatcher.
7. **Images and fonts.** Asset changes must preserve CSP, responsive loading, layout
   stability, and current safe product-link/image routes.

Any newly discovered behavior gap must be added to the matching milestone plan and
resolved as product/domain work before its UI is implemented.

## 11. Analytics

Preserve the typed registry and existing funnel pairings. Do not widen analytics event
names to strings.

At minimum, the rework must preserve or deliberately remap:

- `home_cta_clicked` with corrected organizer-first CTA properties;
- invite landing to Group/Pool/Friend completion pairings;
- Wishlist editor opened to item added;
- Pool creation and contributor joining;
- Wishlist share reach and outbound-link clicks;
- occasion reminder delivery to notification/email click-through; and
- notification clicks and existing outcome-coded enrichment events.

Implementation recommendation: each milestone should define whether hierarchy changes
need a new entry event or only updated properties. Register any new event before use and
keep anonymous/user identity rules intact. Analytics must not leak private limits,
individual shares, notes, or concealed recipient details.

## 12. Delivery sequence

Ship through dedicated branches and independently reviewable PRs. No persistent runtime
redesign flag is planned; use coherent route-family cutovers and reversible commits.

### PR 1 — Foundation and shell

- Tokens, complete font loading, dark mode, focus and motion foundations.
- Canonical mobile/desktop navigation and page-width behavior.
- Shared headers, sections, images, notices, states, and responsive-dialog audit.
- No broad domain behavior change.

### PR 2 — Acquisition and trust

- Public Home, About/support alignment, invite landings, authentication, verification,
  and public Wishlist.
- Correct organizer-first entry and redirect continuation.

### PR 3 — People and activation

- Authenticated Home, Friends, person page, and first-Wishlist-item activation.
- Temporal action hierarchy, private notes/declines, solo intent, and compact existing-Pool
  continuation.

### PR 4 — Groups and Pools

- Group hub and stage-adaptive Pool workspace.
- Contribution privacy projections, settings removal, schema migration, payment privacy,
  and purchaser-only Received behavior.
- This is the highest-risk authorization milestone and may be split into a privacy/domain
  PR followed by a visual route-family PR if reviewability requires it.

### PR 5 — Wishlist depth

- Item-first owner/viewer/public composition and accessible Organize mode.
- Preserve enrichment, claims, optimistic mutations, archives, category behavior, sharing,
  and outbound links.

### PR 6 — Preferences and account

- Effective notification-policy UI, profile/privacy/security/session flows, and danger
  zone.

### PR 7 — Operations and completion

- Admin expression, secondary routes, error-system completion, and app-wide terminology,
  accessibility, responsive, light/dark, and image-fallback audit.

Use atomic conventional commits within every PR. Include screenshots or video for visual
changes, migrations/environment notes, test plan, and updated checklist items. Monitor CI
and Sonar to green before considering a PR complete.

## 13. Milestone capability inventory

Before changing a route family, list every supported capability and mark it:

- preserved in place;
- relocated or progressively disclosed;
- replaced with behaviorally equivalent interaction; or
- intentionally deprecated, with rationale and migration.

Stitch omission is never evidence that a capability may be removed. Inventory at least:

- permissions and secrecy;
- loader/action validation and success redirects;
- optimistic and pending behavior;
- loading, empty, error, not-found, rate-limit, and offline behavior;
- dark mode and responsive sheets/dialogs;
- keyboard, focus, reordering, and announcements;
- analytics and notification side effects;
- public/invite redirect continuation;
- image and no-image variants; and
- admin cache/live-data semantics where applicable.

## 14. Verification and visual evidence

Every PR receives proportionate unit, route, component, and E2E coverage. Privacy changes
require direct unauthorized requests, not only hidden-button assertions.

Representative visual evidence must cover:

- 390px mobile and at least one 640/768 boundary case;
- 1024px composed layout and 1280/1440 desktop width;
- light and dark mode;
- content-rich, primary-empty, loading/pending, validation/error, and permission/lifecycle
  states;
- no image and broken image;
- bottom sheet and centered dialog variants; and
- long names, long gift titles, and increased text size.

Final acceptance requires:

- existing capabilities preserved or explicitly migrated;
- the agreed Home, person, Pool, Group, Wishlist, and invite hierarchy coherent app-wide;
- companionable consumer, quiet-trust, and calm-operations expressions clearly related;
- responsive, light, dark, and image-absent parity;
- WCAG 2.2 AA keyboard, focus, reordering, status, reduced-motion, and touch behavior;
- proportional loading, empty, validation, optimistic, success, permission, rate-limit,
  offline, and error coverage;
- direct authorization tests for privacy changes;
- green CI and Sonar; and
- a final visual and terminology audit with no unintended fragments of the old and new
  systems.

## 15. Source and attachment checklist

Implementation and any milestone-level design review should receive:

- the latest accepted Stitch export (iteration 3) as a visual reference;
- representative current screenshots for the route family being changed;
- this handoff;
- `CONTEXT.md`;
- `docs/adr/0001-private-contribution-limits.md`;
- `docs/product/giftpool-vision-spine.md`;
- `docs/product/giftpool-state-of-reality.md`;
- `docs/giftpool-person-surface-action-model.md`;
- `AGENTS.md`, especially responsive-dialog, authorization, analytics, and side-effect
  rules; and
- the relevant routes, server modules, components, and tests named in the milestone.

The accepted Stitch export is a visual anchor, not a complete screen inventory. When a
milestone needs additional layout resolution, request only the smallest representative
mobile and desktop frames plus state/interaction notes. Do not restart broad app-wide
generation.

## 16. Implementation boundary

Shared understanding and the design checkpoint are complete. Production implementation
may begin only after opening a dedicated PR branch and translating the first milestone
into a route/component capability inventory and verification checklist. Do not redesign
the accepted hierarchy while coding; bring any material conflict back to this document
and the local plan.
