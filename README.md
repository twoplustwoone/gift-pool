# GiftPool

![License](https://img.shields.io/badge/license-MIT-blue.svg)
[![🚀 Deploy](https://github.com/twoplustwoone/gift-pool/actions/workflows/deploy.yml/badge.svg)](https://github.com/twoplustwoone/gift-pool/actions/workflows/deploy.yml)
[![Live Site](https://img.shields.io/badge/Live-Site-F7DF1E.svg)](https://www.giftpool.app/)

## Analytics

- Events are stored in the `AnalyticsEvent` table with `id` (uuid), `eventId` (unique), `name`, `userId`, `source`, `requestId`, `sessionId`, `properties` (JSON string for SQLite), and timestamps. IPs and full user agents are intentionally **not** collected; the environment dashboard stores normalized browser/device/viewport/OS/PWA fields only.
- Dedupe: the server treats `eventId` as the primary key for correlation between client and server. If an `eventId` is missing, events are deduped by `(requestId, name, userId)` within a 5-minute window.
- Client logging: use `track(name, properties?, { eventId?, requestId? })` from `app/utils/analytics.client.ts`; events post to `/api/analytics` and are best-effort with a single retry.
- Server logging: use `logEvent` from `app/utils/analytics.server.ts` and pass `requestId/sessionId` from `getRequestContext(request)` when available.
- Admin dashboard: `/admin/analytics` is protected by an allowlist (`ANALYTICS_ADMIN_EMAILS` or `ANALYTICS_ADMIN_USER_IDS`, comma-separated) or the `admin` role. It summarizes DAU/WAU/MAU, total users, daily actives (30d), event counts (7d/30d), and 30-day environment usage by browser, device, OS, viewport, display mode, and PWA install funnel.
- Adding a new event: append the name to `ANALYTIC_EVENT_NAMES` in `app/utils/analytics.ts`, instrument server/client flows, and update admin dashboard tests if the new event should appear in summaries.
