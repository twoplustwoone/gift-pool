import { type LucideIcon } from 'lucide-react';
import { NavLink, useLocation, useNavigation } from 'react-router';
import { cn } from '#app/utils/misc.tsx';

const activeClassName = 'text-primary';
const inactiveClassName = 'text-muted-foreground';
const baseClassName =
  'flex h-full w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function BottomNavLinkContent({
  icon: Icon,
  label,
  isActive,
  isPending,
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  isPending: boolean;
}) {
  return (
    <>
      <Icon
        aria-hidden
        className={cn('h-5 w-5', isPending && 'animate-pulse')}
        strokeWidth={isActive ? 2.4 : 2}
      />
      <span>{label}</span>
    </>
  );
}

// Determine whether `to` matches `pathname` the way NavLink's isActive would:
// exact match for "/" and prefix match (with a "/" boundary) for everything else.
const matchesPath = (to: string, pathname: string) => {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
};

export const BottomNavLink = ({
  to,
  icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) => {
  const navigation = useNavigation();
  const location = useLocation();

  // Only treat a nav as "in flight" if it's targeting a different route.
  // Form submissions / same-route revalidations should not re-skin the tabs.
  const pendingToDifferentRoute =
    navigation.state === 'loading' &&
    navigation.location != null &&
    navigation.location.pathname !== location.pathname;

  const isPendingTarget =
    pendingToDifferentRoute &&
    matchesPath(to, navigation.location!.pathname);

  return (
    <NavLink
      to={to}
      prefetch="intent"
      aria-label={label}
      className={({ isActive }) => {
        // Optimistic active state: during a route change, the target tab
        // immediately becomes active and the previously-active tab becomes
        // inactive. This fixes the "clicked Wishlist but Friends still looks
        // selected" illusion while the loader is running.
        const effectiveActive = pendingToDifferentRoute
          ? isPendingTarget
          : isActive;
        return cn(
          baseClassName,
          effectiveActive ? activeClassName : inactiveClassName,
        );
      }}
    >
      {({ isActive }) => {
        const effectiveActive = pendingToDifferentRoute
          ? isPendingTarget
          : isActive;
        return (
          <BottomNavLinkContent
            icon={icon}
            label={label}
            isActive={effectiveActive}
            isPending={isPendingTarget}
          />
        );
      }}
    </NavLink>
  );
};
