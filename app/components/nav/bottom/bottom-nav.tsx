import { type ReactNode } from 'react';
import { FaRegHeart, FaUsers } from 'react-icons/fa';
import { BottomNavLink } from './bottom-nav-link.tsx';

const links: {
  to: string;
  icon: ReactNode;
  needsAuth: boolean;
}[] = [
  { to: '/wishlist', icon: <FaRegHeart />, needsAuth: true },
  { to: '/groups', icon: <FaUsers />, needsAuth: true },
];

export const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 w-full border-t border-surface-border bg-surface text-foreground sm:hidden">
      <ul className="h-bottom-nav flex divide-x divide-border">
        {links.map((link) => (
          <li className="flex-1" key={link.to}>
            <BottomNavLink to={link.to} icon={link.icon} />
          </li>
        ))}
      </ul>
    </nav>
  );
};
