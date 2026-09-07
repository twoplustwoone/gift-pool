import { NavLink } from 'react-router';
import { cn } from '#app/utils/misc.tsx';

// The Gifting tab holds two sibling surfaces. This is the segmented control at
// the top of both index pages: two pills, real links (so back/forward and
// prefetch work), `aria-current` on the active one.
export type GiftingSegment = 'pools' | 'exchanges';

const SEGMENTS: Array<{ key: GiftingSegment; to: string; label: string }> = [
  { key: 'pools', to: '/pools', label: 'Pools' },
  { key: 'exchanges', to: '/exchanges', label: 'Exchanges' },
];

export function GiftingSegments({
  active,
  className,
}: Readonly<{ active: GiftingSegment; className?: string }>) {
  return (
    <nav
      aria-label="Gifting"
      className={cn(
        'inline-flex rounded-full border border-border bg-muted p-1',
        className,
      )}
    >
      {SEGMENTS.map((segment) => {
        const isActive = segment.key === active;
        return (
          <NavLink
            key={segment.key}
            to={segment.to}
            prefetch="intent"
            end
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 min-w-[6.5rem] items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {segment.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
