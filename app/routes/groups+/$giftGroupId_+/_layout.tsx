import { Link, NavLink, Outlet, useLoaderData } from '@remix-run/react';
import { FaUsers } from 'react-icons/fa';
import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { cn } from '#app/utils/misc.tsx';
import {
  type loader as routeLoader,
  type action as routeAction,
} from './__route.server';
import { type GroupRole } from '#app/utils/group-role.ts';

// Re-export so children can share the same data/actions
export { loader, action } from './__route.server';

const GroupLayout = () => {
  const { giftGroup, viewer } = useLoaderData<typeof routeLoader>();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="w-full border-b bg-background/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="px-2">
                <Link to="/groups">
                  <Icon name="arrow-left" className="mr-1" /> Back to Groups
                </Link>
              </Button>
              <div className="flex items-center gap-3">
                <FaUsers size={24} className="fill-primary" />
                <div className="leading-tight">
                  <div className="text-md font-extrabold sm:text-xl">
                    {giftGroup.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {giftGroup.groupMembers.length} members
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={viewer.role as GroupRole} />
            </div>
          </div>
          <div className="mt-4">
            <TabBar giftGroupId={giftGroup.id} />
          </div>
        </div>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-3 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default GroupLayout;

const TabBar = ({ giftGroupId }: { giftGroupId: string }) => {
  const tabs = [
    { to: `/groups/${giftGroupId}`, label: 'Overview', end: true },
    { to: `/groups/${giftGroupId}/members`, label: 'Members' },
    { to: `/groups/${giftGroupId}/settings`, label: 'Settings' },
    { to: `/groups/${giftGroupId}/activity`, label: 'Activity' },
  ] as const;

  return (
    <div className="grid w-full grid-cols-4 rounded-full bg-muted p-1">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={('end' in t ? (t as any).end : undefined) as boolean | undefined}
          className={({ isActive }) =>
            cn(
              'px-4 py-1.5 text-center text-sm font-medium text-muted-foreground',
              'rounded-full transition-colors',
              isActive && 'bg-background text-foreground shadow',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
};
