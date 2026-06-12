import { useEffect } from 'react';
import {
  type ActionFunctionArgs,
  data,
  redirect,
  type LoaderFunctionArgs,
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
} from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  addUserToGroup,
  requireInvitationNotExpired,
  submitJoinRequest,
} from '#app/utils/group-invitations.server.ts';
import { requireUserIdNotInGroup } from '#app/utils/groups.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';
export async function loader({ params, request }: LoaderFunctionArgs) {
  const { code } = params;
  if (!code) {
    return redirect('/groups');
  }
  // Funnel entry: fired before the auth gate so anonymous landings (the
  // drop-off we want to measure) are captured, and on dead links too.
  const { requestId, visitorId } = await getRequestContext(request);
  const userId = await getUserId(request);
  let invitation;
  try {
    invitation = await requireInvitationNotExpired(code);
  } catch (error) {
    queueLogEvent({
      name: 'invite_landed',
      userId,
      source: 'server',
      requestId,
      visitorId,
      properties: { inviteType: 'group', valid: false },
    });
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
  await requireUserIdNotInGroup(request, invitation.giftGroupId);
  return {
    giftGroupId: invitation.giftGroup.id,
    giftGroupName: invitation.giftGroup.name,
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
  const { giftGroupName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  useEffect(() => {
    if (actionData?.error) {
    }
  }, [actionData]);
  return (
    <div className="flex flex-col items-center justify-center">
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join Group</DialogTitle>
          </DialogHeader>
          <p>
            You were invited to join the group{' '}
            <span className="font-extrabold">{giftGroupName}</span>! 🎉
          </p>
          <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button
                onClick={() => navigate('/groups')}
                variant={'secondary'}
                type="button"
                className="min-w-28"
              >
                Cancel
              </Button>
            </DialogClose>
            <Form method="post" className="inline-block">
              <Button className="min-w-28">Join Group</Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default JoinGroupPage;
