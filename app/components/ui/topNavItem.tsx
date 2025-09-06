import { NavLink } from '@remix-run/react';
import { type ReactNode } from 'react';
import { cn } from '#app/utils/misc.tsx';
import { Text } from '../ui-kit/text.tsx';

type TopNavItemProps = {
  to: string;
  icon: ReactNode;
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
  return (
    <NavLink
      to={to}
      end={end}
      prefetch="intent"
      className={({ isActive }) =>
        cn(
          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',

          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          className,
        )
      }
    >
      {icon}
      <Text weight="bold">{label}</Text>
    </NavLink>
  );
};
