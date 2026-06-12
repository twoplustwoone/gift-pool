import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data,
  redirect,
  useLoaderData,
} from 'react-router';
import {
  InviteLanding,
  InviteLandingInvalid,
} from '#app/components/invite-landing.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId, requireUserId } from '#app/utils/auth.server.ts';
import {
  acceptFriendInvite,
  requireFriendInvitationNotExpired,
} from '#app/utils/friend-invitations.server.ts';
import { getRequestContext } from '#app/utils/request-context.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';

// NOTE the `friends_.` break-out filename: this route must NOT nest under
// the auth-gated /friends layout — anonymous invite recipients need to see
// the invitation context (and dead-link state) before being asked to sign
// up. The accept POST still requires auth.
export async function loader({ params, request }: LoaderFunctionArgs) {
  const code = params.code;
  if (!code) return redirect('/friends');
  // Funnel entry: fired before any gate so anonymous landings (the
  // drop-off we want to measure) are captured, and on dead links too.
  const { requestId, visitorId } = await getRequestContext(request);
  const userId = await getUserId(request);
  let invitation;
  try {
    invitation = await requireFriendInvitationNotExpired(code);
  } catch (error) {
    if (error instanceof Response && error.status < 500) {
      queueLogEvent({
        name: 'invite_landed',
        userId,
        source: 'server',
        requestId,
        visitorId,
        properties: { inviteType: 'friend', valid: false },
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
      inviteType: 'friend',
      valid: true,
      inviterId: invitation.createdBy.id,
    },
  });
  return {
    kind: 'ok' as const,
    // Senders click their own links to test them — tell them what this is
    // instead of silently bouncing (June 2026 audit).
    isOwnInvite: invitation.createdBy.id === userId,
    isAuthenticated: userId != null,
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
  const loaderData = useLoaderData<typeof loader>();
  if (loaderData.kind === 'invalid') {
    return <InviteLandingInvalid />;
  }
  const { inviter, isAuthenticated, isOwnInvite } = loaderData;
  const displayName = inviter.name ?? inviter.username;

  if (isOwnInvite) {
    return (
      <InviteLanding
        title="This is your invite link"
        isAuthenticated
        cancelTo="/friends"
        cancelLabel="Back to Friends"
      >
        <p>
          You created this link — share it with someone you want to add as a
          friend. When they open it, they&apos;ll be able to accept.
        </p>
      </InviteLanding>
    );
  }

  return (
    <InviteLanding
      title={`${displayName} wants to be your friend`}
      isAuthenticated={isAuthenticated}
      acceptLabel="Accept"
      cancelTo="/friends"
    >
      <div className="flex items-center gap-3 py-2">
        <Avatar size="s" image={inviter.image} user={inviter} />
        <div>
          <div className="font-medium text-foreground">{displayName}</div>
          <div className="text-sm text-muted-foreground">
            @{inviter.username}
          </div>
        </div>
      </div>
      <p>
        Friends on GiftPool can see each other&apos;s wishlists and chip in on
        group gifts together.
      </p>
    </InviteLanding>
  );
};
export default AcceptFriendInvitePage;
