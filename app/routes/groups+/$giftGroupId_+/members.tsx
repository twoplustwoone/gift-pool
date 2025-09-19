import { Link, useFetcher, useRouteLoaderData } from '@remix-run/react';
import { LuUserPlus } from 'react-icons/lu';

import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { FriendActionButton } from '#app/components/friends/friend-action-button.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { type loader as routeLoader } from './__route.server';

const GroupMembersRoute = () => {
  const { giftGroup, viewer } = useRouteLoaderData<typeof routeLoader>(
    'routes/groups+/$giftGroupId_+/_layout',
  )!;
  const fetcher = useFetcher();

  const totalMembers = giftGroup.groupMembers.length;

  const sumBudgetForRecipient = (userId: string) =>
    giftGroup.groupMembers
      .filter((gm) => gm.user.id !== userId)
      .reduce((acc, gm) => acc + (gm.contributionCents ?? 0), 0);

  const canOwner = viewer.role === 'OWNER';
  const canAdmin = viewer.role === 'OWNER' || viewer.role === 'ADMIN';

  return (
    <Card padding="lg">
      <div className="mb-1 text-lg font-semibold">
        Group Members ({totalMembers})
      </div>
      <div className="mb-4 text-sm text-muted-foreground">
        Manage members and their gift budgets
      </div>
      <ul className="divide-y divide-border rounded-xl border bg-subcard">
        {giftGroup.groupMembers.map((m) => {
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
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    ${(giftBudget / 100).toFixed(2)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    budget
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
                  <FriendActionButton
                    targetUserId={m.user.id}
                    targetUserName={memberDisplayName}
                    relationship={friendRelationship}
                    variant="compact"
                  />
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
