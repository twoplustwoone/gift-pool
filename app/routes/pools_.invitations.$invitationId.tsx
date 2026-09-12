import { LuGift, LuUsers } from 'react-icons/lu';
import {
  Form,
  redirect,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  acceptPoolInvitation,
  declinePoolInvitation,
  getPoolInvitationForInvitee,
  PoolInvitationError,
} from '#app/utils/pool-invitations.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  if (!params.invitationId) throw new Response('Not Found', { status: 404 });
  try {
    const invitation = await getPoolInvitationForInvitee(
      params.invitationId,
      userId,
    );
    if (invitation.status === 'ACCEPTED') {
      return redirect(`/pools/${invitation.poolId}`);
    }
    return { invitation };
  } catch (error) {
    if (error instanceof PoolInvitationError && error.status < 500) {
      throw new Response('Not Found', { status: 404 });
    }
    throw error;
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  if (!params.invitationId) throw new Response('Not Found', { status: 404 });
  const rawIntent = (await request.formData()).get('intent');
  const intent = typeof rawIntent === 'string' ? rawIntent : '';
  try {
    if (intent === 'accept') {
      const { poolId } = await acceptPoolInvitation(
        params.invitationId,
        userId,
      );
      return redirectWithToast(`/pools/${poolId}`, {
        type: 'success',
        description: 'You joined the pool.',
      });
    }
    if (intent === 'decline') {
      await declinePoolInvitation(params.invitationId, userId);
      return redirectWithToast('/pools', {
        type: 'success',
        description: 'Invitation declined.',
      });
    }
    throw new Response('Invalid action.', { status: 400 });
  } catch (error) {
    if (error instanceof PoolInvitationError) {
      throw new Response(error.message, { status: error.status });
    }
    throw error;
  }
}

export default function PoolInvitationReviewPage() {
  const { invitation } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submittedIntent = navigation.formData?.get('intent');
  const pending = navigation.state !== 'idle';
  const inviterName = invitation.inviter.name ?? invitation.inviter.username;
  const available = invitation.status === 'PENDING' && invitation.isActive;

  return (
    <main className="mx-auto flex min-h-full max-w-2xl items-center px-4 py-10 sm:px-6">
      <Card className="w-full overflow-hidden">
        <div className="bg-primary/5 px-6 py-8 text-center sm:px-10">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LuGift className="size-6" aria-hidden />
          </div>
          <p className="text-sm font-medium text-primary">Pool invitation</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            You’re invited to contribute
          </h1>
          <p className="mt-3 text-lg font-semibold">{invitation.poolTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Gift pool for {invitation.recipientLabel}
          </p>
        </div>

        <div className="space-y-6 px-6 py-6 sm:px-10 sm:py-8">
          <div className="flex items-center gap-3">
            <Avatar
              user={invitation.inviter}
              image={invitation.inviter.image}
              size="s"
            />
            <div>
              <p className="text-sm font-semibold">Invited by {inviterName}</p>
              <p className="text-xs text-muted-foreground">
                Review the invitation before choosing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <LuUsers className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm">
              {invitation.contributorCount}{' '}
              {invitation.contributorCount === 1 ? 'person has' : 'people have'}{' '}
              joined so far. Contributor identities and gift details stay
              private until you accept.
            </p>
          </div>

          {available ? (
            <Form method="post" className="grid gap-3 sm:grid-cols-2">
              <Button
                type="submit"
                name="intent"
                value="accept"
                className="min-h-11 min-w-0"
                disabled={pending}
              >
                {submittedIntent === 'accept' ? 'Joining…' : 'Accept and join'}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="decline"
                variant="outline"
                className="min-h-11 min-w-0"
                disabled={pending}
              >
                {submittedIntent === 'decline' ? 'Declining…' : 'Decline'}
              </Button>
            </Form>
          ) : (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              This invitation is no longer available.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            If the pool uses a group contribution default, you can review or
            change your amount after joining.
          </p>
        </div>
      </Card>
    </main>
  );
}
