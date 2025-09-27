import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  json,
  redirect,
} from '@remix-run/node'
import { Form, useLoaderData, useNavigate } from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx'
import { Avatar } from '#app/components/ui/avatar.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
  acceptFriendInvite,
  requireFriendInvitationNotExpired,
} from '#app/utils/friend-invitations.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const code = params.code
  if (!code) return redirect('/friends')
  await requireUserId(request)
  const invitation = await requireFriendInvitationNotExpired(code)
  return json({
    inviter: invitation.createdBy,
  })
}

export async function action({ params, request }: ActionFunctionArgs) {
  const code = params.code
  if (!code) return json({ error: 'Invalid invite.' }, { status: 400 })
  const userId = await requireUserId(request)
  await acceptFriendInvite(code, userId)
  return redirectWithToast('/friends', {
    type: 'success',
    description: 'Friend added.',
  })
}

const AcceptFriendInvitePage = () => {
  const { inviter } = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const displayName = inviter.name ?? inviter.username
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
              <div className="text-sm text-muted-foreground">@{inviter.username}</div>
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
              <Button className="min-w-28">Accept</Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AcceptFriendInvitePage

