import * as React from 'react';
import { HOME_COPY } from './home-copy';

export const HomeSocialProof: React.FC = () => {
  return (
    <section aria-labelledby="home-social-proof" className="bg-muted/30">
      <div className="container py-6 md:py-8">
        <p
          id="home-social-proof"
          className="text-center text-sm text-muted-foreground md:text-base"
        >
          {HOME_COPY.social.strip}
        </p>
        {/* Placeholder testimonials block: visually hidden by default, keep easy to enable */}
        <div className="sr-only" aria-hidden>
          <h3 className="text-center text-base font-medium md:text-lg">
            {HOME_COPY.social.testimonialsHeading}
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3"></div>
        </div>
      </div>
    </section>
  );
};
