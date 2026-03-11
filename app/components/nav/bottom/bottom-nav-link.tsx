import { type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '#app/utils/misc.tsx';

const activeClassName = 'text-primary';
const inactiveClassName = 'text-muted-foreground';
const baseClassName =
  'flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const BottomNavLink = ({
  to,
  icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) => {
  return (
    <NavLink
      to={to}
      prefetch="intent"
      aria-label={label}
      className={({ isActive }) =>
        cn(baseClassName, isActive ? activeClassName : inactiveClassName)
      }
    >
      {({ isActive }) => {
        const Icon = icon;
        return (
          <>
            <Icon
              aria-hidden
              className="h-[22px] w-[22px]"
              strokeWidth={isActive ? 2.4 : 2}
            />
            <span>{label}</span>
          </>
        );
      }}
    </NavLink>
  );
};
