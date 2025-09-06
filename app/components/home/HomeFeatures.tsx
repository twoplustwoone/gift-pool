import * as React from 'react';
import type { IconType } from 'react-icons';
import { FaBell, FaMoneyBillWave, FaRegHeart, FaUsers } from 'react-icons/fa';
import { Card, CardContent } from '#app/components/ui/card.tsx';
import { HOME_COPY, type HomeFeature } from './home-copy';

const featureStyles: Record<
  HomeFeature['key'],
  { Icon: IconType; bg: string; text: string }
> = {
  'wishlists-simple': {
    Icon: FaRegHeart,
    bg: 'bg-rose-100',
    text: 'text-rose-500',
  },
  'gift-groups': { Icon: FaUsers, bg: 'bg-sky-100', text: 'text-sky-500' },
  'contribution-limits': {
    Icon: FaMoneyBillWave,
    bg: 'bg-green-100',
    text: 'text-green-600',
  },
  reminders: { Icon: FaBell, bg: 'bg-amber-100', text: 'text-amber-500' },
};

export const HomeFeatures: React.FC = () => {
  return (
    <section aria-labelledby="home-features-heading" className="container pb-8 md:pb-12">
      <h2 id="home-features-heading" className="text-xl font-semibold tracking-tight md:text-2xl">
        How it works
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:mt-6 md:grid-cols-2">
        {HOME_COPY.features.map((f) => {
          const { Icon, bg, text } = featureStyles[f.key];
          return (
            <Card key={f.key} padding="lg" className="h-full" data-testid={`feature-${f.key}`}>
              <CardContent>
                <div className="flex items-start gap-3">
                  <div className={`mt-1 flex h-10 w-10 items-center justify-center rounded-md ${bg} ${text}`}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-base font-medium md:text-lg">{f.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground md:text-base">{f.blurb}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
};

