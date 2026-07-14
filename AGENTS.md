# Repository Guidelines

This file provides guidance to coding agents working in this repository. `AGENTS.md` is the canonical source; tool-specific instruction filenames should link to it rather than duplicate its contents.

## Project Overview

Gift Pool is a full-stack web application for managing wishlists and coordinating gifts within groups. Built with React Router v7, React, TypeScript, Prisma (SQLite), and Tailwind CSS. Deployed on Fly.io with LiteFS for distributed SQLite.

## Git Workflow

Always ship changes via a dedicated PR branch — never commit directly to main. Follow the atomic-commit PR workflow and monitor CI to green before considering work done.

- Follow the conventional commit style used in project history: `feat(scope): ...`, `fix(scope): ...`, `test(scope): ...`, `refactor(scope): ...`, and `chore(scope): ...`.
- Keep commits focused and avoid mixing refactors with behavior changes.
- PRs should include a summary, test plan, updated checklist items, and screenshots or video for visual changes.
- Link related issues and explicitly call out migrations and environment changes.

## Worktree-local plans and handoffs

Substantial multi-step work uses ignored, worktree-local plans under `.agents/plans/<feature-slug>/plan.md` so another agent can resume safely without committing transient notes.

- Before starting or resuming substantial work, inspect `.agents/plans/` for a plan that matches the request, feature, or current branch. Do not follow an unrelated plan merely because it exists.
- Use the `maintain-local-plan` repository skill to create or update plans, record decisions, track PR/milestone checklists, log verification, and prepare handoffs.
- Update the matching plan after material decisions and milestones and immediately before handing work to another agent.
- Plans are local aids only: current user instructions and `AGENTS.md` take precedence. Never store secrets, credentials, personal data, or production exports in them.
- `.agents/skills` is the canonical committed skill directory. `.claude/skills` must remain a relative symlink to it; never duplicate skill contents across tool-specific directories.

## UI design checkpoints

Before implementing a net-new user-facing surface, interaction pattern, or substantial layout/hierarchy change, identify it as a design checkpoint and ask whether the user wants to work through Claude Design first. If accepted, use the `prepare-ui-design-handoff` repository skill and do not implement that UI until the mock has been returned and audited. Small changes that faithfully extend an accepted existing pattern do not require this checkpoint, and a user may explicitly opt out.

## Commands

### Development

```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm start                # Production server
npm start:mocks          # Production server with MSW mocks
```

Use Node 20, as specified by the `engines` field in `package.json`.

### Code Quality

```bash
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier formatting
npm run typecheck        # TypeScript checks
npm run validate         # All checks (lint, typecheck, tests, e2e)
```

Prettier enforces 2-space indentation, single quotes, semicolons, trailing commas, and Tailwind class sorting.

### Testing

```bash
npm test                 # Unit tests (Vitest, watch mode)
npm test -- --run        # Unit tests (single run)
npm test -- file.test.tsx               # Specific file
npm test -- --grep "pattern"            # By pattern
npm run coverage         # With coverage

npm run test:e2e:run     # E2E tests headless — one-shot, used by `validate`. THIS is the command for CI/agents/non-interactive runs.
npm run test:e2e:run -- feedback.test.ts        # Specific E2E test, headless
npm run test:e2e         # Opens Playwright UI runner (interactive — never exits). Same as test:e2e:dev. Do NOT use in a non-interactive context.
npm run test:e2e:dev     # E2E with UI (recommended for dev)
npm run test:e2e:dev -- --headed                # With browser visible
```

### Database

```bash
npm run prisma:studio    # Prisma GUI (http://localhost:5555)
npx prisma migrate dev   # Create/apply migrations
npm run prisma:generate  # Regenerate Prisma client after schema changes
npx prisma migrate deploy # Verify/apply existing migrations
npx prisma db seed       # Seed test data
```

## Architecture

### Directory Structure

```
app/
├── components/          # React components
│   ├── ui/             # Base UI (Button, Dialog, Input via Radix)
│   ├── ui-kit/         # Layout primitives (Box, Flex, Grid, Stack, Text)
│   ├── admin-ui.tsx    # Shared admin primitives (SummaryCard, SectionCard, DLRow, EmptyRow)
│   ├── friends/        # Friend relationship components
│   ├── groups/         # Gift group components
│   └── wishlist/       # Wishlist components
├── routes/             # File-based routing (react-router flat-routes)
│   ├── _auth+/         # Auth flows (login, signup, verify, reset)
│   ├── _marketing+/    # Public pages (about, support, privacy, tos)
│   ├── admin+/         # Admin dashboard
│   ├── groups+/        # Group management
│   ├── wishlist+/      # Wishlist CRUD
│   ├── users+/         # Public profiles
│   ├── settings+/      # User settings
│   └── api.*           # API endpoints
├── utils/              # Shared utilities (*.server.ts for server-only)
├── emails/             # React Email templates
└── hooks/              # Custom React hooks

server/                 # Runtime entry points and server-only helpers
prisma/                 # Schema, migrations, seed
tests/
├── e2e/               # Playwright tests
├── mocks/             # MSW handlers
├── setup/             # Test config
├── fixtures/          # Shared test fixtures
└── prisma/            # Test databases
public/                # Static assets
stories/               # Storybook stories (.storybook/ contains config)
other/                 # Build and administrative scripts
```

### Routing Conventions (react-router flat-routes)

- `_prefix+/` = route group (e.g., `_auth+/login.tsx`)
- `$param` = dynamic segment (e.g., `$giftGroupId_+/`)
- `segment_.$param.tsx` = break-out (sibling, not child) — trailing `_` on the segment prevents nesting under a same-named route (e.g., `users_.$userId.tsx` is a sibling of `users.tsx`, not its child)
- `__route.server.ts` = colocated server utilities (ignored by router)
- `api.*.ts` = API endpoints

### Key Utilities

- `db.server.ts` - Prisma client singleton with query logging
- `auth.server.ts` - Authentication & sessions (remix-auth)
- `permissions.server.ts` - Authorization checks
- `request-context.server.ts` - Request ID & timing
- `analytics.ts` - Event tracking (client & server)
- `admin.server.ts` - Admin aggregation + mutation helpers (overview counts, stuck-pool detection, cleanup jobs, user search/detail, pool list/detail, funnel, retention, opt-out matrix, role toggle, session revoke)

### Path Aliases

- `#app/*` - app directory
- `#tests/*` - test utilities
- `@/icon-name` - icons

## Conventions

### TypeScript

- Strict mode enabled
- Use `import type` for type-only imports
- Server-only files: `.server.ts` suffix
- Client-only files: `.client.ts` or `.client.tsx` suffix
- Prefer kebab-case filenames in `app/utils` and `app/lib` (ESLint-enforced)

### Components

- Arrow function components
- kebab-case filenames, PascalCase exports
- Colocate tests: `ComponentName.test.tsx`
- Update or add tests whenever behavior, routes, or database flows change

### Modals are sheets on mobile — HARD RULE

**Every modal renders as a bottom sheet on mobile (< 640px) and a centered dialog on desktop. No exceptions.** A centered modal on a phone is a bug.

- Use `ResponsiveDialog` from `app/components/ui/responsive-dialog.tsx` for ALL modals. Its sub-components (`ResponsiveDialogContent`, `ResponsiveDialogHeader`, `ResponsiveDialogFooter`, `ResponsiveDialogTitle`, `ResponsiveDialogDescription`, `ResponsiveDialogTrigger`, `ResponsiveDialogClose`) mirror the `Dialog` API exactly, so they are drop-in — commonly imported `as Dialog`, `as DialogContent`, … to keep JSX unchanged. It swaps to the `MobileBottomSheet` family below the breakpoint via `useIsDesktop`.
- Do NOT use the raw `Dialog` primitive (`app/components/ui/dialog.tsx`) directly for a modal — it is centered at every width. `Dialog`/`MobileBottomSheet` are the low-level primitives that `ResponsiveDialog` composes; reach for them only when building `ResponsiveDialog` itself.
- This does not apply to non-modal overlays (dropdown menus, popovers, tooltips, toasts) — only to modal dialogs.

### Database

- Always create migrations for schema changes
- Cascade deletes for relational integrity
- Seed file: `prisma/seed.ts`

### Styling

- Tailwind CSS with prettier-plugin-tailwindcss (auto-sorts classes)
- Dark mode: class-based strategy
- Dynamic utilities safelisted in `tailwind.config.ts`

## Key Patterns

### Optimistic UI

Uses client mutation IDs (`createClientMutationId()`) and event-based state updates for immediate feedback. See `friendship-events.ts` for the event dispatch pattern.

### Form Handling

Uses Conform + Zod for validation with honeypot spam protection.

### Analytics

- Client: `track(name, properties)` from `analytics.client.ts`. `name` is typed as `AnalyticEventName` (no `| string`) — an unregistered name is a compile error. Register new names in `ANALYTIC_EVENT_NAMES` first; never widen the type back (a silent-drop escape hatch left ~14 call sites recording nothing for months).
- Server: `queueLogEvent(...)` from `analytics.server.ts` is the default for action/loader hot paths — it pre-generates the `eventId` synchronously, fires `logEvent` without awaiting, and tails errors to `captureException`. Callers can echo the returned `eventId` back to the client immediately.
- Use `logEvent` (awaited) only when you genuinely need the persisted row before returning — e.g. `api.analytics` fanning out from a `sendBeacon`.
- On `eventId` conflict, server writes are canonical: `logEvent` upgrades a `source: 'client'` row in place when the incoming write is `source: 'server'`, so the richer server payload always wins the client-echo race. See `recoverFromEventIdConflict`.
- Event names live in `ANALYTIC_EVENT_NAMES` in `analytics.ts` (the constant's comments are the registry of record — don't enumerate names here). Naming convention: `object_verb_past` (`pool_created`, `group_joined`). Events an anonymous visitor can fire must NOT be in `USER_REQUIRED_EVENTS` (e.g. `feedback_submitted`, `wishlist_link_clicked`, `home_cta_clicked`, and all funnel-entry events below).
- Anonymous visitor identity: `gp_visitor` first-party cookie (random UUID, 400-day, HTTP-only), set/refreshed by the root loader via `ensureVisitorId`. `getRequestContext(request)` returns `{ requestId, sessionId, visitorId }`; pass `visitorId` to `queueLogEvent` for any event an anonymous visitor can reach, and on `user_registered` so pre-signup events join to the account. `api.analytics` accepts anonymous POSTs for non-user-required names only (401 otherwise) and derives `visitorId` server-side from the cookie — never trust it from the payload.
- Drop-off instrumentation: funnel-entry events pair with completion events — `signup_submitted` / `signup_email_verified` → `user_registered`; `invite_landed` (`inviteType: group|pool|friend`, `valid: bool` — fired BEFORE auth gates so anonymous landings count, with a `valid: false` fire on dead links) → `group_joined` / `pool_contributor_joined` / `friend_request_accepted` (`via: 'invite_link'` for link accepts); `wishlist_editor_opened` (once per dialog open, `mode` property) → `wishlist_item_added`; `wishlist_share_viewed` → `wishlist_link_clicked`. When adding a flow, instrument the entry before the auth/validity gate and keep the pairing documented in `analytics.ts`.
- Outcome-coded events: `wishlist_unfurl_completed` fires on success AND failure with an `outcome` property (`success|nothing_found|fetch_failed|blocked_url|timeout|too_large`) — the admin funnel and failure breakdown are built from the same rows. Don't add separate success/failure event names.
- `queueLogEvent` must be called AFTER `$transaction` closes, never inside the transaction callback — a concurrent write inside the parent's lock produces spurious SQLITE_BUSY in Sentry.
- Admin dashboard at `/admin/analytics` (DAU/WAU/MAU, activation funnel, drop-off funnels section — signup / invite-link / editor / share-reach conversion via `getDropOffFunnels`, 1h SQLite cache — weekly retention, notification opt-out matrix, link-enrichment health section, event count tables)

### Link enrichment & affiliate links

"Paste a link, get a complete item": the wishlist editor unfurls product URLs and prefills title/price/image.

- **Enrichment pipeline**: editor URL blur/paste → `useUrlEnrichment` fetcher → POST `/api/wishlist/unfurl` (auth required, strongest rate-limit tier) → `extractUrlMetadata` in `wishlist-metadata.server.ts` (JSON-LD Product → og/twitter meta, via the SSRF-guarded `fetchHtml` with `truncate: true`) → optional Claude Haiku fallback (`wishlist-metadata-llm.server.ts`, gated on `ANTHROPIC_API_KEY`, deterministic values always win the merge). Failures are silent by design — the route returns 200 with `result: null` and the user types fields manually.
- **Prefill rule**: only fill fields the user hasn't touched; all programmatic fills go through Conform's `form.update`, never raw `.value` writes. Hidden `enrichedFields`/`enrichmentEdited` inputs feed the `wishlist_item_added` analytics properties.
- **Price**: `WishlistItem.priceCents`/`currency` (currency only ever stored alongside a price; display falls back to USD via `formatCents`). Pools prefill `estimatedPriceCents` from the picker in `ProposeIdeaForm`; the propose action validates `wishlistItemId` belongs to `pool.recipientUserId`.
- **Affiliate**: outbound product links route through `/out?item=<id>` / `/out?idea=<id>` (`rel="sponsored"`) — the route accepts only DB ids (never URLs, so no open redirect), looks up the stored URL, applies tags via the registry in `affiliate.server.ts` (Amazon via optional `AMAZON_AFFILIATE_TAG`), logs `wishlist_link_clicked`, and 302s. Rendered pages never contain affiliate tags. Disclosure lives on /support#affiliate, /about, and a footer line on wishlist + pool surfaces.
- **Tests**: leave `ANTHROPIC_API_KEY` unset in CI (LLM path disabled by design); `tests/mocks/anthropic.ts` is the MSW safety net if a key leaks into the env.

### Invite landings

Invite links (friend / group / pool) land on the shared `InviteLanding` page (`app/components/invite-landing.tsx`), rendered BEFORE any auth gate — most recipients are new users, so anonymous visitors see the invitation context with "Create account" primary and "Log in" secondary (both carrying `redirectTo`), and dead links get a friendly expired state instead of a login wall.

- The three routes use break-out filenames (`friends_.accept.$code.tsx`, `groups_.join.$code.tsx`, `pools_.join.$code.tsx`) so they DON'T nest under the auth-gated section layouts. Don't move them back inside `groups+`/`pools+` or rename away the `_`.
- Loaders are anonymous-safe and return a `kind: 'ok' | 'invalid'` union; the join/accept POST still requires auth (`requireUserId` in the action). Pool recipient privacy (404, indistinguishable from a bad code) applies to authenticated recipients only.
- `redirectTo` survives the whole signup chain: signup action → `prepareVerification({ redirectTo })` → verify URL/email link → onboarding `handleVerification` forwards it → onboarding action `safeRedirect`s. The verify screen (onboarding type) echoes the target email and offers resend (`intent=resend` → `handleResend`) + start-over.
- Login's password field is presence-only validation — never reapply signup's min-length rule to login (it locks out accounts predating a stricter policy).

### Side effects off the action response

Mutation handlers should return after committing the primary change; anything the user doesn't need to block on runs afterwards.

- **Pattern**: pre-generate any IDs the client needs, fire the async work without awaiting, catch rejections into `Sentry.captureException`.
- **Reference implementations**: `queueLogEvent` in `analytics.server.ts` and `queueNotification` in `notification-dispatcher.server.ts`. Friend-request handlers submit a typed intent only after their transaction closes; the dispatcher isolates in-app, email, and web-push delivery so none can turn a committed mutation into a 500.
- The mutation is already committed by the time fanout runs, so a fanout failure must surface in Sentry — it must never convert a successful action into a 500.

### Admin surface

`/admin` is gated by `requireUserWithRole(request, 'admin')` in the layout loader. All admin routes share a persistent layout with a 7-tab NavLink bar. Bootstrap a first admin via `other/ensure-admin.js`; subsequent grants/revokes happen from the UI (`/admin/users/:id`).

- **Overview** (`/admin`): metric cards, stuck-pool alerts, cleanup queue, recent activity feed. Queries domain tables directly (not `AnalyticsEvent`). Cached 60s in `lruCache` (instance-local).
- **Users** (`/admin/users`): search + drill-down with role toggle (transactional last-admin guard in `$transaction`) and session + verification revoke.
- **Pools** (`/admin/pools`): health board with stuck detection (OPEN+overdue, VOTING+stalled, DECIDED+stale), per-status tabs, drill-down with admin-cancel action. Break-out filename: `pools_.$poolId.tsx`.
- **Feedback** (`/admin/feedback`): triage queue for user-submitted bugs/ideas/questions (`Feedback` model). Per-status tabs (NEW default), inline status + admin-notes mutation. NOT cached — it's a live queue where a status flip must show on the next render. Submissions arrive via the `api.feedback` action (used by both the support page form and the global `FeedbackWidget`).
- **Ops** (`/admin/ops`): 5 idempotent cleanup jobs (verifications, sessions, friend requests, group invitations, group bans), disk usage, LiteFS instance panel.
- **Analytics** (`/admin/analytics`): DAU/WAU/MAU + daily-active chart + activation funnel (domain tables, 1h cache) + weekly retention (via `Session.createdAt`, 1h cache) + notification opt-out matrix + event count tables.
- **Cache** (`/admin/cache`): LRU + SQLite cache inspector (pre-existing).

Cache tiering: short-TTL admin queries (≤5 min) use `lruCache`; long-TTL aggregates (funnel, retention, 1h) use the SQLite-backed `cache`. Never use SQLite cache for cleanup preview counts — LiteFS replication lag causes stale post-purge UX.

### Notification preferences

Preferences are sparse and resolved through the notification policy seam. Reads
never create rows, including signup and the settings loader.

- Central precedence is global channel gate → topic override → category override → catalog default. Context activity filters the result and can never re-enable a centrally disabled channel/topic.
- `notification-catalog.ts` maps concrete events to stable user-facing topics and categories. Adding an event to an existing topic must not add another preference row or toggle.
- The current settings screen still submits concrete event types for compatibility; `setNotificationPreference` deliberately maps them to their shared topic. The scoped settings UI arrives in the next milestone.
- `disableEmailForAll` writes one durable `EMAIL` global gate, so future topics remain disabled. Topic choices changed while that gate is off are retained for a later re-enable.
- Context activity uses sparse `GroupNotificationPreference` and `PoolNotificationPreference` rows. Explicit pool settings override the parent group; otherwise group settings inherit to child pools; otherwise the default is `IMPORTANT_ONLY`.
- Context preference reads/writes require current group membership or pool contribution. Dispatcher policy reads use `requireAccess: false` only after the owning domain has selected an eligible audience.
- A null context activity level means inherit and may coexist with `noticeDismissedAt`, which is required to dismiss awareness of an inherited group mute on one pool.
- Category bulk writes are transactional and clear more-specific topic rows for that channel so the selected category value actually applies to every child topic.
- Admin notification reporting resolves effective choices for the full user denominator; it must not count sparse rows as if they were the user population.

### Occasion reminders (the scheduler)

Beat 2 of the retention loop ("surface occasions proactively, before the user would otherwise remember") — see `docs/product/giftpool-vision-spine.md`. Previously the one entirely-unbuilt piece of the four-beat loop; `UPCOMING_BIRTHDAY` was a registered-but-stubbed notification type with no caller.

- **Trigger**: a Fly scheduled Machine (`schedule=daily`, a native Fly Machines feature — not encoded in `fly.toml`, created once via `fly machine run ... --schedule daily`, see the command documented at the top of `other/trigger-occasion-reminders.js`) runs that script, which POSTs to `/api/internal/occasion-reminders` via the app's **public hostname** (`https://$FLY_APP_NAME.fly.dev`). Deliberately NOT `.internal`: the `fly-replay` mechanism below is only honored by Fly's edge proxy, which 6PN traffic bypasses — and `.internal` DNS resolves to every started machine in the app, including the scheduled Machine itself, which isn't listening on any port.
- **Auth + LiteFS correctness**: the route (`app/routes/api.internal.occasion-reminders.ts`) is gated by the same `INTERNAL_COMMAND_TOKEN` bearer-token pattern as `admin+/cache_.sqlite.server.ts` (plus an explicit unset/empty-token rejection so a missing env var can't make `Bearer undefined` a valid credential), then calls `ensurePrimary()` (from `litefs.server.ts`, re-exported from `litefs-js/remix` but unused anywhere else until this). That throws a `fly-replay` response if the instance that answered isn't the LiteFS primary; because the request came through Fly's edge proxy, Fly re-issues it on the primary and the trigger script never needs to know which instance that is.
- **Audience**: `app/utils/occasion-reminders.server.ts` finds users with a birthday inside `UPCOMING_BIRTHDAY_LEAD_DAYS` (fixed at 7 for v1 — per-user/per-group configurability was raised and deliberately deferred; shipping that now means schema + UI work before the reminder loop itself is proven to bring anyone back). Reminder recipients = the owner's **direct friends ∪ `shareBirthday` group co-members**, each still checked against `canViewBirthday` from `birthday-visibility.server.ts` — the single source of truth also used by the profile/group-overview birthday surfaces; do not re-derive the visibility rule here. "Can view" alone is deliberately NOT the audience: under `EVERYONE` visibility any account may view the birthday, but strangers are not pinged, and mutual-friend-only viewers under `FRIENDS_OF_FRIENDS` can see it on the profile but get no proactive reminder.
- **Idempotency**: each channel claims its own `NotificationDelivery` ledger row (`birthday:<ownerId>:<yyyy-mm-dd>:<channel>`, unique per user + `sourceIdentifier`, claimed BEFORE that channel's send — see `claimNotificationDelivery`). Consequences, all deliberate: re-runs within the lead window are per-channel no-ops; a channel enabled mid-window delivers on the next sweep (its claim doesn't exist yet); an owner who edits their birthday gets a fresh key, so the corrected date still reminds; and deleting the in-app notification from the bell doesn't resurrect anything — the ledger, not the `Notification` row, is the dedupe record. The date component uses LOCAL date parts, not `toISOString()` (UTC would split one birthday into two keys across sweep days on a non-UTC host). Delivery is at-most-once per channel and channels are failure-isolated: a send that fails after its claim goes to Sentry, is never retried, and doesn't block the other channels. The key is derived in `notifyUpcomingBirthday`, not by the sweep.
- **Sweep resilience**: channel sends are try/caught individually inside `notifyUpcomingBirthday`, and each recipient is additionally try/caught in `runOccasionReminderSweep` (pre-claim throws retry next day). The summary is outcome-based — `viewersNotified` counts only recipients with ≥1 NEWLY delivered channel, `viewersSkipped` the idempotent no-ops, `viewersFailed` any channel failure — so the trigger's daily logs distinguish real deliveries from re-sweep no-ops.
- **Instrumentation**: `occasion_reminder_sent` (server event, per recipient, `channels`/`daysUntil`/`birthdayUserId` properties) fires when ≥1 channel newly delivers. Click-through pairing (documented in `analytics.ts`): the bell already fires `notification_clicked` with `type: UPCOMING_BIRTHDAY`; the email's profile link carries `?src=` `OCCASION_REMINDER_EMAIL_SRC`, which the profile loader logs as `occasion_reminder_email_clicked` via `trackOccasionReminderEmailClick` (lives in `occasion-reminders.server.ts` so it's unit-testable). This is the usage data the v1 lead-time decision is gated on.
- **Channel default**: `UPCOMING_BIRTHDAY` ships in-app-only by default (email/push both off in `DEFAULT_NOTIFICATION_PREFERENCES`) — users can opt into email from `/settings/profile/notifications`, which now has this row enabled (it previously rendered hard-`disabled: true` with a "coming soon" label).
- **Manual trigger for testing**: `npm run trigger:occasion-reminders` (reads `INTERNAL_COMMAND_TOKEN` from env).

## Environment Variables

Required for development (set by setup.sh):

- `DATABASE_URL` - SQLite path
- `SESSION_SECRET` - Session encryption
- `HONEYPOT_SECRET` - Spam protection

Copy `.env.example` to `.env` for local development, and never commit secrets.

Optional:

- `RESEND_API_KEY` - Email service
- `SENTRY_DSN` - Error tracking

See `app/utils/env.server.ts` for full list.

## Mobile UI Conventions

On mobile surfaces, use bottom-sheet patterns (not centered modals), and ensure every interactive control provides visible feedback or redirect after action. See the "Modals are sheets on mobile — HARD RULE" convention above for the `ResponsiveDialog` mechanics.

## Debugging & Testing

When a test or CI check fails, run the specific test type the user requested (jest/unit vs. e2e). If a fix isn't working after two attempts, stop and step back to re-diagnose the root cause rather than iterating on throwaway diagnostics.
