# Gift Pool Performance Investigation

> **Purpose.** A living plan + progress log for diagnosing and fixing the "feels frozen / skeleton flicker / stuck navigation" issues in production. This file is the source of truth between sessions — if a session gets cut off, the next one should be able to pick up here.
>
> **Rules for editing this doc:**
> - Check off (`[x]`) items as they are completed.
> - Append findings in the **Findings Log** at the bottom (newest first) with an ISO date.
> - When a hypothesis is confirmed or killed, mark it in the **Hypotheses** section.
> - When the plan changes, update **Status** and add a dated entry to **Session Log**.

---

## Status

- **Current phase:** Phase 2 — root cause identified, awaiting fix plan approval
- **Last updated:** 2026-04-10 (session 1, after data gathering)
- **Next action:** User approval on Tier 1 fix list, then execute in order
- **Branch:** `fix/slow-page-load-times`

---

## Symptoms (reported 2026-04-10)

1. **Friends page "flicker."** After login → navigate to Friends: the page appears briefly (cached), then gets replaced with the skeleton loader, then re-renders with data. The cached → skeleton regression feels broken.
2. **Navigation appears stuck.** After the flicker, clicking **Wishlist** seemed to show a skeleton — but the bottom nav still showed **Friends** highlighted. Unclear whether the transition happened, partially happened, or stalled.
3. **App feels frozen / unresponsive.** Subsequent nav clicks did not reliably advance the UI.
4. **General slowness.** Transitions take longer than expected for what should be cheap queries.

These symptoms happen intermittently in production — not every session.

---

## Stack context (what we know without more digging)

- **Runtime:** React Router v7 (SSR, flat routes), Node 20, Express server, Vite/ESBuild build.
- **Hosting:** Fly.io, single primary region `ord`, `min_machines_running = 1`, Docker + LiteFS + Consul lease.
- **Concurrency:** `soft_limit = 80`, `hard_limit = 100` requests per machine.
- **Database:** SQLite on LiteFS volume (`/data/litefs`), journal mode WAL. `better-sqlite3` + Prisma.
- **Observability:** Sentry (React Router SDK + profiling-node) + OpenTelemetry. Sentry MCP is connected via `.mcp.json`.
- **Recent perf work (on this branch, newest first):**
  - `8cfbb2c` refactor(root): simplify pending route rendering
  - `0f9ca68` fix(wishlist): restore access-gated loading
  - `dd3f92d` perf(wishlist): reduce friend page queries
  - `720dde6` perf(prefetch): slow friend wishlist drain
  - `7bd57c8` fix(friends): add loading skeleton
- **Relevant files to look at for the symptoms:**
  - `app/routes/friends.tsx` — friends page route + loader
  - `app/routes/users+/$username_+/wishlist.tsx` — friend/public wishlist route
  - `app/root.tsx` — pending UI, nav layout, global Suspense
  - `app/routes/friends.client-loader.test.ts`, `app/routes/users+/$username_+/wishlist.client-loader.test.ts` — existing client-loader behavior
  - `app/utils/db.server.ts` — Prisma client / query logging
  - `app/entry.server.tsx`, `app/entry.client.tsx` — Sentry init / SSR entry
  - `fly.toml`, `other/litefs.yml`, `other/Dockerfile`

---

## Hypotheses (resolved after Session 1)

### H1 — Client-loader cache-then-revalidate flicker on Friends
**Status:** ❌ PARTIAL — the flicker is real but the cause is different.
**Actual cause:** `app/root.tsx` lines ~375–393 swap `<Outlet />` with `<FriendsRouteSkeleton />` / `<WishlistRouteSkeleton />` whenever `navigation.state === 'loading'` and the target matches. Because the previous content was already rendered (either because the user was on Friends before or because `clientLoader` returned cached data via `takePrefetchCache`), the user sees: **rendered content → skeleton swap → final content**. The swap happens in the root layout, not in the route, so it stomps on Outlet.

### H2 — Slow loader blocks navigation → "stuck on friends" illusion
**Status:** ✅ CONFIRMED, different mechanism than assumed.
**Actual cause:** Two things compound:
1. `/friends.data` loader took **18.5 s** in the repro window (server-timing: `root_loader;dur=7314ms, getUserId;dur=4023ms, find_user;dur=1376ms`). Primary-key lookups taking seconds = machine is CPU/memory-starved.
2. `BottomNavLink` uses React Router's `NavLink` `isActive` + `isPending`. `isActive` follows the *current* location, not the navigation target. During the 18-second wait the Friends link stays fully active while the Wishlist link only gets a subtle `…` suffix and pulse. User reads that as "it's stuck on Friends."

### H3 — Fly machine cold start / auto-stop interaction
**Status:** ❌ KILLED. `min_machines_running = 1` is set, no auto_stop_machines configured, and `fly machine status` shows the machine was started 2026-04-07 and has been up continuously. No cold start.

### H4 — Main-thread blocking / hydration cost
**Status:** ❌ KILLED as primary cause. HAR timings for slow JS chunks show `wait: 26640ms, receive: 0ms, blocked: 0ms` — the time is origin waiting, not client JS.

### H5 — N+1 queries or missing indexes
**Status:** ❌ KILLED. Prisma logs show `SELECT Session WHERE id = ? LIMIT 1` taking 1139 ms. A primary-key indexed lookup with no join cannot take 1 second on a healthy machine. The Prisma code is fine; the machine is the bottleneck.

### H6 — LiteFS replication / write-forwarding latency
**Status:** ❌ KILLED for now. All writes are local to primary (ord).

### H7 — Missing or mis-tuned pending UI
**Status:** ✅ CONFIRMED. Root.tsx replaces Outlet with Skeleton during navigation instead of rendering a top progress bar, which causes the flicker described in H1.

---

### 🔴 PRIMARY ROOT CAUSE (new — replaces hypotheses above)

**The production machine is a single `shared-cpu-1x:256MB` VM in `ord`.** That is too small for Node + Prisma + LiteFS + Sentry + OpenTelemetry + Express + Helmet + compression + sharp. Under any sustained load the app is memory-pressured and CPU-starved, which causes the entire latency cascade the user observed.

**Hard evidence:**
1. `fly machine status` → `CPU Kind = shared, vCPUs = 1, Memory = 256 MB`
2. HAR: `wishlist-_IUVi5OG.js` — `wait: 26640ms, receive: 0ms` (origin took 26 s to send first byte; not a network issue)
3. HAR: two `/friends.data?_routes=root` calls 1 second apart — first took 30 ms, second took 7314 ms (`getUserId = 4023 ms`, `find_user = 1376 ms`). A primary-key Prisma lookup going from 6 ms → 1376 ms in one second = machine thrashing.
4. fly logs: `prisma:query - 1139ms - SELECT Session WHERE id = ? LIMIT 1` — indexed single-row lookup.
5. fly logs: `Health check 'servicecheck-01-http-8080' has failed` at 2026-04-10T18:36:14Z — the app was unable to respond to its own health check during the user's repro window.
6. fly logs: 16 `/__manifest` calls per session, two of them taking >4 s — blocks every subsequent navigation.
7. fly.toml: `soft_limit = 80, hard_limit = 100` concurrent requests per machine. A 256 MB single-shared-CPU instance cannot serve 80 concurrent requests. When the concurrency climbs, everything queues behind it, and the machine can't drain.
8. fly.toml: `swap_size_mb = 512` on a 256 MB machine = the machine is intended to swap, which means disk thrashing under pressure.

---

## Plan

Each phase has an expected output so a future session can pick up where we left off. Mark each step with `[ ]` → `[x]` as it completes.

### Phase 1 — Data gathering (no code changes)

Goal: pull ground truth from Sentry, Fly, and the repo so we stop guessing.

**1.1 — Sentry (via MCP)**
- [ ] `mcp__sentry__whoami` → confirm auth, org, and find the Gift Pool project slug
- [ ] `mcp__sentry__find_projects` → list projects under the org
- [ ] `mcp__sentry__search_issues` with `is:unresolved sort:freq` over last 14 days → top error signatures
- [ ] `mcp__sentry__search_issues` with `level:error environment:production` last 7 days
- [ ] `mcp__sentry__search_events` on `transaction` data for:
  - Top 20 slowest transactions by P95 (route loader names)
  - P50/P75/P95/P99 for the `/friends` and `/users/$username/wishlist` routes
  - Any `db.sql.prisma` spans exceeding 500 ms
  - Any HTTP `/resources/*` requests exceeding 1 s
- [ ] `mcp__sentry__search_events` for web vitals: LCP, CLS, INP on key routes
- [ ] For the top slow transaction: `mcp__sentry__search_issue_events` + `mcp__sentry__analyze_issue_with_seer`
- [ ] Capture findings in **Findings Log**

**1.2 — Fly.io (via `flyctl`)**
- [ ] `fly auth whoami` → confirm login
- [ ] `fly status -a gift-pool-c7cf` → primary region, machine count, release status
- [ ] `fly machine list -a gift-pool-c7cf` → machine IDs, states, regions, auto-stop config
- [ ] `fly machine status <id> -a gift-pool-c7cf` → per-machine CPU/memory/swap + restart count
- [ ] `fly logs -a gift-pool-c7cf --no-tail -i <id>` → last 500 lines, scan for OOM, restart, LiteFS lease changes, slow request log lines
- [ ] `fly vol list -a gift-pool-c7cf` → volume size, free space
- [ ] `fly metrics -a gift-pool-c7cf` (if available) → CPU, memory, network over last 24 h
- [ ] `fly consul attach` status — LiteFS lease holder
- [ ] Check if machines auto_stop_machines = true in fly.toml is absent (currently we have `min_machines_running = 1` but no explicit auto_stop setting)
- [ ] Capture findings in **Findings Log**

**1.3 — Repo / code reading (no edits yet)**
- [ ] `app/root.tsx` — pending UI, navigation transitions, Suspense boundaries
- [ ] `app/routes/friends.tsx` — loader, clientLoader, shouldRevalidate, skeleton
- [ ] `app/routes/users+/$username_+/wishlist.tsx` — loader, clientLoader, skeleton
- [ ] `app/utils/db.server.ts` — query logging config (is it on?)
- [ ] `app/entry.server.tsx` — Sentry init, tracesSampleRate, profilesSampleRate
- [ ] `app/entry.client.tsx` — Sentry browser init, hydration
- [ ] `server/index.ts` (or equivalent Express entry) — any middleware that could block the event loop
- [ ] Build artefact size: `du -sh build/client` and flag the 5 largest chunks
- [ ] Capture findings in **Findings Log**

**1.4 — Real-world repro (manual, with user help)**
- [ ] Open prod in an incognito window with DevTools → Network + Performance tabs recording
- [ ] Reproduce the friends → wishlist flow; save HAR + performance trace
- [ ] Note observed timings for each step (login POST, friends loader, wishlist loader)

### Phase 2 — Analysis + decision

- [ ] Walk each Hypothesis above; mark as ✅ confirmed / ❌ killed / 🟡 still suspected based on Phase 1 evidence
- [ ] Produce a short written summary of root cause(s)
- [ ] Write down the fix plan for Phase 3 based on the actual root cause, not the plan's pre-guesses

### Phase 3 — Fixes (ordered by impact, confirmed by Session 1 evidence)

**Tier 1 — Infra resize (biggest single impact, do first)**
- [ ] **Bump machine size** from `shared-cpu-1x:256MB` to `shared-cpu-2x:1024MB`. Command: `fly scale vm shared-cpu-2x --memory 1024 -a gift-pool-c7cf`. Est. cost ~$5/month. This should single-handedly eliminate the 18 s loader times.
- [ ] **Lower concurrency limits** in `fly.toml` from `soft_limit=80, hard_limit=100` to `soft_limit=20, hard_limit=40`. Even the bigger machine shouldn't promise 80 concurrent requests. Prevents overload queueing.
- [ ] **Drop swap size** from 512 MB to 0 (or 256 MB) once the machine has real RAM. Swap = disk thrashing, and we now have enough RAM to not need it.

**Tier 2 — Fix the flicker + stuck-nav illusion (pure code)**
- [ ] **Remove the Outlet→Skeleton swap in `app/root.tsx`** (lines ~375–393). Replace with either:
  - (a) A top progress bar (NProgress-style) that renders regardless of target route, OR
  - (b) Nothing at the root level — let each route render its own skeleton via its loader/clientLoader.
  Option (b) is cleaner because skeletons are already colocated with their routes.
- [ ] **Fix BottomNavLink active state during pending navigation.** Compare `to` against `navigation.location ?? location` so the target tab becomes visually active the instant the user clicks — not 18 s later. This kills the "still under Friends" feeling.
- [ ] **Cut root loader cost.** Drop the `roles.permissions` nested select from the user query (only fetched permissions we rarely check at root), and move `getToast` + `notifications.count` into a dedicated fetcher/resource route that loads in parallel via a layout route. Root loader should be ≤3 trivial queries.
- [ ] **Consider serving `/__manifest` with `s-maxage` or an HTTP 304.** 16 calls/session @ ~200 ms each on a healthy machine = 3.2 s of pure overhead per session. Need to check whether it's hashed (etag-able).

**Tier 3 — Observability hardening**
- [ ] **Check `tracesSampleRate` and `profilesSampleRate`** in `app/utils/monitoring.client.tsx` and wherever Sentry is init'd on the server. On a 256 MB box, sample rates above ~0.1 are memory/CPU taxes. Should be 0.1–0.2 max, and profiling should be off unless actively debugging.
- [ ] **Verify OpenTelemetry is actually being used.** `@opentelemetry/*` packages are in `package.json` but I haven't seen their init. If they're loaded but not sending anywhere useful, drop them — they add startup memory and CPU.
- [ ] **Add a slow-query log emit to Sentry.** Any Prisma query over 500 ms should become a Sentry breadcrumb or metric so we see the next regression immediately.

**Tier 4 — Only if Tier 1+2 doesn't fully fix it**
- [ ] Add a second Fly machine (LiteFS handles replication); distribute traffic across 2 × shared-cpu-1x:512MB.
- [ ] Fronting the Express app with a real CDN (Cloudflare in front of `giftpool.app`) so static assets never touch origin twice.
- [ ] Revisit the Migration Decision Matrix — but see the analysis below: **migrating to Vercel/Next.js is NOT recommended** based on the evidence.

### Why we are NOT recommending a migration (Vercel / Next.js / Turso)

- **The problem is not the platform.** The problem is that the machine is smaller than the app needs. A 1 GB Fly machine is $5/month and takes 60 seconds to resize.
- **Vercel would not be cheaper.** Free Vercel Hobby has its own limits (disallowing commercial use, 100 GB/month bandwidth, 100 GB-hours of compute). Gift Pool's current footprint would fit, but so does a $5/month Fly machine.
- **Migrating to Next.js is weeks of work for zero user-visible gain.** React Router v7 is actively developed, ships SSR, supports the same loader/action patterns, and is what this app is already built on. The symptoms users are seeing are not caused by RR v7.
- **Portfolio optics.** The debug-and-fix story (this very document) is a stronger resume story than "I rewrote the app when the real problem was a 256 MB machine."

### Phase 4 — Verification

- [ ] Re-run the Phase 1.4 repro; compare HAR / perf trace before-vs-after
- [ ] Check Sentry P95s trend down for the 48 h after deploy
- [ ] Ask the user to click around production for 10 min and report subjective feel
- [ ] Document the fix in **Fix Log** with before/after numbers

---

## Migration Decision Matrix

Only fill this in if Phase 1 + 2 + 3 Tier 1/2 don't solve the issue. Keep in mind the user's constraint: **low cost, free if possible**.

| Option | Cost | Effort | Keeps SQLite | Notes |
|---|---|---|---|---|
| Stay on Fly + tune (current) | ~free / $5/mo | S | ✅ | Default if Tier 1/2 works |
| Fly + Turso (libSQL) instead of LiteFS | $0 free tier | M | ✅ (different driver) | Removes LiteFS complexity, edge replicas |
| Vercel + React Router v7 + Turso | $0 hobby | M | ✅ (Turso) | No SQLite-on-disk, Fluid Compute warms faster |
| Vercel + Next.js App Router + Turso or Neon | $0 hobby | L–XL | ❌ | Full rewrite; strongest perf story but biggest effort |
| Railway / Render + Postgres | $5/mo | M | ❌ | Simpler than Fly, different trade-offs |

**Evaluation criteria we'll score after Phase 2:**
1. Cold-start behavior (is there a true warm path?)
2. DX + deploy friction
3. Migration effort (SQLite schema → whatever)
4. Monthly cost at current traffic (very low)
5. Portfolio optics (does the migration itself look good on a resume?)

---

## Fix Log

> Every fix lands here with a one-line description and a "before/after" note once verified.

- _(none yet)_

---

## Findings Log

> Append newest entries at the top. Include date, source (sentry/fly/code), and concrete numbers.

### Session 1 — 2026-04-10

**Source: HAR (`giftpool.app_Archive ...`) — 140 entries across 45 s**
- Slowest individual requests:
  - `/assets/_-CdpPrE95.js` — 27357 ms (origin wait, 0 ms receive)
  - `/assets/wishlist-_IUVi5OG.js` — 26640 ms origin wait
  - `/assets/badge-bKJpuHSd.js` — 26640 ms origin wait
  - `POST /api/friends/invite` — 18675 ms
  - `/friends.data?tab=friends&_routes=routes/friends` — 18470 ms
  - `/friends.data?tab=friends&_routes=root` — 18005 ms
  - `/resources/home/panels.data` — 10134 ms
  - `/resources/user-images/…` — 9479 / 9451 ms
- 16 `/__manifest` requests; slowest 6579 ms + 4167 ms. This is a RR v7 internal manifest endpoint hit once per navigation. Any slowness here blocks nav.
- Static assets are served with the correct `cache-control: public, max-age=31536000, immutable` header, but the first-session fetch goes to origin and the origin is too slow.

**Source: Server-Timing headers in HAR**
- Fast `/friends.data?_routes=root`: `root_loader=30 ms, getUserId=20 ms, find_user=6 ms`
- Slow `/friends.data?_routes=root` (1 s later): `root_loader=7314 ms, getUserId=4024 ms, find_user=1377 ms`
- Same query, no schema change, no indexes missing — pure machine thrashing.

**Source: `fly logs`**
- `prisma:query - 1139ms - SELECT Session WHERE id = ? LIMIT 1`
- `prisma:query - 1027ms - SELECT COUNT(*) FROM User`
- `GET / 200 - - 2730 ms`
- `GET /friends.data - 8481 ms`
- `POST /api/friends/invite - 4810 ms`
- `HEAD / - 4355 ms` (later 1151 ms)
- `Health check 'servicecheck-01-http-8080' has failed` → recovered 12 s later
- Then HEAD / returned to 17–35 ms range once the burst cleared

**Source: `fly machine status 0801e47f57d598`**
- Region: `ord`
- CPU Kind: `shared`
- vCPUs: `1`
- Memory: `256 MB`
- Volume mounted
- Machine up since 2026-04-07 (no restarts)

**Source: `fly.toml`**
- `min_machines_running = 1` — good, prevents cold starts
- `soft_limit = 80, hard_limit = 100` — way too high for this instance
- `swap_size_mb = 512` — signals the machine is expected to swap, which is a red flag
- Single machine, single region `ord`
- Has HTTP health check on `/resources/healthcheck`

**Source: `app/root.tsx` lines 375–393**
- Root layout swaps `<Outlet />` with `<FriendsRouteSkeleton />` or `<WishlistRouteSkeleton />` whenever a loading navigation targets those routes. This is the flicker bug — it replaces already-rendered content with a skeleton during navigation instead of showing the new skeleton only when there's nothing to render.

**Source: `app/root.tsx` loader**
- Every navigation costs: `getUserId` + `prisma.user.findUniqueOrThrow` with 4 nested selects (image, roles, permissions) + `getToast` + `prisma.notification.count`. Not crazy on a healthy machine, pathological on a thrashing one.

**Source: `app/routes/friends.tsx` + `app/utils/friends-page.server.ts`**
- `loader` calls `loadFriendsPageData(userId)` which runs 3 Promise.all queries (`listFriends`, `getIncomingFriendRequests`, `getOutgoingFriendRequests`). Reasonable.
- `clientLoader` uses a prefetch cache via `takePrefetchCache(request.url)` — if prefetched, returns cached; otherwise calls server loader. OK.

**Source: `app/components/nav/bottom/bottom-nav-link.tsx`**
- Uses `NavLink` with `isPending` to show a `…` suffix + pulse animation. `isActive` is bound to the current location, so during a pending navigation the old tab stays visually active while the new tab only gets a subtle pending hint. This is the "still under friends" illusion.

**Source: `app/entry.server.tsx`**
- Sentry is imported and captures errors. No explicit tracesSampleRate found in this file — need to check `utils/monitoring*.ts` for the actual init. Sentry + OTel together are non-zero memory pressure on a 256 MB box.

---

## Fix Log

> Every fix lands here with a one-line description and a "before/after" note once verified.

### PR 1 — Tier 1 machine resize + concurrency tune (2026-04-10)
- **Runtime change applied live** via `fly scale vm shared-cpu-2x --vm-memory 1024 -a gift-pool-c7cf`. Machine went from `shared-cpu-1x:256MB` → `shared-cpu-2x:1024MB`. Verified via `fly machine list`.
- **`fly.toml` pinned** the new VM size in a `[[vm]]` block so future deploys don't silently revert to the old size.
- **Concurrency lowered** from `soft=80, hard=100` → `soft=20, hard=40`. Prior values assumed a machine 4x this size.
- **Swap removed** (`swap_size_mb = 512` deleted). On a 1 GB machine with proper headroom we should never swap; if we do, that's the signal to scale up again, not to hide it behind disk thrash.
- **Before:** `/friends.data` wait 18.5 s, `/__manifest` wait up to 6.6 s, static JS wait 26 s, health check failures during repro. Prisma primary-key lookup observed at 1139 ms.
- **After:** TBD once PR 1 ships and we get real traffic samples. Will re-capture a HAR on the same flow and compare.

---

## Session Log

> Short summary of what was accomplished in each session and what the next session should pick up.

### 2026-04-10 Session 2 — Root cause identified
- Received HAR + Firefox profile from the user (gitignored immediately).
- Ran HAR analysis: origin wait times of 8–27 s for both data loaders AND static JS chunks.
- Ran `fly machine status`, `fly logs`, `fly machine list` — confirmed machine is `shared-cpu-1x:256MB`, single instance in `ord`, no restarts but repeated health check failures during the repro window.
- Read `app/root.tsx`, `app/routes/friends.tsx`, `app/utils/friends-page.server.ts`, `app/entry.server.tsx`, `app/components/nav/bottom/bottom-nav-link.tsx`.
- **Root cause: undersized machine (256 MB / 1 shared vCPU) + overoptimistic concurrency limits (80 soft / 100 hard).** Secondary: root-layout skeleton swap causes flicker; NavLink active state creates "stuck on Friends" illusion.
- Updated Hypotheses section, added Findings Log, rewrote Phase 3 fix plan.
- **Next session:** Get user approval for Tier 1 fix order. Execute machine resize (fastest, biggest win) before any code changes.

### 2026-04-10 Session 1 — Plan written
- Wrote this plan document.
- Confirmed stack context from `fly.toml`, `other/litefs.yml`, `package.json`, `.mcp.json`.
- Identified 7 candidate hypotheses ranked by likelihood.
