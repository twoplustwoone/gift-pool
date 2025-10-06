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
          <rect
            x="28"
            y="28"
            width="344"
            height="48"
            rx="8"
            fill="hsl(var(--card))"
            stroke="hsl(var(--border))"
          />
          <rect
            x="28"
            y="92"
            width="168"
            height="160"
            rx="10"
            fill="hsl(var(--card))"
            stroke="hsl(var(--border))"
          />
          <rect
            x="204"
            y="92"
            width="168"
            height="160"
            rx="10"
            fill="hsl(var(--card))"
            stroke="hsl(var(--border))"
          />
          <circle cx="60" cy="52" r="10" fill="hsl(var(--muted-foreground))" />
          <rect
            x="84"
            y="44"
            width="200"
            height="16"
            rx="8"
            fill="hsl(var(--muted-foreground))"
            opacity="0.6"
          />
        </svg>
      </div>
      <figcaption id="home-mockup-caption" className="sr-only">
        {alt}
      </figcaption>
    </figure>
  );
};
