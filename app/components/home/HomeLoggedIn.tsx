import * as React from 'react';
import {
  LuCalendar,
  LuCalendarHeart,
  LuChevronRight,
  LuGift,
  LuHistory,
  LuSparkles,
  LuTruck,
  LuUsers,
  LuVote,
  LuWallet,
} from 'react-icons/lu';
import { Link, useFetcher } from 'react-router';
import { PageShell } from '#app/components/page-shell.tsx';
import { PoolStatusBadge } from '#app/components/pools/pool-status-badge.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Skeleton } from '#app/components/ui/skeleton.tsx';
import { formatMonthDay } from '#app/utils/dates.ts';
import { cn } from '#app/utils/misc.tsx';
import { type PoolStatus } from '#app/utils/pool-constants.ts';
import { Flex } from '../ui-kit/flex.tsx';
import { HOME_COPY } from './home-copy';

type UpcomingBirthday = {
  id: string;
  name: string;
  username?: string | null;
  dateISO: string; // yyyy-mm-dd
  dateLabel: string;
  groupId?: string | null;
};

type ForYouAction = {
  id: string;
  kind: 'buy' | 'deliver' | 'vote' | 'settle' | 'plan';
  title: string;
  detail: string | null;
  href: string;
};

type GiftMemoryEntry = {
  id: string;
  recipientLabel: string;
  giftLabel: string;
  contributorCount: number;
  whenISO: string;
};

type HomeGroup = { id: string; name: string };

// ── Types ────────────────────────────────────────────────────────────────────

type ActivePool = {
  id: string;
  title: string;
  status: string;
  occasionType: string;
  recipientName: string | null;
  eventDate: string | null;
  contributorCount: number;
};

type HomeLoggedInProps = {
  activePools: ActivePool[];
  wishlistCount: number;
  groupCount: number;
  mock?: 'empty' | 'data';
};

type PanelsLoaderData = {
  birthdays: UpcomingBirthday[];
  forYou: ForYouAction[];
  memory: GiftMemoryEntry[];
  groups: HomeGroup[];
};

// ── Row leading elements ────────────────────────────────────────────────────
// A "row inside an ordinary section" previously had no leading visual at all
// (no icon, no avatar) at any width, which is part of why mobile rows read as
// too narrow for their height. Rather than growing an element that didn't
// exist, these add one — reusing data already on hand (no loader changes):
// a semantic icon per For-you action kind, and a solid initials badge (no
// photo fetch) for the three row types that name a person or group.

const FOR_YOU_ICON: Record<
  ForYouAction['kind'],
  React.ComponentType<{
    size?: number;
    className?: string;
    'aria-hidden'?: boolean;
  }>
> = {
  buy: LuGift,
  deliver: LuTruck,
  vote: LuVote,
  settle: LuWallet,
  plan: LuCalendarHeart,
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const first = parts[0]!.charAt(0);
  const last = parts[parts.length - 1]!.charAt(0);
  return (first + last).toUpperCase();
}

const ROW_ICON_SIZE = 44;

const InitialsBadge = ({ name }: { name: string }) => (
  <div
    aria-hidden
    className="flex shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
    style={{ height: ROW_ICON_SIZE, width: ROW_ICON_SIZE }}
  >
    {initialsFrom(name)}
  </div>
);

const KindIconBadge = ({ kind }: { kind: ForYouAction['kind'] }) => {
  const Icon = FOR_YOU_ICON[kind];
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-background text-primary"
      style={{ height: ROW_ICON_SIZE, width: ROW_ICON_SIZE }}
    >
      <Icon size={20} aria-hidden />
    </div>
  );
};

// Two-up at the lg (1024px) breakpoint per handoff §8's multi-column license
// — but only once a list actually has enough items to fill a second column;
// a lone item split into a 2-col grid just recreates the empty-feeling gutter
// this composition exists to fix.
const rowGridClass = (count: number) =>
  cn('grid gap-2', count >= 2 && 'lg:grid-cols-2');

// ── Pool card ────────────────────────────────────────────────────────────────
// Status badge styling and labels live in the shared PoolStatusBadge.

const PoolCard = ({ pool }: { pool: ActivePool }) => {
  return (
    <Link
      to={`/pools/${pool.id}`}
      prefetch="intent"
      data-testid="pool-card"
      className="group block rounded-xl border border-subcard-border bg-subcard px-4 py-3.5 shadow-sm transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold group-hover:text-primary">
            {pool.title}
          </p>
          {pool.recipientName && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              for{' '}
              <span className="font-medium text-foreground">
                {pool.recipientName}
              </span>
            </p>
          )}
        </div>
        <PoolStatusBadge status={pool.status as PoolStatus} />
      </div>
      <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <LuUsers size={11} />
          {pool.contributorCount}{' '}
          {pool.contributorCount === 1 ? 'contributor' : 'contributors'}
        </span>
        {pool.eventDate && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1">
              <LuCalendar size={11} />
              {formatMonthDay(pool.eventDate)}
            </span>
          </>
        )}
      </div>
    </Link>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

export const HomeLoggedIn: React.FC<HomeLoggedInProps> = ({
  activePools,
  wishlistCount,
  groupCount,
  mock,
}) => {
  const fetcher = useFetcher<PanelsLoaderData>();

  React.useEffect(() => {
    if (fetcher.state !== 'idle' || fetcher.data) return;
    const suffix = mock ? `?mock=${mock}` : '';
    Promise.resolve(fetcher.load(`/resources/home/panels${suffix}`)).catch(
      () => {},
    );
  }, [fetcher, mock]);

  const birthdays = fetcher.data?.birthdays ?? [];
  const forYou = fetcher.data?.forYou ?? [];
  const memory = fetcher.data?.memory ?? [];
  const groups = fetcher.data?.groups ?? [];
  const panelsLoaded = Boolean(fetcher.data);

  // A brand-new user's natural first action is adding a wishlist item —
  // pools need friends and groups first. Lead with the wishlist until it
  // has something in it (June 2026 audit: the pools-first empty dashboard
  // pointed new users at the hardest possible first step).
  const isBrandNew = wishlistCount === 0;

  return (
    <main role="main" className="w-full py-6 md:py-10">
      <PageShell className="space-y-8">
        {/* ── First-run: start the wishlist ──────────────────────── */}
        {isBrandNew && (
          <section aria-labelledby="dashboard-first-item-heading">
            <Card className="p-6 text-center md:p-8">
              <h2
                id="dashboard-first-item-heading"
                className="text-lg font-semibold"
              >
                Start your wishlist
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Add the first thing you'd love to receive — paste a product link
                and we'll fill in the details. Friends see your list when they
                plan gifts.
              </p>
              <Button asChild className="mt-4">
                <Link
                  to="/wishlist?add=1"
                  prefetch="intent"
                  data-testid="first-item-cta"
                >
                  Add your first item
                </Link>
              </Button>
            </Card>
          </section>
        )}

        {/* ── For you (§6.2 #1): at most three next actions, ranked by
              responsibility then time. Quiet caught-up state; absent for
              brand-new accounts (the hero above is their one action).
              Rendered as soon as we might need it (not gated on
              panelsLoaded) so it reserves its slot above Upcoming occasions
              from first paint — a skeleton fills in while
              /resources/home/panels is in flight instead of the section
              popping in afterward and pushing the rest of Home down (CLS).
              Full width above the main/rail split below — it's the single
              highest-priority section, not part of the composed grid. */}
        {!isBrandNew &&
          (!panelsLoaded || forYou.length > 0 || activePools.length > 0) && (
            <section
              aria-labelledby="dashboard-for-you-heading"
              data-testid="panel-for-you"
            >
              <h2
                id="dashboard-for-you-heading"
                className="flex items-center gap-2 text-lg font-semibold"
              >
                <LuSparkles size={18} className="shrink-0 text-primary" />
                For you
              </h2>
              {!panelsLoaded ? (
                <div className="mt-3 rounded-xl bg-background-muted p-3">
                  <div
                    className={rowGridClass(2)}
                    role="status"
                    aria-label="Loading for you"
                  >
                    <Skeleton className="h-[58px] w-full rounded-xl" />
                    <Skeleton className="h-[58px] w-full rounded-xl" />
                  </div>
                </div>
              ) : forYou.length > 0 ? (
                <div className="mt-3 rounded-xl bg-background-muted p-3">
                  <div className={rowGridClass(forYou.length)}>
                    {forYou.map((a) => (
                      <Link
                        key={a.id}
                        to={a.href}
                        prefetch="intent"
                        data-testid={`for-you-${a.kind}`}
                        className="group flex items-center gap-3 rounded-xl border border-subcard-border bg-subcard px-4 py-3.5 shadow-sm transition-colors hover:bg-muted/40"
                      >
                        <KindIconBadge kind={a.kind} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold group-hover:text-primary">
                            {a.title}
                          </p>
                          {a.detail ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {a.detail}
                            </p>
                          ) : null}
                        </div>
                        <LuChevronRight
                          size={16}
                          className="shrink-0 text-muted-foreground"
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  You&rsquo;re all caught up.
                </p>
              )}
            </section>
          )}

        {/* ── Main column + rail (§6.2 #2-#5), ≥1024px only ──────────
              Section order in the DOM stays exactly §6.2's sequence —
              Upcoming occasions, Active pools, Groups, Gift memory — this
              only repositions them visually via CSS grid placement. Below
              1024px the grid classes don't apply and this reflows to the
              same single column as before. */}
        <div className="space-y-8 lg:grid lg:grid-cols-[1.55fr_1fr] lg:items-start lg:gap-x-8 lg:gap-y-8 lg:space-y-0">
          {/* Upcoming occasions — main column, row 1 */}
          <section
            aria-labelledby="dashboard-occasions-heading"
            className="lg:col-start-1 lg:row-start-1"
          >
            <Flex gap={2} align="center">
              <LuCalendar size={16} className="shrink-0 text-pool" />
              <h2
                id="dashboard-occasions-heading"
                className="text-sm font-semibold"
              >
                {HOME_COPY.panels.birthdaysHeading}
              </h2>
            </Flex>
            <div
              className="mt-3 rounded-xl bg-background-muted p-3"
              data-testid="panel-birthdays"
            >
              <ul className={rowGridClass(birthdays.length)}>
                {birthdays.length > 0 ? (
                  birthdays.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-3 rounded-xl border border-subcard-border bg-subcard px-4 py-3 shadow-sm"
                    >
                      <InitialsBadge name={b.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {b.username ? (
                            <Link
                              to={`/users/${b.username}`}
                              prefetch="intent"
                              className="hover:text-primary hover:underline"
                            >
                              {b.name}
                            </Link>
                          ) : (
                            b.name
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {b.dateLabel}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="secondary">
                        <Link
                          to={
                            b.username
                              ? `/users/${b.username}`
                              : `/groups/${b.groupId}`
                          }
                          prefetch="intent"
                        >
                          {HOME_COPY.panels.planGift}
                        </Link>
                      </Button>
                    </li>
                  ))
                ) : (
                  <li className="px-1 py-1 text-sm text-muted-foreground">
                    No upcoming birthdays.{' '}
                    <Link
                      to="/friends"
                      className="underline hover:text-foreground"
                    >
                      Add friends
                    </Link>{' '}
                    to see theirs.
                  </li>
                )}
              </ul>
            </div>
          </section>

          {/* Active pools — main column, row 2 */}
          <section
            aria-labelledby="dashboard-pools-heading"
            className="lg:col-start-1 lg:row-start-2"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="dashboard-pools-heading"
                className="flex min-w-0 items-center gap-2 text-lg font-semibold"
              >
                <LuGift size={18} className="shrink-0 text-primary" />
                <span className="truncate">Your pools</span>
              </h2>
              <Button asChild size="sm" className="shrink-0 whitespace-nowrap">
                <Link to="/pools/new" prefetch="intent">
                  + Start a Pool
                </Link>
              </Button>
            </div>

            {activePools.length > 0 ? (
              <>
                <div className="mt-3 rounded-xl bg-background-muted p-3">
                  <div className={rowGridClass(activePools.length)}>
                    {activePools.map((pool) => (
                      <PoolCard key={pool.id} pool={pool} />
                    ))}
                  </div>
                </div>
                <div className="mt-3 text-right">
                  <Link
                    to="/pools"
                    prefetch="intent"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    View all pools →
                  </Link>
                </div>
              </>
            ) : (
              <Card className="mt-3 p-5 text-center">
                <p className="text-sm font-medium">No active pools yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Start one to coordinate a group gift with friends.
                </p>
                {/* Outline while the user is brand new — the wishlist hero
						    above is the primary action at that stage. */}
                <Button
                  asChild
                  size="sm"
                  variant={isBrandNew ? 'outline' : 'default'}
                  className="mt-4"
                >
                  <Link to="/pools/new" prefetch="intent">
                    Start a Pool
                  </Link>
                </Button>
              </Card>
            )}
          </section>

          {/* Groups — rail, row 1 */}
          <section
            aria-labelledby="dashboard-groups-heading"
            className="lg:col-start-2 lg:row-start-1"
          >
            <h2
              id="dashboard-groups-heading"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <LuUsers size={18} className="shrink-0 text-pool" />
              Your groups
            </h2>
            {groupCount === 0 ? (
              <Card className="mt-3 border-dashed p-5">
                <h3 className="text-sm font-medium">
                  {HOME_COPY.panels.emptyGroupsTitle}
                </h3>
                <div className="mt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/groups/new"
                      prefetch="intent"
                      data-testid="empty-groups-cta"
                    >
                      {HOME_COPY.panels.emptyGroupsCta}
                    </Link>
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="mt-3 rounded-xl bg-background-muted p-3">
                <div className="flex flex-col gap-2">
                  {groups.map((g) => (
                    <Link
                      key={g.id}
                      to={`/groups/${g.id}`}
                      prefetch="intent"
                      className="group flex items-center gap-3 rounded-xl border border-subcard-border bg-subcard px-4 py-3 shadow-sm transition-colors hover:bg-muted/40"
                    >
                      <InitialsBadge name={g.name} />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">
                        {g.name}
                      </p>
                      <LuChevronRight
                        size={16}
                        className="shrink-0 text-muted-foreground"
                      />
                    </Link>
                  ))}
                </div>
                <div className="mt-1 text-right">
                  <Link
                    to="/groups"
                    prefetch="intent"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    View all groups →
                  </Link>
                </div>
              </div>
            )}
          </section>

          {/* Gift memory — rail, row 2 (§6.2 #5: earned, hidden until it
                exists) */}
          {memory.length > 0 && (
            <section
              aria-labelledby="dashboard-memory-heading"
              data-testid="panel-memory"
              className="lg:col-start-2 lg:row-start-2"
            >
              <h2
                id="dashboard-memory-heading"
                className="flex items-center gap-2 text-lg font-semibold"
              >
                <LuHistory size={18} className="shrink-0 text-pool" />
                Gift memory
              </h2>
              <div className="mt-3 rounded-xl bg-background-muted p-3">
                <ul className="flex flex-col gap-2">
                  {memory.map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/pools/${m.id}`}
                        prefetch="intent"
                        className="group flex items-center gap-3 rounded-xl border border-subcard-border bg-subcard px-4 py-3 shadow-sm transition-colors hover:bg-muted/40"
                      >
                        <InitialsBadge name={m.recipientLabel} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium group-hover:text-primary">
                            {m.giftLabel}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            for {m.recipientLabel} ·{' '}
                            {m.contributorCount === 1
                              ? 'a solo gift'
                              : `${m.contributorCount} gave together`}
                          </p>
                        </div>
                        <LuChevronRight
                          size={16}
                          className="shrink-0 text-muted-foreground"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </PageShell>
    </main>
  );
};
