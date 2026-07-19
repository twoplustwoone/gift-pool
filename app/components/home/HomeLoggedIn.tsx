import * as React from 'react';
import { LuActivity, LuCalendar, LuGift, LuUsers } from 'react-icons/lu';
import { Link, useFetcher } from 'react-router';
import { PoolStatusBadge } from '#app/components/pools/pool-status-badge.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { formatMonthDay } from '#app/utils/dates.ts';
import { type PoolStatus } from '#app/utils/pool-constants.ts';
import { Flex } from '../ui-kit/flex.tsx';
import { type UpcomingBirthday, type RecentActivityItem } from './HomePanels';
import { HOME_COPY } from './home-copy';

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
  activity: RecentActivityItem[];
};

// ── Pool card ────────────────────────────────────────────────────────────────
// Status badge styling and labels live in the shared PoolStatusBadge.

const PoolCard = ({ pool }: { pool: ActivePool }) => {
  return (
    <Link
      to={`/pools/${pool.id}`}
      prefetch="intent"
      data-testid="pool-card"
      className="group block rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted/40"
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
  const activity = fetcher.data?.activity ?? [];

  // A brand-new user's natural first action is adding a wishlist item —
  // pools need friends and groups first. Lead with the wishlist until it
  // has something in it (June 2026 audit: the pools-first empty dashboard
  // pointed new users at the hardest possible first step).
  const isBrandNew = wishlistCount === 0;

  return (
    <main role="main" className="container space-y-8 py-6 md:py-10">
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

      {/* ── Active pools ───────────────────────────────────────── */}
      <section aria-labelledby="dashboard-pools-heading">
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
            <div className="mt-3 flex flex-col gap-2">
              {activePools.map((pool) => (
                <PoolCard key={pool.id} pool={pool} />
              ))}
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

      {/* ── Panels: birthdays + activity ───────────────────────── */}
      <section
        aria-labelledby="dashboard-panels-heading"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <h2 id="dashboard-panels-heading" className="sr-only">
          Upcoming events and activity
        </h2>

        {/* Upcoming birthdays */}
        <Card className="p-5" data-testid="panel-birthdays">
          <Flex gap={2} align="center">
            <LuCalendar size={16} className="shrink-0 text-pool" />
            <h3 className="text-sm font-semibold">
              {HOME_COPY.panels.birthdaysHeading}
            </h3>
          </Flex>
          <ul className="mt-3 space-y-2">
            {birthdays.length > 0 ? (
              birthdays.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.dateLabel}
                    </p>
                  </div>
                  {b.groupId ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/groups/${b.groupId}`} prefetch="intent">
                        {HOME_COPY.panels.planGift}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">
                No upcoming birthdays.{' '}
                <Link to="/friends" className="underline hover:text-foreground">
                  Add friends
                </Link>{' '}
                to see theirs.
              </li>
            )}
          </ul>
        </Card>

        {/* Recent activity */}
        <Card className="p-5" data-testid="panel-activity">
          <Flex gap={2} align="center">
            <LuActivity size={16} className="shrink-0 text-pool" />
            <h3 className="text-sm font-semibold">
              {HOME_COPY.panels.recentActivityHeading}
            </h3>
          </Flex>
          <ul className="mt-3 space-y-2">
            {activity.length > 0 ? (
              activity.map((a) => (
                <li key={a.id} className="text-sm">
                  {a.description}
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">
                Nothing new yet.{' '}
                <Link
                  to="/pools/new"
                  className="underline hover:text-foreground"
                >
                  Start a pool
                </Link>{' '}
                to see activity here.
              </li>
            )}
          </ul>
        </Card>
      </section>

      {/* ── Onboarding nudge — groups only: the empty-wishlist nudge
			    is the first-run hero at the top of the page now. */}
      {groupCount === 0 && (
        <section
          aria-labelledby="dashboard-setup-heading"
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <h2 id="dashboard-setup-heading" className="sr-only">
            Get started
          </h2>
          <Card className="border-dashed p-5">
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
        </section>
      )}
    </main>
  );
};
