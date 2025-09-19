import { Link } from '@remix-run/react';
import { type ReactNode } from 'react';
import { LuUsers, LuHeart, LuHouse, LuUserCheck } from 'react-icons/lu';
import { Logo } from '#app/components/logo';
import { NotificationBell } from '#app/components/notifications/notification-bell.tsx';
import { Button } from '#app/components/ui/button';
import { TopNavItem } from '#app/components/ui/topNavItem';
import { UserDropdown } from '#app/components/user-dropdown';
import { ThemeSwitch } from '#app/routes/resources+/theme-switch';
import { useRequestInfo } from '#app/utils/request-info';
import { useOptionalUser } from '#app/utils/user';

const links: {
  to: string;
  icon: ReactNode;
  label: string;
  needsAuth: boolean;
}[] = [
  { to: '/', icon: <LuHouse />, label: 'Home', needsAuth: false },
  { to: '/wishlist', icon: <LuHeart />, label: 'Wishlist', needsAuth: true },
  { to: '/groups', icon: <LuUsers />, label: 'Groups', needsAuth: true },
  { to: '/friends', icon: <LuUserCheck />, label: 'Friends', needsAuth: true },
];

export const TopNav = () => {
  const user = useOptionalUser();
  const requestInfo = useRequestInfo();

  return (
    <nav className="container flex h-full items-center justify-between gap-3 md:gap-6">
      <Logo />
      {/* desktop-only primary nav; mobile relies on BottomNav */}
      <div className="hidden items-center gap-3 sm:flex md:gap-4">
        {links
          .filter((l) => !l.needsAuth || user)
          .map((l) => (
            <TopNavItem key={l.to} to={l.to} icon={l.icon} label={l.label} />
          ))}
      </div>

      <div className="flex items-center gap-2">
        {user ? <NotificationBell /> : null}
        <ThemeSwitch userPreference={requestInfo.userPrefs.theme} />
        {user ? (
          <UserDropdown />
        ) : (
          <Button asChild size="lg">
            <Link to="/login">Log In</Link>
          </Button>
        )}
      </div>
    </nav>
  );
};
