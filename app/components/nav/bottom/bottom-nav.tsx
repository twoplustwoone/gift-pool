import { type ReactNode } from 'react';
import { LuHeart, LuUsers, LuHouse } from 'react-icons/lu';
import { useOptionalUser } from '#app/utils/user.ts';
import { BottomNavLink } from './bottom-nav-link.tsx';

const links: {
  to: string;
  icon: ReactNode;
  label: string;
  needsAuth: boolean;
}[] = [
  { to: '/', icon: <LuHouse />, label: 'Home', needsAuth: false },
  { to: '/wishlist', icon: <LuHeart />, label: 'Wishlist', needsAuth: true },
  { to: '/groups', icon: <LuUsers />, label: 'Groups', needsAuth: true },
];

export const BottomNav = () => {
  const user = useOptionalUser();

  return (
    <nav className="fixed bottom-0 left-0 w-full border-t border-surface-border bg-surface text-foreground sm:hidden">
      <ul className="h-bottom-nav flex divide-x divide-border">
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
