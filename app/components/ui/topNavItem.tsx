import { NavLink } from '@remix-run/react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '#app/utils/misc.tsx';
import { Text } from '../ui-kit/text.tsx';

type TopNavItemProps = {
  to: string;
  icon: LucideIcon;
  label: string;
  className?: string;
  end?: boolean;
};

export const TopNavItem = ({
  to,
  icon,
  label,
  className,
  end,
}: TopNavItemProps) => {
  const Icon = icon;

  return (
    <NavLink
      to={to}
      end={end}
      prefetch="intent"
      className={({ isActive }) =>
        cn(
          'group relative inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground',
          className,
        )
      }
    >
      {({ isActive }) => (
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
              'pointer-events-none absolute inset-x-2 bottom-[5px] h-0.5 rounded-full bg-primary transition-opacity duration-200 ease-out',
              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
            )}
          />
        </>
      )}
    </NavLink>
  );
};
