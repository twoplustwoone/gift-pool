import { useMemo } from 'react';
import { LuGift, LuPlus } from 'react-icons/lu';
import {
  type LoaderFunctionArgs,
  Link,
  useFetcher,
  useFetchers,
  useLoaderData,
  useRouteLoaderData,
} from 'react-router';

import { FriendActionButton } from '#app/components/friends/friend-action-button.tsx';
import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { type loader as routeLoader } from './__route.server';
import { applyPendingSettingsMemberMutations } from './__route.shared';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const { requireUserIdInGroup } = await import(
    '#app/utils/groups.server.ts'
  );
  const { prisma } = await import('#app/utils/db.server.ts');
  const { POOL_STATUS } = await import('#app/utils/pool-constants.ts');

  const viewerId = await requireUserIdInGroup(request, groupId);

  // Privacy: exclude pools where the viewer is the recipient — they must
  // not be able to see a "View pool" link for their own gift pool.
  const activePools = await prisma.pool.findMany({
    where: {
      giftGroupId: groupId,
      status: {
        notIn: [POOL_STATUS.DELIVERED, POOL_STATUS.CANCELLED],
      },
      recipientUserId: { not: viewerId },
    },
    select: {
      id: true,
      title: true,
      recipientUserId: true,
    },
  });

  const activePoolsByRecipient: Record<
    string,
    { id: string; title: string }
  > = {};
  for (const pool of activePools) {
    if (pool.recipientUserId) {
      activePoolsByRecipient[pool.recipientUserId] = {
        id: pool.id,
        title: pool.title,
      };
    }
  }

  return { activePoolsByRecipient };
}

type GroupMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

const GroupMembersRoute = () => {
  const { activePoolsByRecipient } = useLoaderData<typeof loader>();
  const { giftGroup, viewer } = useRouteLoaderData<typeof routeLoader>(
    'routes/groups+/$giftGroupId_+/_layout',
  )!;
  const fetcher = useFetcher();
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

  const sumBudgetForRecipient = (userId: string) =>
    optimisticMembers
      .filter((gm) => gm.user.id !== userId)
      .reduce((acc, gm) => acc + (gm.contributionCents ?? 0), 0);

  const canOwner = optimisticViewerRole === 'OWNER';
  const canAdmin =
    optimisticViewerRole === 'OWNER' || optimisticViewerRole === 'ADMIN';

  return (
    <Card padding="lg">
      <div className="mb-1 text-lg font-semibold">
        Group Members ({totalMembers})
      </div>
      <div className="mb-4 text-sm text-muted-foreground">
        Manage members and their gift budgets
      </div>
      <ul className="divide-y divide-border rounded-xl border bg-subcard">
        {optimisticMembers.map((m) => {
          const isViewer = m.user.id === viewer.userId;
          const giftBudget = sumBudgetForRecipient(m.user.id);
          const birthday = m.user.birthday
            ? new Date(m.user.birthday as any)
            : null;
          const friendRelationship = m.friendRelationship ?? {
            state: 'NONE',
            friendshipId: null,
            incomingRequestId: null,
            outgoingRequestId: null,
          };
          const memberDisplayName = m.user.name ?? m.user.username;
          return (
            <li key={m.user.id} className="flex items-center gap-3 p-3">
              <Link
                to={`/users/${m.user.username}`}
                className="flex items-center gap-3"
              >
                <Avatar size="s" image={m.user.image} user={m.user} />
                <div>
                  <div className="font-medium">
                    {m.user.username}
                    {isViewer ? ' (You)' : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {birthday
                      ? `Birthday ${birthday.toLocaleDateString()}`
                      : 'Birthday not set'}
                  </div>
                </div>
              </Link>

              <div className="ml-auto flex items-center gap-3">
                <div className="text-right" title="Sum of everyone else's per-gift caps — what this person could receive">
                  <div className="text-sm font-semibold">
                    ${(giftBudget / 100).toFixed(2)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    gift budget
                  </div>
                </div>
                <RoleBadge role={m.role as any} />

                {canOwner && !isViewer && (
                  <div className="flex items-center gap-1">
                    {m.role === 'MEMBER' ? (
                      <fetcher.Form
                        method="post"
                        action={`/groups/${giftGroup.id}/settings`}
                      >
                        <input
                          type="hidden"
                          name="giftGroupId"
                          value={giftGroup.id}
                        />
                        <input
                          type="hidden"
                          name="memberUserId"
                          value={m.user.id}
                        />
                        <Button
                          size="icon"
                          variant="secondary"
                          name="intent"
                          value="member-promote-admin"
                          aria-label="Promote to admin"
                        >
                          <Icon name="plus" />
                        </Button>
                      </fetcher.Form>
                    ) : (
                      <>
                        <fetcher.Form
                          method="post"
                          action={`/groups/${giftGroup.id}/settings`}
                        >
                          <input
                            type="hidden"
                            name="giftGroupId"
                            value={giftGroup.id}
                          />
                          <input
                            type="hidden"
                            name="memberUserId"
                            value={m.user.id}
                          />
                          <Button
                            size="icon"
                            variant="secondary"
                            name="intent"
                            value="member-demote-member"
                            aria-label="Demote to member"
                          >
                            <Icon name="reset" />
                          </Button>
                        </fetcher.Form>
                        <fetcher.Form
                          method="post"
                          action={`/groups/${giftGroup.id}/settings`}
                        >
                          <input
                            type="hidden"
                            name="giftGroupId"
                            value={giftGroup.id}
                          />
                          <input
                            type="hidden"
                            name="newOwnerUserId"
                            value={m.user.id}
                          />
                          <Button
                            size="icon"
                            variant="secondary"
                            name="intent"
                            value="ownership-transfer"
                            aria-label="Transfer ownership"
                          >
                            <Icon name="person" />
                          </Button>
                        </fetcher.Form>
                      </>
                    )}
                    <fetcher.Form
                      method="post"
                      action={`/groups/${giftGroup.id}/settings`}
                    >
                      <input
                        type="hidden"
                        name="giftGroupId"
                        value={giftGroup.id}
                      />
                      <input
                        type="hidden"
                        name="memberUserId"
                        value={m.user.id}
                      />
                      <Button
                        size="icon"
                        variant="destructive"
                        name="intent"
                        value="member-remove"
                        aria-label="Remove member"
                      >
                        <Icon name="trash" />
                      </Button>
                    </fetcher.Form>
                  </div>
                )}

                {canAdmin && !canOwner && m.role === 'MEMBER' && !isViewer ? (
                  <fetcher.Form
                    method="post"
                    action={`/groups/${giftGroup.id}/settings`}
                  >
                    <input
                      type="hidden"
                      name="giftGroupId"
                      value={giftGroup.id}
                    />
                    <input
                      type="hidden"
                      name="memberUserId"
                      value={m.user.id}
                    />
                    <Button
                      size="icon"
                      variant="destructive"
                      name="intent"
                      value="member-remove"
                      aria-label="Remove member"
                    >
                      <Icon name="trash" />
                    </Button>
                  </fetcher.Form>
                ) : null}

                {!isViewer ? (
                  <>
                    <PoolActionForMember
                      groupId={giftGroup.id}
                      memberId={m.user.id}
                      memberHasBirthday={birthday !== null}
                      activePool={activePoolsByRecipient[m.user.id] ?? null}
                    />
                    <Link
                      to={`/groups/${giftGroup.id}/members/${m.user.id}/history`}
                      aria-label={`View gift history for ${memberDisplayName}`}
                      title={`Gifts for ${memberDisplayName}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <LuGift size={14} />
                    </Link>
                    <FriendActionButton
                      targetUserId={m.user.id}
                      targetUserName={memberDisplayName}
                      relationship={friendRelationship}
                      variant="compact"
                    />
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

export default GroupMembersRoute;

type ActivePool = { id: string; title: string } | null;

const PoolActionForMember = ({
  groupId,
  memberId,
  memberHasBirthday,
  activePool,
}: {
  groupId: string;
  memberId: string;
  memberHasBirthday: boolean;
  activePool: ActivePool;
}) => {
  if (activePool) {
    return (
      <Link
        to={`/pools/${activePool.id}`}
        title={`View pool: ${activePool.title}`}
        className="inline-flex h-8 items-center justify-center rounded-xl border border-input bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        View pool
      </Link>
    );
  }

  if (!memberHasBirthday) return null;

  return (
    <Link
      to={`/pools/new?groupId=${groupId}&recipientId=${memberId}`}
      title="Start a pool for this member"
      className="inline-flex h-8 items-center justify-center gap-1 rounded-xl border border-input bg-background px-2.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <LuPlus size={12} />
      Start a pool
    </Link>
  );
};
