import { Heart } from 'lucide-react';
import * as React from 'react';

type HomepageMockupProps = {
  alt: string;
  className?: string;
};

// Decorative product preview for the marketing hero. Real text instead of
// skeleton bars — placeholder bars read as failed-to-load content. The whole
// mockup is one labeled image; the content inside is hidden from AT.
export const HomepageMockup: React.FC<HomepageMockupProps> = ({
  alt,
  className,
}) => {
  return (
    <figure className={className} aria-labelledby="home-mockup-caption">
      <div
        role="img"
        aria-label={alt}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted to-background"
      >
        <div
          aria-hidden="true"
          className="flex h-full w-full select-none flex-col justify-center gap-3 p-4 sm:p-6"
        >
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">
                Dad&rsquo;s 60th Birthday
              </p>
              <span className="rounded-full bg-pool/15 px-2.5 py-0.5 text-xs font-medium text-pool">
                Open
              </span>
            </div>
            {/* Comparison against the gift's price (never a pool "goal"). */}
            <p className="mt-1 text-xs text-muted-foreground">
              $135 committed toward the $180 gift · 5 friends in
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-3/4 rounded-full bg-pool" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Heart className="h-4 w-4 shrink-0 text-primary" />
                <p className="truncate text-sm font-medium">Espresso grinder</p>
              </div>
              <p className="text-sm text-muted-foreground">$89</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Heart className="h-4 w-4 shrink-0 text-primary" />
                <p className="truncate text-sm font-medium">
                  Trail running shoes
                </p>
              </div>
              <p className="text-sm text-muted-foreground">$140</p>
            </div>
            <p className="ml-6 mt-1 text-xs text-muted-foreground">
              Claimed by Sofia
            </p>
          </div>
        </div>
      </div>
      <figcaption id="home-mockup-caption" className="sr-only">
        {alt}
      </figcaption>
    </figure>
  );
};
