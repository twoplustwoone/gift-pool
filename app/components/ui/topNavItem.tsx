import { NavLink } from '@remix-run/react';
import { cn } from '#app/utils/misc.tsx';
import { Icon, type IconName } from './icon';

type TopNavItemProps = {
  to: string;
  icon: IconName;
  label: string;
  className?: string;
  end?: boolean;
};

export function TopNavItem({
  to,
  icon,
  label,
  className,
  end,
}: TopNavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      prefetch="intent"
      className={({ isActive }) =>
        cn(
          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',

          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          className,
        )
      }
    >
      <Icon name={icon} size="md" className="shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}
