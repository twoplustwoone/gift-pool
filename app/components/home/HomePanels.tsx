import { Link, useFetcher } from '@remix-run/react';
import * as React from 'react';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
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
  mock?: 'empty' | 'data';
};

export const HomePanels: React.FC<HomePanelsProps> = ({ isLoggedIn, mock }) => {
  const fetcher = useFetcher<PanelsLoaderData>();

  React.useEffect(() => {
    if (!isLoggedIn || fetcher.state !== 'idle' || fetcher.data) return;
    const suffix = mock ? `?mock=${mock}` : '';
    fetcher.load(`/resources/home/panels${suffix}`);
  }, [isLoggedIn, fetcher, mock]);

  if (!isLoggedIn) return null;

  return (
    <section aria-labelledby="home-panels-heading" className="container pb-8 md:pb-12">
      <h2 id="home-panels-heading" className="sr-only">
        Personalized panels
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          padding="lg"
          role="region"
          aria-labelledby="upcoming-birthdays"
          data-testid="panel-birthdays"
        >
          <h3 id="upcoming-birthdays" className="text-base font-medium md:text-lg">
            {HOME_COPY.panels.birthdaysHeading}
          </h3>
          <ul className="mt-3 space-y-2">
            {fetcher.data?.birthdays?.length ? (
              fetcher.data.birthdays.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.dateLabel}</p>
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
              <li className="text-sm text-muted-foreground">No upcoming birthdays</li>
            )}
          </ul>
        </Card>

        <Card
          padding="lg"
          role="region"
          aria-labelledby="recent-activity"
          data-testid="panel-activity"
        >
          <h3 id="recent-activity" className="text-base font-medium md:text-lg">
            {HOME_COPY.panels.recentActivityHeading}
          </h3>
          <ul className="mt-3 space-y-2">
            {fetcher.data?.activity?.length ? (
              fetcher.data.activity.map((a) => (
                <li key={a.id} className="text-sm">
                  {a.description}
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">Nothing new yet</li>
            )}
          </ul>
        </Card>
      </div>
    </section>
  );
};
