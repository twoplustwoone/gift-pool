import { type LucideIcon, Gift, Heart, Home, UserCheck, Users } from 'lucide-react';
import { Link } from 'react-router';
import { FeedbackWidget } from '#app/components/feedback/feedback-widget.tsx';
import { Logo } from '#app/components/logo';
import { NotificationBell } from '#app/components/notifications/notification-bell.tsx';
import { Button } from '#app/components/ui/button';
import { TopNavItem } from '#app/components/ui/topNavItem';
import { UserDropdown } from '#app/components/user-dropdown';
import { ThemeSwitch } from '#app/routes/resources+/theme-switch';
import { track } from '#app/utils/analytics.client.ts';
import { useRequestInfo } from '#app/utils/request-info';
import { useOptionalUser } from '#app/utils/user';

const links: {
  to: string;
  icon: LucideIcon;
  label: string;
  needsAuth: boolean;
}[] = [
  { to: '/', icon: Home, label: 'Home', needsAuth: false },
  { to: '/wishlist', icon: Heart, label: 'Wishlist', needsAuth: true },
  { to: '/groups', icon: Users, label: 'Groups', needsAuth: true },
  { to: '/pools', icon: Gift, label: 'Pools', needsAuth: true },
  { to: '/friends', icon: UserCheck, label: 'Friends', needsAuth: true },
];

export const TopNav = () => {
  const user = useOptionalUser();
  const requestInfo = useRequestInfo();

  return (
    <nav aria-label="Primary navigation" className="container max-w-6xl px-4">
      <div className="grid grid-cols-[auto,1fr,auto] items-center gap-3 md:gap-6">
        <div className="flex shrink-0 items-center gap-3">
          <Logo />
        </div>
        {/* desktop-only primary nav; mobile relies on BottomNav */}
        <div className="hidden items-center justify-center md:flex">
          <ul className="flex items-center gap-3 whitespace-nowrap" role="list">
            {links
              .filter((l) => !l.needsAuth || user)
              .map((l) => (
                <li key={l.to}>
                  <TopNavItem to={l.to} icon={l.icon} label={l.label} />
                </li>
              ))}
          </ul>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
          {user ? <NotificationBell /> : null}
          {/* Logged-in only: for logged-out visitors the cluster also holds the
              full-size Log In + Sign up CTAs, and a third control overflows the
              fixed header on narrow phones. Anonymous feedback still lives on
              /support. */}
          {user ? <FeedbackWidget /> : null}
          <ThemeSwitch userPreference={requestInfo.userPrefs.theme} />
          {user ? (
            <UserDropdown />
          ) : (
            <>
              <Button asChild size="lg" variant="ghost">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="lg">
                <Link
                  to="/signup"
                  onClick={() =>
                    track('home_cta_clicked', { cta: 'nav_signup' })
                  }
                >
                  Sign up
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
