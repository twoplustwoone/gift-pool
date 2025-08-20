import { NavLink } from '@remix-run/react';
import { cn } from '#app/utils/misc.tsx';
import { Icon, type IconName } from '../../ui/icon.tsx';

const activeClassName =
  'shadow-inner ring-2 ring-inset ring-accent text-foreground bg-accent/50';
const inactiveClassName =
  'text-muted-foreground hover:bg-muted hover:text-foreground';

export const BottomNavLink = ({ to, icon }: { to: string; icon: IconName }) => {
  return (
    <NavLink
      to={to}
      prefetch="intent"
      className={({ isActive }) =>
        cn(
          'flex h-full w-full items-center justify-center hover:bg-accent hover:text-foreground',
          isActive ? activeClassName : inactiveClassName,
        )
      }
    >
      <Icon name={icon} size="md" className="shrink-0" />
    </NavLink>
  );
};
