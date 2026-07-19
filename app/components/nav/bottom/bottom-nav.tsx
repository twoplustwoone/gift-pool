import { type LucideIcon, Gift, Heart, Home, User, Users } from 'lucide-react';
import { useOptionalUser } from '#app/utils/user.ts';
import { BottomNavLink } from './bottom-nav-link.tsx';

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
  { to: '/friends', icon: User, label: 'Friends', needsAuth: true },
];

export const BottomNav = () => {
  const user = useOptionalUser();

  return (
    <nav
      className="fixed bottom-0 left-0 w-full border-t border-surface-border bg-surface text-foreground md:hidden"
      data-testid="bottom-nav"
    >
      <ul className="flex h-bottom-nav px-0">
        {links
          .filter((l) => !l.needsAuth || user)
          .map((link) => (
            <li className="flex-1" key={link.to}>
              <BottomNavLink to={link.to} icon={link.icon} label={link.label} />
            </li>
          ))}
      </ul>
    </nav>
  );
};
