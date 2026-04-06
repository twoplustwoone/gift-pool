import * as React from 'react';

type HomepageMockupProps = {
  alt: string;
  className?: string;
};

// Lightweight, responsive placeholder illustration with accessible alt text
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
        <svg
          viewBox="0 0 400 300"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(var(--muted))" />
              <stop offset="100%" stopColor="hsl(var(--background))" />
            </linearGradient>
          </defs>
          <rect width="400" height="300" fill="url(#g1)" />

          {/* Pool card 1 — Open */}
          <rect x="24" y="24" width="352" height="70" rx="10" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
          {/* Title text line */}
          <rect x="44" y="40" width="140" height="10" rx="5" fill="hsl(var(--foreground))" opacity="0.75" />
          {/* Sub text line */}
          <rect x="44" y="57" width="90" height="7" rx="3.5" fill="hsl(var(--muted-foreground))" opacity="0.5" />
          {/* Contributor count */}
          <rect x="44" y="74" width="60" height="6" rx="3" fill="hsl(var(--muted-foreground))" opacity="0.35" />
          {/* "Open" status badge */}
          <rect x="292" y="36" width="60" height="20" rx="10" fill="#d1fae5" />
          <rect x="304" y="42" width="36" height="8" rx="4" fill="#065f46" opacity="0.7" />

          {/* Pool card 2 — Decided */}
          <rect x="24" y="110" width="352" height="70" rx="10" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
          <rect x="44" y="126" width="120" height="10" rx="5" fill="hsl(var(--foreground))" opacity="0.75" />
          <rect x="44" y="143" width="80" height="7" rx="3.5" fill="hsl(var(--muted-foreground))" opacity="0.5" />
          <rect x="44" y="160" width="60" height="6" rx="3" fill="hsl(var(--muted-foreground))" opacity="0.35" />
          {/* "Decided" status badge */}
          <rect x="284" y="122" width="68" height="20" rx="10" fill="#dbeafe" />
          <rect x="296" y="128" width="44" height="8" rx="4" fill="#1e40af" opacity="0.7" />

          {/* Pool card 3 — Voting */}
          <rect x="24" y="196" width="352" height="70" rx="10" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
          <rect x="44" y="212" width="160" height="10" rx="5" fill="hsl(var(--foreground))" opacity="0.75" />
          <rect x="44" y="229" width="100" height="7" rx="3.5" fill="hsl(var(--muted-foreground))" opacity="0.5" />
          <rect x="44" y="246" width="60" height="6" rx="3" fill="hsl(var(--muted-foreground))" opacity="0.35" />
          {/* "Voting" status badge */}
          <rect x="288" y="208" width="64" height="20" rx="10" fill="#ede9fe" />
          <rect x="300" y="214" width="40" height="8" rx="4" fill="#5b21b6" opacity="0.7" />
        </svg>
      </div>
      <figcaption id="home-mockup-caption" className="sr-only">
        {alt}
      </figcaption>
    </figure>
  );
};
