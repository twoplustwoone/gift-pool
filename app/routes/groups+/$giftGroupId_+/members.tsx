import { useMemo } from 'react';
import {
  type LoaderFunctionArgs,
  useFetchers,
  useRouteLoaderData,
} from 'react-router';

import { MembersList } from '#app/components/groups/members-list.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { type loader as routeLoader } from './__route.server';
import { applyPendingSettingsMemberMutations } from './__route.shared';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const { requireUserIdInGroup } = await import('#app/utils/groups.server.ts');
  // Membership gate — the roster itself comes from the layout loader.
  await requireUserIdInGroup(request, groupId);
  return null;
}

type GroupMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

const GroupMembersRoute = () => {
  const { giftGroup, viewer } = useRouteLoaderData<typeof routeLoader>(
    'routes/groups+/$giftGroupId_+/_layout',
  )!;
  const fetchers = useFetchers();
  const settingsAction = `/groups/${giftGroup.id}/settings`;
  const optimisticMembers = useMemo(
    () =>
      applyPendingSettingsMemberMutations({
        fetchers,
        members: giftGroup.groupMembers,
        settingsAction,
        getUserId: (member) => member.user.id,
        getRole: (member) => member.role as GroupMemberRole,
        setRole: (member, role) => ({ ...member, role }),
      }),
    [fetchers, giftGroup.groupMembers, settingsAction],
  );
  const optimisticViewerRole =
    optimisticMembers.find((member) => member.user.id === viewer.userId)
      ?.role ?? viewer.role;
  const totalMembers = optimisticMembers.length;

  return (
    <Card padding="lg">
      <div className="mb-1 text-lg font-semibold">
        Group Members ({totalMembers})
      </div>
      <div className="mb-4 text-sm text-muted-foreground">
        Tap a member to view their profile
      </div>
      <div className="rounded-xl border bg-subcard p-1">
        <MembersList
          giftGroupId={giftGroup.id}
          viewerRole={optimisticViewerRole as GroupMemberRole}
          viewerId={viewer.userId}
          members={optimisticMembers}
        />
      </div>
    </Card>
  );
};

export default GroupMembersRoute;
