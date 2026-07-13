# Notification coordination architecture

Status: Proposed for product and design review

Last updated: 2026-07-13

## Purpose

Gift Pool needs useful coordination notifications without training people to
disable notifications altogether. This specification separates notification
events, user-facing preferences, contextual activity levels, delivery, and
organizer nudges so each can evolve without turning one registry or dispatcher
into a catch-all.

The first implementation should preserve existing friend-request and birthday
behavior, then add scoped controls and a small set of automatic pool updates.
Preset organizer nudges follow only after automatic coordination has shipped
and been measured. General messaging and free-form broadcasts are out of scope.

## Product principles

1. Relevance comes before reach. A notification is eligible only after privacy,
   membership, state, and preference checks pass.
2. Global choices are a ceiling. A pool or group can narrow notifications but
   cannot silently re-enable a globally disabled topic or channel.
3. Email and web push are opt-in for every newly introduced topic. Existing
   defaults remain unchanged during migration.
4. Context settings use a small number of understandable activity levels;
   central settings retain topic-and-channel precision.
5. Muting is visible and reversible. A persistent indicator remains while the
   context is muted, while the explanatory notice can be dismissed.
6. Domain mutations commit before notification fanout begins. Notification
   failure never converts a successful domain mutation into a failed response.
7. Delivery claims, not visible bell rows, determine idempotency. Deleting a
   notification never makes it eligible for redelivery.
8. Pool secrecy is a hard constraint. A pool recipient is never an audience
   member and must not learn that the pool exists through delivery, analytics,
   errors, or timing-sensitive endpoints.

## Current-state inventory

### What exists

- `notification-registry.ts` registers three concrete types: friend request
  received, friend request accepted, and upcoming birthday. It also contains
  payload shapes and default channel settings.
- `notification-service.server.tsx` resolves preferences, renders content, and
  sends through in-app, email, and web-push paths.
- `UserNotificationPreference` stores one row per user and concrete type.
  Settings-page reads materialize missing rows; hot-path reads inherit registry
  defaults without writing.
- `NotificationDelivery` is the recurring-delivery ledger. Birthday reminders
  use a channel-specific source identifier and claim before sending.
- `Notification` is the visible in-app read model. Users can mark rows read or
  delete them.
- Birthday reminders already isolate channel failures, preserve privacy rules,
  and permit a channel enabled mid-window to deliver without repeating channels
  already claimed.
- Pool and group activity tables provide audit history but are not notification
  sources today.
- `PoolMessage` exists in the Prisma schema, but has no routes, permissions,
  delivery behavior, or UI. It is dormant future infrastructure, not a current
  messaging feature.

### Expansion risks

The current concrete notification type is simultaneously an event identifier,
a preference key, a renderer key, a default-policy key, and part of the dedupe
strategy. Adding every pool occurrence to that list would expose implementation
detail to users and make the dispatcher wider with each feature.

Other gaps to resolve during the architecture refactor:

- Category labels live in the settings route rather than the catalog.
- “Disable all email” updates current type rows but is not a durable channel
  gate; a future type can inherit an enabled email default.
- One-shot friend notifications dedupe only the in-app row and use a
  check-then-create flow. Email and push have no common delivery claim.
- Friend-request channel sends are sequential and are not fully failure
  isolated.
- Web push captures endpoint failures internally and returns no delivery
  outcome. A caller cannot distinguish accepted delivery, no subscription,
  unavailable configuration, or complete failure.
- The admin opt-out matrix counts persisted rows rather than effective choices,
  so missing default rows and context modes can produce misleading percentages.
- `GroupReminder` settings are persisted and presented as functional, but the
  birthday sweep does not consume them. Occasion schedule policy must not be
  confused with recipient delivery preference.
- `app/utils/notifications.ts` duplicates part of the notification type model
  used by the server registry.

## Domain language

### Notification event

A concrete domain occurrence that may produce delivery, such as “vote started”
or “purchaser assigned.” An event is an implementation and analytics unit; it
is usually too specific to be a user-facing preference.

### Notification topic

A stable user-facing preference unit that groups related events, such as
“Ideas and voting.” Users configure topics by delivery channel.

### Notification category

A high-level grouping of topics, such as “Pool coordination.” Category changes
are convenient bulk overrides; topic choices remain more specific.

### Notification context

The group or pool whose activity setting can further filter an eligible event.
Friend and account-level notifications have no group or pool context.

### Activity level

The amount of contextual activity a user wants: `ALL_ACTIVITY`,
`IMPORTANT_ONLY`, `MUTED`, or `CUSTOM`.

### Effective notification policy

The resolved per-channel decision produced from catalog defaults, global
channel gates, category and topic overrides, and context activity. It includes a
reason and source for each decision so UI, tests, and operations can explain it.
Delivery capability is evaluated afterwards by the channel adapter and appears
in the dispatch outcome rather than the stored preference policy.

### Activity update

An automatic notification caused by a domain event. It has no user-authored
body.

### Organizer nudge

A preset, task-bound request sent by a pool manager to currently eligible pool
contributors. It is not a message or broadcast.

### Pool manager

A user allowed by `canManagePool`: the pool organizer or an owner/admin of its
parent group. “Pool owner” should not be introduced because it conflicts with
the actual organizer and group-owner concepts.

### Message

Persisted user-authored conversation content. Messages require a separate
product, moderation, permission, and delivery design and are explicitly outside
the notification/nudge work.

## Proposed module design

The architecture uses four deep modules and keeps audience selection in the
domain that owns the relevant privacy rules.

### 1. Notification catalog

The catalog is the typed source of truth for:

- event-to-topic and topic-to-category mappings;
- event importance;
- whether an event supports a group or pool context;
- supported channels and default topic/channel choices;
- payload schema and rendering adapter;
- occurrence-key strategy.

Its interface is lookup and validation. Storage, user rows, and sending do not
belong here. Adding an event to an existing topic should not add a new setting.

### 2. Effective policy resolver

The resolver owns inheritance and returns an explainable decision for each
channel. Callers provide a recipient, event, and optional context; they do not
query preference tables themselves.

Suggested interface:

```ts
resolveNotificationPolicy(input): Promise<ResolvedNotificationPolicy>
```

The result should distinguish `allowed`, `preference_disabled`,
`context_muted`, `context_filtered`, and `unsupported` rather than collapsing
every non-send into `false`.

### 3. Notification dispatcher

Domain callers submit a typed intent containing the event, recipient,
occurrence key, context, actor where applicable, and event payload. The
dispatcher hides preference resolution, channel claims, rendering, delivery
adapters, in-app-row creation, failure isolation, observability, and outcomes.

Suggested interface:

```ts
dispatchNotification(intent): Promise<NotificationDispatchResult>
queueNotification(intent): void
```

`queueNotification` is for already-committed interactive mutations and captures
unexpected rejection. Scheduled or administrative commands use
`dispatchNotification` when their summaries need the result. The two paths use
the same dispatcher and never duplicate delivery logic.

### 4. Channel adapters

In-app, email, and web push form a real adapter seam because all three implement
the same send contract. Each adapter returns one structured outcome:

- `delivered`: the provider accepted at least one delivery;
- `unavailable`: configuration or recipient capability is absent;
- `failed`: delivery was attempted but no endpoint accepted it.

Web push must aggregate device results. No subscriptions or missing VAPID
configuration is `unavailable`; at least one accepted endpoint is `delivered`;
all attempted endpoints failing is `failed`. Endpoint cleanup remains internal
to the adapter. The dispatcher performs the adapter's non-mutating capability
check before claiming a delivery, then records any capability race that occurs
during the send as the claimed channel's terminal outcome.

### Domain audience modules

Audience selection is intentionally not generalized. Friend, occasion, group,
and pool modules own membership, actor exclusion, current-state eligibility,
and privacy. They produce notification intents only for eligible recipients.
The dispatcher is a delivery module, not an authorization oracle.

Pool audience rules are mandatory:

- always exclude the concealed recipient;
- normally exclude the actor;
- include only current contributors;
- apply direct-assignment events only to the assigned user;
- do not expose contribution amounts or individual vote choices.

## Preference model and precedence

Preferences have two independent axes: central topic/channel policy and
contextual activity level. Context settings filter; they never grant a channel
or topic that central policy disabled.

For each candidate channel, resolve in this order:

1. Reject recipients that fail domain eligibility, privacy, or authorization.
2. Reject channels the event does not support.
3. Apply the user's global channel gate. A disabled gate is absolute.
4. Apply a topic override when present.
5. Otherwise apply a category override when present.
6. Otherwise use the catalog's topic/channel default.
7. For contextual events, apply the effective pool/group activity level.
8. Ask the channel adapter to confirm capability, such as a live push
   subscription, before claiming and sending.

A topic override is more specific than a category override and may differ from
it. Context cannot re-enable either. Absence means inheritance; storage should
not materialize every default merely to read effective policy.

### Context inheritance

- An explicit pool activity level wins for that pool.
- Otherwise the user's parent-group activity level applies to a group pool.
- Otherwise the application default is `IMPORTANT_ONLY`.
- A group setting applies to group-native events and inherits to child pools.
- A user may explicitly unmute one child pool without unmuting the group.

### Activity-level semantics

| Level          | Meaning                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| All activity   | Allow every eligible event in the context, subject to central policy.                                             |
| Important only | Allow only events marked important in the catalog. This is the default.                                           |
| Muted          | Suppress optional contextual activity updates and organizer nudges. Account/security communication is unaffected. |
| Custom         | Allow an explicit set of contextual topics. An empty set normalizes to Muted.                                     |

Context `CUSTOM` controls topics, not a second per-channel matrix. Delivery
channels stay centralized so a user does not need to repeat email and push
choices for every pool.

### Global channel gates

Add a durable user-level gate for each channel. This makes “disable all email”
apply to future topics as well as current ones. In-app may be globally disabled,
but the settings UI and muted-awareness affordances remain reachable.

Email and push defaults for new topics are always off. A proposal to enable a
new email or push default requires an explicit product decision and migration,
not merely a catalog edit.

## Persistence direction

The exact Prisma names can be chosen during implementation, but the data model
must express these concepts without overloading the visible `Notification` row:

- global user/channel gates;
- sparse category/channel overrides;
- sparse topic/channel overrides;
- user/group and user/pool activity settings;
- custom context-topic selections;
- mute timestamp and notice-dismissal timestamp;
- per-channel delivery claims and outcomes;
- organizer-nudge audit and cooldown history.

Prefer real group and pool relations over an unconstrained polymorphic string.
If a shared context-preference table uses nullable group and pool foreign keys,
the migration must enforce exactly one context and unique user/context pairs.

Existing `UserNotificationPreference` rows must migrate without changing current
friend or birthday behavior. Default-equivalent rows may collapse to inheritance;
non-default rows become explicit topic overrides. The migration must also derive
the initial global email gate so an existing “disable all” choice is not undone
by future topics.

## Delivery, idempotency, and failure semantics

Every event uses a per-recipient, per-channel delivery ledger. Domain modules
provide a stable occurrence key; the dispatcher combines it with the recipient
and channel under a database uniqueness constraint.

- Claim immediately before sending an allowed channel.
- Do not claim disabled, filtered, or unavailable channels. If capability or a
  preference is enabled while the occurrence remains active, it may deliver.
- A claimed channel is at-most-once in v1. Provider ambiguity is recorded and
  surfaced operationally rather than blindly retried.
- Channel failures are isolated. Email failure cannot prevent push or in-app.
- The visible in-app row references its delivery but is never the dedupe record.
- Deleting a bell item does not remove the delivery claim.
- Rendering failure is a channel failure and must not affect the domain mutation.

The delivery outcome should record event, topic, context identifiers, channel,
claim time, completion time, and normalized result without storing sensitive
payload content.

## Initial automatic pool updates

The first release should favor events that change what a contributor needs to
know or do.

| Event                                | Importance | Audience                                    | Topic            |
| ------------------------------------ | ---------- | ------------------------------------------- | ---------------- |
| Vote started                         | Important  | Current contributors except actor/recipient | Ideas and voting |
| Gift chosen                          | Important  | Current contributors except actor/recipient | Ideas and voting |
| Pool cancelled                       | Important  | Current contributors except actor/recipient | Pool progress    |
| Purchaser assigned                   | Important  | Assigned contributor only                   | Assignments      |
| Deliverer assigned                   | Important  | Assigned contributor only                   | Assignments      |
| Idea proposed                        | Routine    | Current contributors except actor/recipient | Ideas and voting |
| Contributor joined or left           | Routine    | Current contributors except actor/recipient | Membership       |
| Purchase or delivery marked complete | Routine    | Current contributors except actor/recipient | Pool progress    |

Do not notify on every vote cast, contribution-amount change, generic pool edit,
or any event that would disclose another contributor's private behavior. The
event list should reuse authoritative domain transitions rather than infer state
by reading activity-feed strings.

New pool topics default to in-app on where useful, email off, and push off.

## Organizer nudges

V1 nudges are pool-scoped, preset, and task-bound. A group owner/admin may send
them only through their pool-manager capability; there is no group-wide
broadcast and no free-form text.

Candidate presets:

- set a contribution preference, targeting contributors who have not set one;
- cast a vote, targeting eligible contributors who have not voted;
- complete an assigned purchase/delivery step, targeting the assigned user.

Before creating a nudge, re-check pool state, sender permission, recipient
membership, unresolved task state, actor exclusion, and concealed-recipient
exclusion. Persist one nudge audit record before fanout so rate checks do not
depend on notification rows.

Recommended initial limits:

- same pool and nudge kind: one send action per 24 hours;
- same pool: at most three send actions in a rolling seven days;
- same recipient and pool: at most one organizer nudge in 24 hours;
- no eligible recipients: a no-op that does not consume the limit.

The “Organizer nudges” topic defaults to in-app on, email off, and push off.
Muted contexts suppress nudges. The sender sees eligible-target count before
confirmation and an outcome summary after dispatch, never individual preference
choices.

## Muted-state awareness

When effective contextual delivery is off, context surfaces show:

1. a persistent, low-noise indicator such as “Pool notifications off”; and
2. a reason-aware notice explaining whether the pool is explicitly muted,
   inherits a group mute, or has no globally enabled supported channel.

The notice is dismissible; the indicator is not. Store `mutedAt` and
`noticeDismissedAt` (or equivalent versioned state). Show the notice when the
current mute is newer than its dismissal. Unmuting and later re-muting creates a
new awareness cycle. When the mute is inherited, the UI identifies the group
as the controlling context and links to the relevant setting.

Notification settings and unmute actions remain accessible even when in-app
delivery is globally disabled.

## Authorization and privacy

- Preference reads and writes are always scoped to the authenticated user.
- Context settings require current visibility/membership in that context.
- Nudge creation uses `canManagePool` and revalidates within the mutation.
- Nudge eligibility never reveals which target muted or disabled a channel.
- Pool-recipient exclusion happens before policy resolution and delivery claims.
- Analytics avoid bodies, contribution amounts, vote selections, and recipient
  lists. Operational delivery records use identifiers only where necessary for
  correctness and access-controlled debugging.

## Analytics and operations

Measure the resolved system rather than only persisted overrides:

- eligible events, deliveries, failures, unavailable channels, and suppressions
  by event/topic/channel/reason;
- clicks and successful follow-through paired to the source event;
- activity-level distribution by group and pool context;
- effective channel/topic opt-out rates with the full eligible-user denominator;
- nudge send actions, eligible-target counts, deliveries, clicks, repeated-send
  blocks, and opt-outs after nudges.

Do not emit one analytics row for each internal preference lookup. Emit at the
dispatch outcome and at user preference changes. The admin opt-out matrix must
include inherited defaults and context modes and must label small denominators.

Alert or report on delivery failure rate, unavailable push rate, unknown catalog
events, and claim-without-completion rows. Sentry remains the exception path;
structured outcomes provide the aggregate operational view.

## Testing strategy

Test at the new module interfaces and replace shallow tests that only mirror the
old switch implementation.

Required invariant coverage:

- the complete central and context precedence table;
- sparse-row inheritance and migration of existing choices;
- global channel gates applying to future topics;
- group inheritance and explicit child-pool override;
- custom-topic filtering and empty-custom normalization;
- per-channel claims, mid-window opt-in, concurrency, and in-app deletion;
- independent channel failure outcomes, including all web-push endpoints failing;
- pool actor and concealed-recipient exclusion for every event;
- nudge permissions, target state, cooldowns, rolling limits, and no-op sends;
- muted notice dismissal and reappearance after a new mute cycle;
- existing friend-request and birthday-reminder behavior remaining unchanged.

## Implementation sequence

1. Refactor the catalog, policy resolver, dispatcher, delivery ledger, and
   adapters while preserving existing behavior.
2. Add central sparse overrides, durable channel gates, context activity
   persistence, and resolver tests.
3. Complete the Claude Design checkpoint and implement approved settings and
   muted-awareness surfaces.
4. Add the selected automatic pool events and measure delivery/suppression.
5. Add preset organizer nudges with audit history and rate limits.

Each step ships independently and keeps production behavior usable. General
messaging remains a separate future initiative even though a dormant schema
model exists.

## Design checkpoint contract

Before UI implementation, Claude Design should produce mobile and desktop
mockups for:

- central notification settings with global channel gates, category bulk
  controls, granular topics, and inherited/default states;
- group and pool activity-level controls, including inherited group settings
  and Custom topic selection;
- a persistent muted indicator and dismissible, reason-aware awareness notice;
- unmute/manage-notification entry points;
- a preset nudge confirmation and outcome state;
- loading, empty, error, permission-lost, push-unavailable, and long-content
  states.

All modal interactions must use a bottom sheet below 640 px and a centered
dialog on desktop, following the repository's `ResponsiveDialog` rule.
