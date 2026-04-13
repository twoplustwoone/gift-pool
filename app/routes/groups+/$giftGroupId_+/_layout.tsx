import { LuUsers } from 'react-icons/lu';
import { NavLink, Outlet, useLoaderData } from 'react-router';
import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { Stack } from '#app/components/ui-kit/stack.tsx';
import { type GroupRole } from '#app/utils/group-role.ts';
import { cn } from '#app/utils/misc.tsx';
import { type loader as routeLoader } from './__route.server';

// Re-export so children can share the same data/actions
export { loader, action } from './__route.server';

const GroupLayout = () => {
  const { giftGroup, viewer, canSettings } =
    useLoaderData<typeof routeLoader>();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        variant="detail"
        back={{ label: 'Groups', href: '/groups' }}
        icon={<LuUsers size={24} className="text-primary" />}
        title={giftGroup.name}
        subtitle={`${giftGroup.groupMembers.length} ${giftGroup.groupMembers.length === 1 ? 'member' : 'members'}`}
      >
        <RoleBadge role={viewer.role as GroupRole} />
      </PageHeader>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-3 sm:p-6">
          <Stack gap={6}>
            <TabBar giftGroupId={giftGroup.id} canSettings={canSettings} />
            <Outlet />
          </Stack>
        </div>
      </main>
    </div>
  );
};

export default GroupLayout;

const TabBar = ({
  giftGroupId,
  canSettings,
}: {
  giftGroupId: string;
  canSettings: boolean;
}) => {
  const tabs = [
    { to: `/groups/${giftGroupId}`, label: 'Overview', end: true },
    { to: `/groups/${giftGroupId}/members`, label: 'Members' },
    ...(canSettings
      ? ([
          { to: `/groups/${giftGroupId}/settings`, label: 'Settings' },
        ] as const)
      : ([] as const)),
    { to: `/groups/${giftGroupId}/activity`, label: 'Activity' },
  ] as const;

  const colsClass = canSettings ? 'grid-cols-4' : 'grid-cols-3';

  return (
    <div className={`grid w-full ${colsClass} rounded-full bg-muted p-1`}>
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
