import { type LucideIcon } from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '#app/utils/misc.tsx';
import { Text } from '../ui-kit/text.tsx';

type TopNavItemProps = {
  to: string;
  icon: LucideIcon;
  label: string;
  className?: string;
  end?: boolean;
  // Extra path prefixes that keep this item active.
  alsoMatches?: string[];
};

export const TopNavItem = ({
  to,
  icon,
  label,
  className,
  end,
  alsoMatches = [],
}: TopNavItemProps) => {
  const Icon = icon;
  const { pathname } = useLocation();
  const alsoActive = alsoMatches.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  return (
    <NavLink
      to={to}
      end={end}
      prefetch="intent"
      className={({ isActive: navActive }) => {
        const isActive = navActive || alsoActive;
        return cn(
          'group relative inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold leading-none tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          isActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          className,
        );
      }}
    >
      {({ isActive: navActive }) => {
        const isActive = navActive || alsoActive;
        return (
          <>
            <Icon
              className={cn(
                'h-4 w-4 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-hidden
              strokeWidth={1.75}
            />
            <Text size="sm" weight="semibold" className="tracking-tight">
              {label}
            </Text>
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-2 bottom-1 h-[3px] rounded-full bg-primary transition-opacity transition-transform duration-200 ease-out',
                isActive
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-60',
              )}
            />
          </>
        );
      }}
    </NavLink>
  );
};
