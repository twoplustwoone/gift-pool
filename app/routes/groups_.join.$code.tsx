import {
  type ActionFunctionArgs,
  data,
  redirect,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import {
  InviteLanding,
  InviteLandingInvalid,
} from '#app/components/invite-landing.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  addUserToGroup,
  requireInvitationNotExpired,
  submitJoinRequest,
} from '#app/utils/group-invitations.server.ts';
import {
  isUserInGroup,
  requireUserIdNotInGroup,
} from '#app/utils/groups.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';

// NOTE the `groups_.` break-out filename: this route must NOT nest under
// the auth-gated /groups layout — anonymous invite recipients need to see
// the invitation context (and dead-link state) before being asked to sign
// up. The join POST still requires auth.
export async function loader({ params, request }: LoaderFunctionArgs) {
  const { code } = params;
  if (!code) {
    return redirect('/groups');
  }
  // Funnel entry: fired before any gate so anonymous landings (the
  // drop-off we want to measure) are captured, and on dead links too.
  const { requestId, visitorId } = await getRequestContext(request);
  const userId = await getUserId(request);
  let invitation;
  try {
    invitation = await requireInvitationNotExpired(code);
  } catch (error) {
    if (error instanceof Response && error.status < 500) {
      queueLogEvent({
        name: 'invite_landed',
        userId,
        source: 'server',
        requestId,
        visitorId,
        properties: { inviteType: 'group', valid: false },
      });
      return { kind: 'invalid' as const };
    }
    throw error;
  }
  queueLogEvent({
    name: 'invite_landed',
    userId,
    source: 'server',
    requestId,
    visitorId,
    properties: {
      inviteType: 'group',
      valid: true,
      giftGroupId: invitation.giftGroupId,
    },
  });
  if (userId && (await isUserInGroup(userId, invitation.giftGroupId))) {
    return redirect(`/groups/${invitation.giftGroupId}`);
  }
  const memberCount = await prisma.usersInGiftGroups.count({
    where: { giftGroupId: invitation.giftGroupId },
  });
  return {
    kind: 'ok' as const,
    giftGroupName: invitation.giftGroup.name,
    memberCount,
    requireApproval: invitation.requireApproval,
    isAuthenticated: userId != null,
  };
}
export async function action({ request, params }: ActionFunctionArgs) {
  const { code } = params;
  if (!code) {
    return data(
      {
        error: 'Invalid invite link.',
      },
      {
        status: 400,
      },
    );
  }
  const invitation = await requireInvitationNotExpired(code);
  const userId = await requireUserIdNotInGroup(request, invitation.giftGroupId);
  if (invitation.requireApproval) {
    await submitJoinRequest({
      invitationId: invitation.id,
      userId,
      groupId: invitation.giftGroupId,
    });
    return redirectWithToast(`/groups`, {
      type: 'success',
      description: 'Request to join sent for approval.',
    });
  }
  await addUserToGroup(
    userId,
    invitation.giftGroupId,
    invitation.roleGranted as 'OWNER' | 'ADMIN' | 'MEMBER',
  );
  await prisma.groupInvitation.update({
    where: {
      id: invitation.id,
    },
    data: {
      usedCount: {
        increment: 1,
      },
    },
  });
  queueLogEvent({
    name: 'group_joined',
    userId,
    source: 'server',
    properties: { giftGroupId: invitation.giftGroupId, via: 'invite' },
  });
  return redirectWithToast(`/groups/${invitation.giftGroupId}`, {
    type: 'success',
    description: 'You have joined the group.',
  });
}
const JoinGroupPage = () => {
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.kind === 'invalid') {
    return <InviteLandingInvalid />;
  }
  const { giftGroupName, memberCount, requireApproval, isAuthenticated } =
    loaderData;
  return (
    <InviteLanding
      title={`Join ${giftGroupName}`}
      isAuthenticated={isAuthenticated}
      acceptLabel={requireApproval ? 'Request to join' : 'Join Group'}
      cancelTo="/groups"
    >
      <p>
        You were invited to join{' '}
        <span className="font-semibold text-foreground">{giftGroupName}</span> —
        a gift group with {memberCount}{' '}
        {memberCount === 1 ? 'member' : 'members'}. 🎉
      </p>
      <p>
        Group members can see each other&apos;s birthdays and team up on gifts.
      </p>
      {requireApproval ? (
        <p>The group owner approves new members before they join.</p>
      ) : null}
    </InviteLanding>
  );
};
export default JoinGroupPage;
