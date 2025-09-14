import { NavLink } from '@remix-run/react';
import { type ReactNode } from 'react';
import { cn } from '#app/utils/misc.tsx';

const activeClassName =
  'bg-brand-gradient text-primary-foreground shadow-md';
const inactiveClassName =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground';

export const BottomNavLink = ({
  to,
  icon,
  label,
}: {
  to: string;
  icon: ReactNode;
  label: string;
}) => {
  return (
    <NavLink
      to={to}
      prefetch="intent"
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'inline-flex h-full w-full items-center justify-center rounded-full p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isActive ? activeClassName : inactiveClassName,
        )
      }
    >
      {icon}
    </NavLink>
  );
};
