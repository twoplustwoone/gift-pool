# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gift Pool is a full-stack web application for managing wishlists and coordinating gifts within groups. Built with React Router v7, React, TypeScript, Prisma (SQLite), and Tailwind CSS. Deployed on Fly.io with LiteFS for distributed SQLite.

## Git Workflow

Always ship changes via a dedicated PR branch — never commit directly to main. Follow the atomic-commit PR workflow and monitor CI to green before considering work done.

## Commands

### Development

```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm start                # Production server
npm start:mocks          # Production server with MSW mocks
```

### Code Quality

```bash
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier formatting
npm run typecheck        # TypeScript checks
npm run validate         # All checks (lint, typecheck, tests, e2e)
```

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

prisma/                 # Schema, migrations, seed
tests/
├── e2e/               # Playwright tests
├── mocks/             # MSW handlers
└── setup/             # Test config
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

### Components

- Arrow function components
- kebab-case filenames, PascalCase exports
- Colocate tests: `ComponentName.test.tsx`

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
- **Reference implementations**: `queueLogEvent` in `analytics.server.ts`, `fanoutNotification` in `friends.server.ts` (wraps `notifyUser` so in-app rows + Resend emails don't block friend-request actions).
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

Hot/cold path split — reads tolerate missing rows, writes don't.

- **Cold path (settings loader)**: `app/routes/settings+/profile.notifications.tsx` calls `ensureNotificationPreferencesForUser` to materialize a row per `NOTIFICATION_TYPES`. This is the only place that upserts on read, and the e2e rollback tests rely on the rows existing afterwards.
- **Hot path (friend-request fanout)**: `getNotificationPreferences` / `getNotificationPreferenceForChannels` fall back to `DEFAULT_NOTIFICATION_PREFERENCES` when rows are missing — no upsert in the fanout.
- **Signup**: `auth.server.ts` seeds one row per type via nested-create so new users never hit the fallback.
- `disableEmailForAll` collapses to one `findMany` + one transactional `updateMany` + audit `createMany` (not an O(N) loop).

## Environment Variables

Required for development (set by setup.sh):

- `DATABASE_URL` - SQLite path
- `SESSION_SECRET` - Session encryption
- `HONEYPOT_SECRET` - Spam protection

Optional:

- `RESEND_API_KEY` - Email service
- `SENTRY_DSN` - Error tracking

See `app/utils/env.server.ts` for full list.

## Mobile UI Conventions

On mobile surfaces, use bottom-sheet patterns (not centered modals), and ensure every interactive control provides visible feedback or redirect after action. See the "Modals are sheets on mobile — HARD RULE" convention above for the `ResponsiveDialog` mechanics.

## Debugging & Testing

When a test or CI check fails, run the specific test type the user requested (jest/unit vs. e2e). If a fix isn't working after two attempts, stop and step back to re-diagnose the root cause rather than iterating on throwaway diagnostics.
