import {
  type ActionFunctionArgs,
  json,
  redirect,
  type LoaderFunctionArgs,
} from '@remix-run/node';
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigate,
} from '@remix-run/react';
import { useEffect } from 'react';
import { Button } from '#app/components/ui/button.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import {
  addUserToGroup,
  requireInvitationNotExpired,
} from '#app/utils/group-invitations.server.ts';
import { requireUserIdNotInGroup } from '#app/utils/groups.server.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { code } = params;

  if (!code) {
    return redirect('/groups');
  }

  const invitation = await requireInvitationNotExpired(code);
  await requireUserIdNotInGroup(request, invitation.giftGroupId);

  return json({
    giftGroupId: invitation.giftGroup.id,
    giftGroupName: invitation.giftGroup.name,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { code } = params;

  if (!code) {
    return json({ error: 'Invalid invite link.' }, { status: 400 });
  }

  const invitation = await requireInvitationNotExpired(code);
  const userId = await requireUserIdNotInGroup(request, invitation.giftGroupId);

  await addUserToGroup(userId, invitation.giftGroupId);

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
          <DialogFooter>
            <DialogClose asChild>
              <Button
                onClick={() => navigate('/groups')}
                variant={'secondary'}
                type="button"
              >
                Cancel
              </Button>
            </DialogClose>
            <Form method="post">
              <Button>Join Group</Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JoinGroupPage;
