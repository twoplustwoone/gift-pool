# Profile UX Revamp — Living Plan

**Status:** Phase 1 MERGED (#351). Phase 2 MERGED (#352). Phase 3 MERGED (#353). Phase 4 in progress.
**Branch:** `feat/profile-revamp-phase-4`
**Owner:** Claude (autopilot, checking in at visual validation and PR)

This file is local-only (`.claude/` is untracked). Its purpose is continuity — if the session dies, another agent should be able to `cat` this file and pick up exactly where we left off. Update it as you go.

---

## Decisions (locked)

From the user:
- **Birthday visibility**: user-configurable enum `FRIENDS | EVERYONE | NOBODY`, default `FRIENDS`. New `birthdayVisibility` field on `User`. Phase 3 adds the toggle; Phase 1 assumes default behavior (friends can see it, public cannot).
- **Address**: out of scope for this revamp. Schema stays, UI doesn't touch it.

Deferred-to-Claude calls (now locked):
- **Wishlist preview**: compact strip of 3 most-recent unpurchased items + "See full wishlist" CTA. Reuse wishlist row variant or build a mini card.
- **Mutual connections**: show both mutual groups (actionable, click → group) and mutual friends (social proof). Cap ~5 visible + "+N more".
- **Stats**: skip. No "# purchased for this person" (breaks gift surprise). Wishlist preview implies activity.
- **Bio**: add in Phase 3, ~160 char optional.
- **Photo editor**: moves into `MobileBottomSheet`. Delete `/settings/profile/photo` route. (Phase 2)
- **Notifications**: rehouse under `/settings/profile/notifications`. (Phase 2)
- **Danger zone**: typed-confirmation modal. (Phase 2)
- **`/me`**: canonical own-profile URL, already the case.
- **Connections stub**: remove from settings hub until OAuth actually ships. (Phase 2)

## Precedent to match

- `app/components/friends/friend-row.tsx` — whole-card click pattern (absolute Link inset-0, pointer-events-none children, pointer-events-auto actions), `ui-kit` primitives (`Box/Flex/Stack/Text`), uses `Avatar` component.
- `app/components/ui/mobile-bottom-sheet.tsx` — responsive modal.
- `app/components/wishlist/wishlist-item.tsx` — unified desktop+mobile row component.
- `app/utils/friends-page.server.ts::buildMutualGroupsByFriend` — mutual-groups query approach; mirror for profile's viewer↔target pair.

## Phase 1 — Shared primitives + rich public profile

**Goal:** `/me` and `/users/:username` become rich, shared layouts with meaningful content. Friend view exposes birthday, mutual groups/friends, wishlist preview.

### Implementation checklist

- [ ] **Branch + plan file** (#8)
  - [x] Plan file written
  - [ ] `git checkout -b feat/profile-revamp` from main

- [ ] **Loader helpers** (#9) — `app/utils/profile-page.server.ts` (new)
  - [ ] `getProfilePageData(viewerId, targetUserId)` — Promise.all of:
    - target user (id, name, username, image, birthday, createdAt)
    - mutual groups (reuse `buildMutualGroupsByFriend` approach for a single pair)
    - mutual friends (viewer's friend set ∩ target's friend set)
    - wishlist preview: top 3 unpurchased items with image (use existing wishlist selector minus blobs)
    - wishlist total item count
  - [ ] Friend-gating stays in route loader; helper only runs for `FRIENDS` state.

- [ ] **ProfileHeader component** (#10) — `app/components/users/profile-header.tsx`
  - Avatar (large, `size="l"`), display name, @username, birthday pill (if birthday and viewer is friend), "Joined X" subtle
  - `actions` slot (children)
  - Uses `Box/Flex/Stack/Text`
  - No absolute-overlap avatar — simpler centered layout for both mobile + desktop
  - Accepts: `user`, `relationshipMeta` (birthday show/hide), `actions`

- [ ] **MutualStrip component** (#11) — `app/components/users/mutual-strip.tsx`
  - Two mini-rows: "Mutual groups" with chips linking to group, "Mutual friends" with avatar+name chips linking to `/users/:username`
  - Hide a row if empty; hide entire strip if both empty
  - Cap visible at 5, show "+N more"

- [ ] **WishlistPreviewCard component** (#11) — `app/components/users/wishlist-preview-card.tsx`
  - Card header: "Wishlist" + count
  - List 3 items as a compact row variant (small thumbnail + name + price maybe)
  - CTA: "See full wishlist" → `/users/:username/wishlist`
  - Empty state: "No items yet"
  - Friend-gated content — only rendered when loader returns items

- [ ] **Rebuild `/users/:username` friend view** (#12)
  - File: `app/routes/users+/$username_+/index.tsx`
  - Loader: widen select, call `getProfilePageData` when friend
  - Render: `ProfileHeader` + `MutualStrip` + `WishlistPreviewCard`
  - Non-friend: keep `FriendGateCard` path (polished in #14)
  - Keep the component `UserProfileCard` exports if other routes use them, but retarget to new shell. Check call sites first.

- [ ] **Rebuild `/me` own view** (#13)
  - `/me` route — find it, current path
  - Same `ProfileHeader` + same sections (self variant)
  - Actions: Edit profile, Settings, Logout
  - No friend-gate meta; show own birthday if set, else "Add your birthday" hint linking to Phase 3 settings

- [ ] **Friend-gate polish** (#14)
  - File: `app/components/friends/friend-gate-card.tsx`
  - Add `targetUser` prop (avatar + name)
  - State-aware copy:
    - `NONE` → "Add {name} to see their profile" / "Send friend request"
    - `PENDING_OUTGOING` → "Waiting for {name} to accept" / "Cancel request"
    - `PENDING_INCOMING` → "{name} wants to be friends" / "Accept" / "Reject"
  - i18n keys already exist in `friends.accessRequired*` — add new ones if needed.

- [ ] **Tests** (#15)
  - Unit: `ProfileHeader`, `MutualStrip`, `WishlistPreviewCard`
  - Unit: `getProfilePageData` mutual-friends math (skip if integration-style)
  - E2E smoke: `tests/e2e/user-profile.test.ts` — Wade visits Marco (friend), sees avatar + name + mutual group pill + wishlist preview; Wade visits Zoe (incoming), sees friend-gate with accept.

- [ ] **Visual validation** (#16) — **STOP HERE**
  - Screenshot desktop + mobile of:
    - `/me`
    - `/users/marco` (friend view)
    - `/users/zoe` (incoming gate)
    - `/users/ben` (outgoing gate)
  - Show user, get ack.

- [ ] **Validate + push + PR** (#17)
  - `npm run typecheck && npm run lint && npm test -- --run && npm run test:e2e -- --grep "profile"`
  - Single PR: `feat(profile): phase 1 — shared header, rich friend view, mutual strip, wishlist preview`
  - Push, `gh pr create`, return URL.

## Phase 2 — Settings hub + photo sheet (IN PROGRESS)

**Goal:** `/settings/profile` becomes a grouped, ui-kit-based hub. Photo editing moves inline. Notifications rehouses under the same shell. Delete gets a real typed confirmation. Connections stub is removed.

### Scope adjustments from the original plan

- **Bio field** — deferred to Phase 3 (requires schema migration). Phase 2 renders the Profile card with name + username + avatar only.
- **Privacy card (birthday visibility)** — deferred to Phase 3 (requires `birthdayVisibility` enum migration). Phase 2 does NOT add a Privacy card. When Phase 3 ships, it inserts a Privacy card between Account and Preferences without touching Phase 2 work.

### Implementation checklist

- [ ] **Branch + plan file**
  - [x] Branch created: `feat/profile-revamp-phase-2`

- [ ] **Settings hub rewrite** — `app/routes/settings+/profile.index.tsx`
  - Replace raw `grid grid-cols-6` layout with `Box/Stack/Text` cards.
  - Card structure (top to bottom):
    1. **Profile** — avatar (click/tap → opens photo bottom sheet), inline name + username form (Conform + Zod, keep async username uniqueness check).
    2. **Account** — Change email (shows current), Password (Change / Create based on `hasPassword`), 2FA (Enable / Manage based on `isTwoFactorEnabled`). Each is a row navigating to its existing sub-route.
    3. **Preferences** — Notifications row linking to `/settings/profile/notifications`.
    4. **Data** — Download your data row (links to existing `/resources/download-user-data`).
    5. **Danger zone** — Sign out of other sessions (keeps double-check pattern) + Delete all data (typed-confirm dialog, not the current one-click double-check).
  - Use `Card` + `CardContent` from `#app/components/ui/card.tsx` for each group.
  - Remove the connections row entirely (dead link).
  - Drop the `profile-breadcrumbs.tsx` mechanism — settings shouldn't root its breadcrumb under `/users/wade`. Strip the breadcrumb wrapper from `profile.tsx` and let each settings screen own its heading. (Keep sub-route files themselves; just delete the breadcrumb chain rendering in the layout.)

- [ ] **Photo editor as bottom sheet** — new component
  - Extract the cropper UI from `profile.photo.tsx` into a `ProfilePhotoSheet` component (reuses the same `react-easy-crop` logic, the same action handler).
  - Use `MobileBottomSheet` from `#app/components/ui/mobile-bottom-sheet.tsx` — matches wishlist editor precedent.
  - Avatar in the Profile card opens the sheet (click handler + open state local to the hub).
  - Delete `/settings/profile/photo` route entirely. Migration: keep a redirect at the old path for users with stale bookmarks → `/settings/profile?photo=1` triggers sheet open on mount. Actually, simpler: just delete the route. No prod traffic yet.
  - Sub-route file to delete: `app/routes/settings+/profile.photo.tsx`
  - Remove from breadcrumb list in `profile-breadcrumbs.tsx` if it's enumerated there.

- [ ] **Notifications rehousing** — move `app/routes/settings+/notifications.tsx` → `app/routes/settings+/profile.notifications.tsx`
  - So it inherits the settings shell from `profile.tsx` layout wrapper.
  - Also adopt ui-kit primitives for its current full-width table — at minimum wrap in the same card shell.
  - Update any internal links (`user-dropdown`, any deep links) from `/settings/notifications` to `/settings/profile/notifications`.
  - Keep the old route as a 301 redirect for safety.

- [ ] **Danger zone typed confirm**
  - New component: `DangerZoneDeleteDialog` using `Dialog` primitive.
  - User types their username to unlock the Delete button. Copy: \"Type **{username}** to confirm\".
  - Wire to existing `deleteDataAction`.
  - Keep the existing `signOutOfSessionsAction` double-check as-is — less catastrophic.

- [ ] **Tests**
  - Unit: hub renders all sections, delete dialog enables button only on exact username match, photo sheet opens on avatar click.
  - E2E: `tests/e2e/settings-profile.test.ts` — already covers basic info, password, photo, email. Update photo test to use the sheet trigger instead of navigating to `/settings/profile/photo`. Add typed-confirm delete test (stubbed to not actually delete).
  - E2E: `tests/e2e/settings-notifications.test.ts` — update path from `/settings/notifications` to `/settings/profile/notifications` and verify redirect.

- [ ] **Visual validation checkpoint** — **STOP HERE**
  - Screenshot desktop + mobile of:
    - `/settings/profile` (hub)
    - Photo sheet open
    - `/settings/profile/notifications` (new path)
    - Delete dialog with username confirmation
  - Show user, get ack.

- [ ] **Validate + push + PR**
  - `npm run typecheck && npm run lint && npm test -- --run`
  - Targeted e2e: `npx playwright test tests/e2e/settings-profile.test.ts tests/e2e/settings-notifications.test.ts`
  - PR title: `feat(profile): phase 2 — settings hub revamp, photo sheet, notifications rehouse, danger zone`

## Phase 3 — Birthday, bio, visibility (IN PROGRESS)

**Goal:** ship the two deferred schema fields (`bio`, `birthdayVisibility`), expose them in the settings hub, and honor visibility everywhere the birthday is rendered.

### Implementation checklist

- [ ] **Prisma migration + client regen**
  - `bio String?` on User (trim/max handled in Zod, keep DB loose at 320 chars for safety)
  - `BirthdayVisibility` enum: `FRIENDS | EVERYONE | NOBODY`
  - `birthdayVisibility BirthdayVisibility @default(FRIENDS)` on User
  - Run `npx prisma migrate dev --name add_bio_and_birthday_visibility`
  - Regen client (happens automatically on migrate)

- [ ] **Bio field on Profile settings card** — `profile.index.tsx`
  - Add `bio` to `ProfileFormSchema` (Zod: `.string().max(160).trim().optional()`)
  - Textarea component (use Input or new Textarea — check ui library)
  - Loader selects `bio`
  - `profileUpdateAction` writes it

- [ ] **Birthday date picker on Profile settings card**
  - Add `birthday` to `ProfileFormSchema` (Zod: date coerced from string, optional)
  - Native `<input type="date">` for now — cheapest and works on mobile
  - Loader selects `birthday`
  - Action writes it (convert empty string → null)

- [ ] **Privacy card** — new component in `profile.index.tsx`
  - Slots between Account and Preferences
  - Radio group for birthday visibility (FRIENDS default, EVERYONE, NOBODY)
  - Separate intent `update-privacy` or fold into `update-profile`? — fold in, keep one form.
  - Use `<fieldset>` + three `<label><input type="radio">` — simple + accessible.

- [ ] **Honor visibility in public profile** — `users+/$username_+/index.tsx` loader + FriendProfileView
  - If state is `FRIENDS` and target's `birthdayVisibility === 'NOBODY'`: don't select or render birthday
  - If state is `NONE` (non-friend) and `birthdayVisibility === 'EVERYONE'`: show birthday via the friend-gate or a new "public preview" variant (scope-check: the current gate renders only the gate card for non-friends, no profile data. For now, EVERYONE only affects the friend-rendered case — non-friends still see the gate. Revisit if needed.)
  - Actually, with the gate behavior unchanged, `EVERYONE` doesn't have a surface for non-friends to see birthdays. That's OK — Phase 3 just adds the knob; any "public profile" feature is a separate future scope.

- [ ] **Honor visibility in friends list** — `friends-page.server.ts` + `friend-row.tsx`
  - The friends list shows the upcoming birthday pill. If the friend set `NOBODY`, hide it.
  - Loader should select `birthdayVisibility` alongside `birthday` in `friendUserSelect`.
  - `getUpcomingBirthday` is a pure helper — wrap its call site in a visibility check.

- [ ] **Upcoming birthdays home card** — find the caller, apply the same visibility gate

- [ ] **Bio in ProfileHeader** — `profile-header.tsx`
  - New optional `bio` prop, rendered under the handle line in a muted paragraph
  - Extend `/me` and `users+/$username_+/index.tsx` loaders to select `bio`
  - Pass it into `<ProfileHeader bio={...} />`

- [ ] **Seed fixtures** — `prisma/seed.ts`
  - Give a handful of seeded users bios
  - Mix `birthdayVisibility`: default for most, one with `EVERYONE`, one with `NOBODY` so we can exercise the loader gate manually

- [ ] **Tests**
  - Unit: hub form renders bio + birthday + privacy radio; profile update action writes all three
  - Unit: `ProfileHeader` renders bio when provided
  - Unit: loader test asserts birthday is omitted when `birthdayVisibility === 'NOBODY'` (update existing `$username.loader.test.ts`)
  - E2E: settings hub shows bio + birthday + privacy radio; toggling privacy to `NOBODY` hides the birthday pill on `/me` and on the friend view

- [ ] **Visual validation checkpoint** — **STOP HERE**
  - Screenshots desktop + mobile:
    - settings hub with Profile (bio + birthday) + new Privacy card
    - `/me` and friend view with bio rendered under handle
    - Friend view with birthday pill vs hidden when NOBODY

- [ ] **Validate + push + PR**

## Out of scope (later phases)

- **Phase 4** — 2FA e2e coverage, friend-gate polish (covered in Phase 1 already for copy, this would be deeper coverage)
- **Address** — punted indefinitely per user (pool/group visibility rules need design)
- **Public profile preview for EVERYONE** — current non-friend gate doesn't leak any profile data. If we want `EVERYONE` to actually expose the birthday publicly, that's a separate "public preview card" feature.

## Gotchas / notes for a resuming agent

- `app/components/ui/avatar.tsx` is the Avatar component — already wraps `getUserImgSrc`. Use `size="l"` for profile hero, `size="m"` for row items.
- `app/utils/friends-page.server.ts::buildMutualGroupsByFriend` — copy the approach for a single pair; the full map is overkill for one profile.
- `friend-row.tsx` uses `LuCake` from `react-icons/lu` for birthday pill — reuse icon + formatting.
- `app/routes/friends.tsx::getMutualGroupChips` and `BIRTHDAY_VISIBILITY_DAYS = 60` — reuse both for consistency.
- Wishlist preview should NOT load blob bytes (see perf commit `ae7609d` — wishlist list queries explicitly stopped loading image bytes). Use `hasImage: true` + `image: { select: { id: true } }`.
- Do NOT `git add .` — add specific files. `.claude/` is untracked but not in `.gitignore`, so an inadvertent `git add .` would stage this plan file.
- Seed fixtures: Wade is logged in by default. Friends: marco, np, alvaro, sofia, hana, leo. Zoe has incoming → Wade. Ben is Wade's outgoing.

## Progress log

Append one-liners as work completes. Update on resume.

- 2026-04-10 — Plan written. Starting Phase 1.
- 2026-04-10 — Phase 1 shipped. Branch `feat/profile-revamp`, commits `a7fcf91` (impl) + `e94c990` (test fixups). PR #351 open. Validation: typecheck clean, 0 lint errors, 505/505 unit, 5/5 relevant e2e. Mobile verified via 390 px iframe sim. User flagged the 20 px avatar in mutual-friends pills (unreadable hat-crop); fixed by swapping to `LuUser` icon to match mutual-groups chip. Stale tests refreshed: `profile+/index.test.tsx`, `profile+/index.loader.test.ts`, `users+/$username.test.tsx`, `users+/$username.loader.test.ts`, `friend-gate.test.ts`.
- 2026-04-10 — Phase 1 follow-up. Codex flagged wishlist preview count inconsistency (total counted all ACTIVE but preview filtered `purchase: null`) — fixed by adding `purchase: null` to count query. CI playwright failed on `onboarding with link` (my `See {name}'s full wishlist` aria-label collided with nav dropdown trigger) and on `prefetch.test.ts` line 302 (stale `Add {name} as a friend to continue` heading assertion) — both fixed. Sonar 8 MINOR issues (all `Readonly<>` prop conventions + negated condition + unused re-export) cleaned up in commit `2823d28`. PR #351 merged to main as `6cad7f7`.
- 2026-04-11 — Phase 2 starting. On `feat/profile-revamp-phase-2` off main. Scope: settings hub rewrite, photo bottom sheet, notifications rehouse, danger zone typed confirm, connections stub removal. Bio + birthday visibility deferred to Phase 3 (need schema migrations).
- 2026-04-11 — Phase 2 PR #352 open. Commit `a7c18ee`. Settings hub rewritten with grouped cards (Profile / Account / Preferences / Your data / Danger zone). Photo editor moved inline to a `MobileBottomSheet` — `react-easy-crop` had to be lazy-loaded via `React.lazy()` because its module-level `window` access crashes SSR when pulled into the shared hub bundle. Had to drop Conform from the photo sheet — the `<fetcher.Form>` + useForm pattern raced with Radix focus management and unmounted the dialog on file-change. Fixed with plain `fetcher.submit(FormData)`. Notifications moved to `/settings/profile/notifications`, old path kept as redirect. Danger zone typed-confirm dialog gates the delete button on exact username match. Validation: typecheck clean, 0 lint errors, 505/505 unit, 13/13 affected e2e. Photo upload happy-path e2e is limited to sheet-opens + Save-gate; full round-trip hits a Radix + Suspense + lazy-load race that's hard to test deterministically.
- 2026-04-11 — Phase 2 follow-ups. First user flagged sub-forms looking naked → created `SettingsSubpage` shell and retrofit change-email, password, password/create, two-factor.{index,verify,disable}. Also fixed the 2FA e2e aria-label mismatch ("Enable 2FA" / "Disable 2FA" on the Account row). Deleted dead `profile-breadcrumbs.tsx` + `profile.connections.tsx`. Then Codex P1 caught a real regression — moving notifications under `profile.tsx`'s parent loader put `requireUserId` in front of the token-flow branch, breaking magic-link preference management for signed-out users. Fixed by stripping the loader from `profile.tsx` entirely (every child route does its own auth). Then SonarCloud quality gate failed on 68.3% new-code coverage → added 15 unit tests across `DangerZoneDeleteDialog`, `SettingsSubpage`, `SettingsProfileHub`, `ProfilePhotoSheet`, and a single `profile.sub-pages.test.tsx` covering change-email/password/create/2fa.{index,verify,disable}. jsdom needs a `ResizeObserver` polyfill for the OTPField + a `vi.mock('react-easy-crop')` for the photo sheet. Final state: 531/531 unit, all CI green. PR #352 merged as commit `0ddc913`.
- 2026-04-11 — Phase 3 starting. On `feat/profile-revamp-phase-3` off main. Scope: Prisma migration (bio + birthdayVisibility enum), bio + birthday fields on settings hub, Privacy card with visibility radio, loader gates everywhere birthdays render, bio in ProfileHeader on /me + friend view, richer seed fixtures. Address stays punted.
- 2026-04-11 — Phase 3 PR #353 open. Commits `25bf0ec` (impl) + `f46ce73` (fix: Conform constraint required-asterisk override + new-field tests). SQLite forced `birthdayVisibility` to a String column with app-layer enum validation instead of a Prisma enum. Hit two Vite dev-server hiccups mid-session: 1) a stale SSR module graph after adding many imports to profile.index.tsx required a dev-server restart (known `isChunkLoadError` HMR staleness bug), 2) an unrelated React useContext error on first post-restart visit that cleared after a second reload. Notifications e2e tests are flaky under high parallelism due to shared dev-DB state contention (pre-existing, not a regression) — they pass cleanly with `--workers=1`. Verified end-to-end: Wade's bio renders on /me and the settings hub, Alvaro (FRIENDS default) shows the Jun 4 pill on his friend view, Hana (NOBODY) has her birthday hidden everywhere even though it's tomorrow. Final state: 536/536 unit, 0 lint errors, typecheck clean.
- 2026-04-11 — Phase 3 follow-ups. Codex raised two P1 bugs: 1) BirthdaySchema stored midnight UTC which shifts calendar dates backwards for viewers west of UTC — fixed to noon UTC + getUTCMonth/Date readers, 2) home.panels.tsx only hid NOBODY not FRIENDS, leaking birthdays to group-mates who weren't actual friends — fixed by also loading viewer friendships and gating FRIENDS visibility against the set. Sonar coverage gate failed at 75.8% → added 18 unit tests (`birthday.test.ts`, `user-validation.test.ts`, new home.panels matrix test). Three non-blocking Sonar nits cleaned up after the gate passed: extracted helpers in home.panels loader to reduce cognitive complexity from 23 to under 15, added aria-label + swapped Text→span for the Privacy radio labels, simplified `trimmedBio ? trimmedBio : null` → `trimmedBio || null`. PR #353 merged as commit `f826e87`.
- 2026-04-11 — Phase 4 starting. On `feat/profile-revamp-phase-4` off main. Scope: 2FA disable e2e, friend-gate PENDING_INCOMING (accept + reject) and PENDING_OUTGOING (cancel) e2e coverage — the three state branches I introduced in Phase 1's state-aware copy but didn't have deep e2e coverage for.
