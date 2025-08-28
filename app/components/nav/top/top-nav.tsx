import { Link } from '@remix-run/react';
import { type ReactNode } from 'react';
import { FaRegHeart, FaUsers } from 'react-icons/fa';
import { Logo } from '#app/components/logo';
import { Button } from '#app/components/ui/button';
import { TopNavItem } from '#app/components/ui/topNavItem';
import { UserDropdown } from '#app/components/user-dropdown';
import { useOptionalUser } from '#app/utils/user';

const links: {
  to: string;
  icon: ReactNode;
  label: string;
  needsAuth: boolean;
}[] = [
  { to: '/wishlist', icon: <FaRegHeart />, label: 'Wishlist', needsAuth: true },
  { to: '/groups', icon: <FaUsers />, label: 'Groups', needsAuth: true },
];

export const TopNav = () => {
  const user = useOptionalUser();

  return (
    <nav className="flex items-center justify-between gap-3 md:gap-6">
      <Logo />
      {/* desktop-only primary nav; mobile relies on BottomNav */}
      <div className="hidden items-center gap-3 sm:flex md:gap-4">
        {links
          .filter((l) => !l.needsAuth || user)
          .map((l) => (
            <TopNavItem key={l.to} to={l.to} icon={l.icon} label={l.label} />
          ))}
      </div>

      <div className="flex items-center">
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
