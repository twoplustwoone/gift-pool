import * as React from 'react';
import { Card, CardContent } from '#app/components/ui/card.tsx';
import { HOME_COPY, type HomeFeature } from './home-copy';
import { FaBell, FaMoneyBillWave, FaRegHeart, FaUsers } from 'react-icons/fa';

const iconForKey: Record<HomeFeature['key'], React.ReactNode> = {
  'wishlists-simple': <FaRegHeart className="h-5 w-5" aria-hidden />,
  'gift-groups': <FaUsers className="h-5 w-5" aria-hidden />,
  'contribution-limits': <FaMoneyBillWave className="h-5 w-5" aria-hidden />,
  reminders: <FaBell className="h-5 w-5" aria-hidden />,
};

export const HomeFeatures: React.FC = () => {
  return (
    <section aria-labelledby="home-features-heading" className="container pb-8 md:pb-12">
      <h2 id="home-features-heading" className="text-xl font-semibold tracking-tight md:text-2xl">
        How it works
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 md:mt-6 md:grid-cols-2">
        {HOME_COPY.features.map((f) => (
          <Card key={f.key} padding="lg" className="h-full" data-testid={`feature-${f.key}`}>
            <CardContent>
              <div className="flex items-start gap-3">
                <div className="mt-1 text-primary">{iconForKey[f.key]}</div>
                <div>
                  <h3 className="text-base font-medium md:text-lg">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground md:text-base">{f.blurb}</p>
                  <a
                    href="#"
                    className="mt-3 inline-block text-sm text-primary underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Learn more
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};

