import * as React from 'react';
import {
  LuCalendar,
  LuChevronRight,
  LuGift,
  LuHistory,
  LuSparkles,
  LuUsers,
} from 'react-icons/lu';
import { Link, useFetcher } from 'react-router';
import { PoolStatusBadge } from '#app/components/pools/pool-status-badge.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { formatMonthDay } from '#app/utils/dates.ts';
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

      {/* ── For you (§6.2 #1): at most three next actions, ranked by
            responsibility then time. Quiet caught-up state; absent for
            brand-new accounts (the hero above is their one action). */}
      {panelsLoaded && (forYou.length > 0 || activePools.length > 0) && (
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
          {forYou.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {forYou.map((a) => (
                <Link
                  key={a.id}
                  to={a.href}
                  prefetch="intent"
                  data-testid={`for-you-${a.kind}`}
                  className="group flex items-center justify-between gap-3 rounded-xl bg-background-muted px-4 py-3.5 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
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
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              You&rsquo;re all caught up.
            </p>
          )}
        </section>
      )}

      {/* ── Upcoming occasions (§6.2 #2) — lead to the person page ── */}
      <section aria-labelledby="dashboard-occasions-heading">
        <Card className="p-5" data-testid="panel-birthdays">
          <Flex gap={2} align="center">
            <LuCalendar size={16} className="shrink-0 text-pool" />
            <h2
              id="dashboard-occasions-heading"
              className="text-sm font-semibold"
            >
              {HOME_COPY.panels.birthdaysHeading}
            </h2>
          </Flex>
          <ul className="mt-3 space-y-2">
            {birthdays.length > 0 ? (
              birthdays.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium">
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
      </section>

      {/* ── Active pools (§6.2 #3) ─────────────────────────────── */}
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

      {/* ── Your groups (§6.2 #4) ──────────────────────────────── */}
      <section aria-labelledby="dashboard-groups-heading">
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
          <div className="mt-3 flex flex-col gap-2">
            {groups.map((g) => (
              <Link
                key={g.id}
                to={`/groups/${g.id}`}
                prefetch="intent"
                className="group flex items-center justify-between gap-3 rounded-xl bg-background-muted px-4 py-3 transition-colors hover:bg-muted"
              >
                <p className="truncate text-sm font-medium group-hover:text-primary">
                  {g.name}
                </p>
                <LuChevronRight
                  size={16}
                  className="shrink-0 text-muted-foreground"
                />
              </Link>
            ))}
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

      {/* ── Gift memory (§6.2 #5): earned, hidden until it exists ── */}
      {memory.length > 0 && (
        <section
          aria-labelledby="dashboard-memory-heading"
          data-testid="panel-memory"
        >
          <h2
            id="dashboard-memory-heading"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <LuHistory size={18} className="shrink-0 text-pool" />
            Gift memory
          </h2>
          <ul className="mt-3 space-y-2">
            {memory.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/pools/${m.id}`}
                  prefetch="intent"
                  className="group flex items-center justify-between gap-3 rounded-xl bg-background-muted px-4 py-3 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
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
        </section>
      )}
    </main>
  );
};
