import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data,
  redirect,
  Form,
  useLoaderData,
  useNavigate,
} from 'react-router';
import { Avatar } from '#app/components/ui/avatar.tsx';
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
import { getUserId, requireUserId } from '#app/utils/auth.server.ts';
import {
  acceptFriendInvite,
  requireFriendInvitationNotExpired,
} from '#app/utils/friend-invitations.server.ts';
import { dispatchFriendshipUpdate } from '#app/utils/friendship-events.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';
export async function loader({ params, request }: LoaderFunctionArgs) {
  const code = params.code;
  if (!code) return redirect('/friends');
  // Funnel entry: fired before the auth gate so anonymous landings (the
  // drop-off we want to measure) are captured, and on dead links too.
  const { requestId, visitorId } = await getRequestContext(request);
  const maybeUserId = await getUserId(request);
  let invitation;
  try {
    invitation = await requireFriendInvitationNotExpired(code);
  } catch (error) {
    queueLogEvent({
      name: 'invite_landed',
      userId: maybeUserId,
      source: 'server',
      requestId,
      visitorId,
      properties: { inviteType: 'friend', valid: false },
    });
    throw error;
  }
  queueLogEvent({
    name: 'invite_landed',
    userId: maybeUserId,
    source: 'server',
    requestId,
    visitorId,
    properties: {
      inviteType: 'friend',
      valid: true,
      inviterId: invitation.createdBy.id,
    },
  });
  const userId = await requireUserId(request);
  if (invitation.createdBy.id === userId) {
    return redirect('/friends');
  }
  return {
    inviter: invitation.createdBy,
  };
}
export async function action({ params, request }: ActionFunctionArgs) {
  const code = params.code;
  if (!code)
    return data(
      {
        error: 'Invalid invite.',
      },
      {
        status: 400,
      },
    );
  const userId = await requireUserId(request);
  await acceptFriendInvite(code, userId);
  return redirectWithToast('/friends', {
    type: 'success',
    description: 'Friend added.',
  });
}
const AcceptFriendInvitePage = () => {
  const { inviter } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const displayName = inviter.name ?? inviter.username;
  return (
    <div className="flex flex-col items-center justify-center">
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Friend Request</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 py-2">
            <Avatar size="s" image={inviter.image} user={inviter} />
            <div>
              <div className="font-medium text-foreground">{displayName}</div>
              <div className="text-sm text-muted-foreground">
                @{inviter.username}
              </div>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {displayName} wants to be your friend.
          </p>
          <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button
                onClick={() => navigate('/friends')}
                variant={'secondary'}
                type="button"
                className="min-w-28"
              >
                Cancel
              </Button>
            </DialogClose>
            <Form method="post" className="inline-block">
              <Button
                className="min-w-28"
                onClick={() => {
                  // Optimistically dispatch a friendship update with inviter payload.
                  // Friends page will add to list if not present yet.
                  dispatchFriendshipUpdate({
                    userId: inviter.id,
                    state: 'FRIENDS',
                    friendshipId: null,
                    incomingRequestId: null,
                    outgoingRequestId: null,
                    user: inviter,
                  } as any);
                }}
              >
                Accept
              </Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Fallback non-modal content in case dialog overlay is hidden by CSS or portals fail */}
      <div className="mt-6 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-3 text-lg font-semibold">Accept Friend Request</div>
        <div className="flex items-center gap-3 py-2">
          <Avatar size="s" image={inviter.image} user={inviter} />
          <div>
            <div className="font-medium text-foreground">{displayName}</div>
            <div className="text-sm text-muted-foreground">
              @{inviter.username}
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            onClick={() => navigate('/friends')}
            variant={'secondary'}
            type="button"
            className="min-w-28"
          >
            Cancel
          </Button>
          <Form method="post" className="inline-block">
            <Button className="min-w-28">Accept</Button>
          </Form>
        </div>
      </div>
    </div>
  );
};
export default AcceptFriendInvitePage;
