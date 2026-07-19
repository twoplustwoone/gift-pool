import * as React from 'react';
import { LuGift, LuHeart } from 'react-icons/lu';
import { Link } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { Flex, Text } from '../ui-kit';
import { HOME_COPY } from './home-copy';
import { HomepageMockup } from './HomepageMockup';

type HomeHeroProps = {
  onPrimaryClick?: () => void;
  onSecondaryClick?: () => void;
};

export const HomeHero: React.FC<HomeHeroProps> = ({
  onPrimaryClick,
  onSecondaryClick,
}) => {
  return (
    <section
      aria-labelledby="home-hero-heading"
      className="container pb-8 pt-2 md:pb-12"
    >
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <div>
          <h1
            id="home-hero-heading"
            className="font-display text-3xl font-bold tracking-tight md:text-5xl"
          >
            {HOME_COPY.hero.headline}
          </h1>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            {HOME_COPY.hero.subhead}
          </p>

          {/* Organizer-first (§6.1): starting a pool is the primary job the
              page exists for; the wishlist is the secondary on-ramp. Both
              targets are auth-gated, so the redirectTo chain carries the
              intent through signup/login. */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              onClick={onPrimaryClick}
              data-testid="home-cta-pool"
            >
              <Link to="/pools/new" prefetch="intent">
                <Flex gap={2}>
                  <LuGift size={16} />
                  <Text weight="bold">{HOME_COPY.hero.primaryCta}</Text>
                </Flex>
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              onClick={onSecondaryClick}
              data-testid="home-cta-wishlist"
            >
              <Link to="/wishlist" prefetch="intent">
                <Flex gap={2}>
                  <LuHeart size={16} />
                  <Text weight="bold">{HOME_COPY.hero.secondaryCta}</Text>
                </Flex>
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
