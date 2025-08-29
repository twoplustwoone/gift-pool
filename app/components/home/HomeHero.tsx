import { Link } from '@remix-run/react';
import * as React from 'react';
import { Button } from '#app/components/ui/button.tsx';
import { HomepageMockup } from './HomepageMockup';
import { HOME_COPY } from './home-copy';

type HomeHeroProps = {
  onPrimaryClick?: () => void;
  onSecondaryClick?: () => void;
};

export const HomeHero: React.FC<HomeHeroProps> = ({
  onPrimaryClick,
  onSecondaryClick,
}) => {
  return (
    <section aria-labelledby="home-hero-heading" className="container pt-2 pb-8 md:pb-12">
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <div>
          <h1 id="home-hero-heading" className="text-3xl font-bold tracking-tight md:text-5xl">
            {HOME_COPY.hero.headline}
          </h1>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            {HOME_COPY.hero.subhead}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" onClick={onPrimaryClick} data-testid="home-cta-wishlist">
              <Link to="/wishlist" prefetch="intent">
                {HOME_COPY.hero.primaryCta}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              onClick={onSecondaryClick}
              data-testid="home-cta-group"
            >
              <Link to="/groups/new" prefetch="intent">
                {HOME_COPY.hero.secondaryCta}
              </Link>
            </Button>
          </div>
        </div>

        <div className="hidden md:block">
          <HomepageMockup alt={HOME_COPY.hero.visualAlt} />
        </div>
      </div>
    </section>
  );
};

