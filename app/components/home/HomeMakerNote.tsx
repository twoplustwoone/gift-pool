import * as React from 'react';
import { HOME_COPY } from './home-copy';

// §6.1: a brief first-person note attributed only "A note from the maker" —
// deliberately no name, portrait, title, or founder persona. The About page
// carries the fuller story.
export const HomeMakerNote: React.FC = () => {
  return (
    <section
      aria-label={HOME_COPY.maker.heading}
      className="container pb-12 md:pb-16"
    >
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-base italic text-muted-foreground md:text-lg">
          &ldquo;{HOME_COPY.maker.body}&rdquo;
        </p>
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          — {HOME_COPY.maker.heading}
        </p>
      </div>
    </section>
  );
};
