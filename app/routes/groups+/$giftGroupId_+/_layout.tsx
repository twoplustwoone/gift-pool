import { LuSettings, LuUsers } from 'react-icons/lu';
import {
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
} from 'react-router';
import { GroupAvatarCluster } from '#app/components/groups/group-avatar-cluster.tsx';
import { GroupInviteButton } from '#app/components/groups/group-invite-button.tsx';
import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import {
  ContextNotificationAwarenessNotice,
  ContextNotificationControl,
} from '#app/components/notifications/context-notification-controls.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { Stack } from '#app/components/ui-kit/stack.tsx';
import { type GroupRole } from '#app/utils/group-role.ts';
import { cn } from '#app/utils/misc.tsx';
import { type loader as routeLoader } from './__route.server';

// Re-export so children can share the same data/actions
export { loader, action } from './__route.server';

const GroupLayout = () => {
  const {
    giftGroup,
    viewer,
    canInvite,
    inviteLink,
    notificationAwareness,
    notificationTopics,
  } = useLoaderData<typeof routeLoader>();
  const location = useLocation();
  // Settings is a distinct sub-page, not a tab: it gets its own header with a
  // back affordance to the group, and never shows the Overview/Members tab bar.
  const isSettings = location.pathname === `/groups/${giftGroup.id}/settings`;
  // Members is a tab under this same header. Its back should climb to the parent
  // group, not skip past it to the groups index (which is correct for Overview).
  const isMembers = location.pathname === `/groups/${giftGroup.id}/members`;

  return (
    // min-w-0: this is a grid item in the app shell; without it the default
    // `min-width: auto` keeps the whole group view from shrinking below its
    // content's intrinsic width, overflowing the track (sideways scroll on
    // mobile). Applies to every group tab since they all render inside here.
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      data-testid="group-shell"
    >
      {isSettings ? (
        <PageHeader
          variant="detail"
          back={{ label: giftGroup.name, href: `/groups/${giftGroup.id}` }}
          icon={<LuSettings size={24} className="text-primary" />}
          title="Group settings"
          subtitle={giftGroup.name}
        />
      ) : (
        <PageHeader
          variant="detail"
          back={
            isMembers
              ? { label: giftGroup.name, href: `/groups/${giftGroup.id}` }
              : { label: 'Groups', href: '/groups' }
          }
          icon={<LuUsers size={24} className="text-primary" />}
          title={giftGroup.name}
          subtitle={`${giftGroup.groupMembers.length} ${giftGroup.groupMembers.length === 1 ? 'member' : 'members'}`}
        >
          <div className="flex shrink-0 items-center gap-2">
            <GroupAvatarCluster
              members={giftGroup.groupMembers}
              viewerId={viewer.userId}
            />
            <RoleBadge role={viewer.role as GroupRole} />
            <ContextNotificationControl
              context={{ kind: 'GROUP', groupId: giftGroup.id }}
              contextLabel={giftGroup.name}
              awareness={notificationAwareness}
              availableTopics={notificationTopics}
            />
            {/* Invite — mobile only (desktop keeps it in the Group info rail
                card). Rendered only for users who can invite; permission is also
                enforced server-side in the create-invite-link action. */}
            {canInvite ? (
              <div className="lg:hidden">
                <GroupInviteButton
                  giftGroupId={giftGroup.id}
                  inviteLink={inviteLink}
                />
              </div>
            ) : null}
            {/* Settings is reachable by every member — it's where your own
                group preferences live, not just admin controls (P7.5). */}
            <Link
              to={`/groups/${giftGroup.id}/settings`}
              aria-label="Group settings"
              className="text-muted-foreground hover:text-foreground"
            >
              <LuSettings className="h-5 w-5" />
            </Link>
          </div>
        </PageHeader>
      )}
      <div className="w-full min-w-0">
        <div className="mx-auto max-w-6xl p-3 sm:p-6">
          <Stack gap={6}>
            {!isSettings ? (
              <ContextNotificationAwarenessNotice
                context={{ kind: 'GROUP', groupId: giftGroup.id }}
                contextLabel={giftGroup.name}
                awareness={notificationAwareness}
              />
            ) : null}
            {/* Tabs are retained on mobile/tablet; desktop collapses them
                into the single dashboard rendered by the index route. The
                settings sub-page never shows them. */}
            {!isSettings ? (
              <div className="lg:hidden">
                <TabBar giftGroupId={giftGroup.id} />
              </div>
            ) : null}
            <Outlet />
          </Stack>
        </div>
      </div>
    </div>
  );
};

export default GroupLayout;

const TabBar = ({ giftGroupId }: { giftGroupId: string }) => {
  // Settings is intentionally NOT a tab — it's reached from the header gear.
  const tabs = [
    { to: `/groups/${giftGroupId}`, label: 'Overview', end: true },
    { to: `/groups/${giftGroupId}/members`, label: 'Members' },
  ] as const;

  return (
    <div className="grid w-full grid-cols-2 rounded-full bg-muted p-1">
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
