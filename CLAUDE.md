# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gift Pool is a full-stack web application for managing wishlists and coordinating gifts within groups. Built with React Router v7, React, TypeScript, Prisma (SQLite), and Tailwind CSS. Deployed on Fly.io with LiteFS for distributed SQLite.

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

npm run test:e2e         # E2E tests (Playwright, headless)
npm run test:e2e:dev     # E2E with UI (recommended for dev)
npm run test:e2e:dev -- --grep "name"   # Specific E2E test
npm run test:e2e:dev -- --headed        # With browser visible
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
│   ├── friends/        # Friend relationship components
│   ├── groups/         # Gift group components
│   └── wishlist/       # Wishlist components
├── routes/             # File-based routing (react-router flat-routes)
│   ├── _auth+/         # Auth flows (login, signup, verify, reset)
│   ├── _marketing+/    # Public pages (about, privacy, tos)
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
- `__route.server.ts` = colocated server utilities (ignored by router)
- `api.*.ts` = API endpoints

### Key Utilities

- `db.server.ts` - Prisma client singleton with query logging
- `auth.server.ts` - Authentication & sessions (remix-auth)
- `permissions.server.ts` - Authorization checks
- `request-context.server.ts` - Request ID & timing
- `analytics.ts` - Event tracking (client & server)

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

- Client: `track(name, properties)` from `analytics.client.ts`
- Server: `queueLogEvent(...)` from `analytics.server.ts` is the default for action/loader hot paths — it pre-generates the `eventId` synchronously, fires `logEvent` without awaiting, and tails errors to `captureException`. Callers can echo the returned `eventId` back to the client immediately.
- Use `logEvent` (awaited) only when you genuinely need the persisted row before returning — e.g. `api.analytics` fanning out from a `sendBeacon`.
- On `eventId` conflict, server writes are canonical: `logEvent` upgrades a `source: 'client'` row in place when the incoming write is `source: 'server'`, so the richer server payload always wins the client-echo race. See `recoverFromEventIdConflict`.
- Event names in `ANALYTIC_EVENT_NAMES` constant
- Admin dashboard at `/admin/analytics`

### Side effects off the action response

Mutation handlers should return after committing the primary change; anything the user doesn't need to block on runs afterwards.

- **Pattern**: pre-generate any IDs the client needs, fire the async work without awaiting, catch rejections into `Sentry.captureException`.
- **Reference implementations**: `queueLogEvent` in `analytics.server.ts`, `fanoutNotification` in `friends.server.ts` (wraps `notifyUser` so in-app rows + Resend emails don't block friend-request actions).
- The mutation is already committed by the time fanout runs, so a fanout failure must surface in Sentry — it must never convert a successful action into a 500.

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
- `ANALYTICS_ADMIN_EMAILS` - Admin dashboard access

See `app/utils/env.server.ts` for full list.
