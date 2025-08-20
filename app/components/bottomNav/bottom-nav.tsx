import { type IconName } from '../ui/icon.tsx';
import { BottomNavLink } from './bottom-nav-link.tsx';

const links: { to: string; icon: IconName }[] = [
  { to: '/wishlist', icon: 'star' },
  { to: '/groups', icon: 'person' },
];

export const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 w-full border-t border-surface-border bg-surface text-foreground sm:hidden">
      <ul className="flex h-16 divide-x divide-border">
        {links.map((link) => (
          <li className="flex-1" key={link.to}>
            <BottomNavLink to={link.to} icon={link.icon} />
          </li>
        ))}
      </ul>
    </nav>
  );
};
