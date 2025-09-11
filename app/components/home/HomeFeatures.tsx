import * as React from 'react';
import { LuBell, LuDollarSign, LuHeart, LuUsers } from 'react-icons/lu';
import { Card, CardContent } from '#app/components/ui/card.tsx';
import { cn } from '#app/utils/misc.tsx';
import { HOME_COPY, type HomeFeature } from './home-copy';

const meta: Record<
  HomeFeature['key'],
  { icon: React.ReactNode; color: string }
> = {
  'wishlists-simple': {
    icon: <LuHeart className="h-5 w-5" aria-hidden />,
    color: 'text-primary',
  },
  'gift-groups': {
    icon: <LuUsers className="h-5 w-5" aria-hidden />,
    color: 'text-blue-500',
  },
  'contribution-limits': {
    icon: <LuDollarSign className="h-5 w-5" aria-hidden />,
    color: 'text-green-500',
  },
  reminders: {
    icon: <LuBell className="h-5 w-5" aria-hidden />,
    color: 'text-yellow-500',
  },
};

export const HomeFeatures: React.FC = () => {
  return (
    <section
      aria-labelledby="home-features-heading"
      className="container pb-8 md:pb-12"
    >
      <h2
        id="home-features-heading"
        className="text-xl font-semibold tracking-tight md:text-2xl"
      >
        How it works
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:mt-6 md:grid-cols-4">
        {HOME_COPY.features.map((f) => (
          <Card
            key={f.key}
            padding="lg"
            className="h-full"
            data-testid={`feature-${f.key}`}
          >
            <CardContent>
              <div className="flex flex-col items-center gap-3">
                <div
                  className={cn(
                    'mt-1 flex h-12 w-12 items-center justify-center rounded-full bg-accent',
                    meta[f.key].color,
                  )}
                >
                  {meta[f.key].icon}
                </div>
                <div>
                  <h3 className="text-center text-base font-bold md:text-lg">
                    {f.title}
                  </h3>
                  <p className="mt-1 text-center text-sm text-muted-foreground md:text-base">
                    {f.blurb}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
