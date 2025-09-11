import { Link, useFetcher } from '@remix-run/react';
import * as React from 'react';
import { LuActivity, LuCalendar } from 'react-icons/lu';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Flex } from '../ui-kit/flex.tsx';
import { HOME_COPY } from './home-copy';

export type UpcomingBirthday = {
  id: string;
  name: string;
  username?: string | null;
  dateISO: string; // yyyy-mm-dd
  dateLabel: string;
  groupId?: string | null;
};

export type RecentActivityItem = {
  id: string;
  description: string;
  timestampISO: string;
};

type PanelsLoaderData = {
  birthdays: UpcomingBirthday[];
  activity: RecentActivityItem[];
};

type HomePanelsProps = {
  isLoggedIn: boolean;
  wishlistCount: number;
  groupCount: number;
  mock?: 'empty' | 'data';
};

export const HomePanels: React.FC<HomePanelsProps> = ({
  isLoggedIn,
  wishlistCount,
  groupCount,
  mock,
}) => {
  const showEmptyWishlist = isLoggedIn && wishlistCount === 0;
  const showEmptyGroups = isLoggedIn && groupCount === 0;
  const shouldLoadPanels = isLoggedIn && (wishlistCount > 0 || groupCount > 0);

  const fetcher = useFetcher<PanelsLoaderData>();

  React.useEffect(() => {
    if (!shouldLoadPanels || fetcher.state !== 'idle' || fetcher.data) return;
    const suffix = mock ? `?mock=${mock}` : '';
    fetcher.load(`/resources/home/panels${suffix}`);
  }, [shouldLoadPanels, fetcher, mock]);

  if (!isLoggedIn) return null;

  return (
    <section
      aria-labelledby="home-panels-heading"
      className="container pb-8 md:pb-12"
    >
      <h2 id="home-panels-heading" className="sr-only">
        Personalized panels
      </h2>

      {/* Single grid so items flow naturally */}
      {(showEmptyWishlist || showEmptyGroups || shouldLoadPanels) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {showEmptyWishlist && (
            <Card padding="lg" role="region" aria-labelledby="empty-wishlist">
              <h3
                id="empty-wishlist"
                className="text-base font-medium md:text-lg"
              >
                {HOME_COPY.panels.emptyWishlistTitle}
              </h3>
              <div className="mt-3">
                <Button asChild size="lg" data-testid="empty-wishlist-cta">
                  <Link to="/wishlist" prefetch="intent">
                    {HOME_COPY.panels.emptyWishlistCta}
                  </Link>
                </Button>
              </div>
            </Card>
          )}

          {showEmptyGroups && (
            <Card padding="lg" role="region" aria-labelledby="empty-groups">
              <h3
                id="empty-groups"
                className="text-base font-medium md:text-lg"
              >
                {HOME_COPY.panels.emptyGroupsTitle}
              </h3>
              <div className="mt-3">
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  data-testid="empty-groups-cta"
                >
                  <Link to="/groups/new" prefetch="intent">
                    {HOME_COPY.panels.emptyGroupsCta}
                  </Link>
                </Button>
              </div>
            </Card>
          )}

          {shouldLoadPanels && (
            <Card
              padding="lg"
              role="region"
              aria-labelledby="upcoming-birthdays"
              data-testid="panel-birthdays"
            >
              <Flex gap={2}>
                <LuCalendar size={20} className="text-blue-500" />
                <h3
                  id="upcoming-birthdays"
                  className="text-base font-medium md:text-2xl"
                >
                  {HOME_COPY.panels.birthdaysHeading}
                </h3>
              </Flex>
              <ul className="mt-3 space-y-2">
                {fetcher.data?.birthdays?.length ? (
                  fetcher.data.birthdays.map((b) => (
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
                        <Button
                          asChild
                          size="sm"
                          variant="secondary"
                          data-testid={`plan-gift-${b.id}`}
                        >
                          <Link to={`/groups/${b.groupId}`} prefetch="intent">
                            {HOME_COPY.panels.planGift}
                          </Link>
                        </Button>
                      ) : null}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">
                    No upcoming birthdays
                  </li>
                )}
              </ul>
            </Card>
          )}

          {shouldLoadPanels && (
            <Card
              padding="lg"
              role="region"
              aria-labelledby="recent-activity"
              data-testid="panel-activity"
            >
              <Flex gap={2}>
                <LuActivity size={20} className="text-green-500" />
                <h3
                  id="recent-activity"
                  className="text-base font-medium md:text-2xl"
                >
                  {HOME_COPY.panels.recentActivityHeading}
                </h3>
              </Flex>
              <ul className="mt-3 space-y-2">
                {fetcher.data?.activity?.length ? (
                  fetcher.data.activity.map((a) => (
                    <li key={a.id} className="text-sm">
                      {a.description}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">
                    Nothing new yet
                  </li>
                )}
              </ul>
            </Card>
          )}
        </div>
      )}
    </section>
  );
};
