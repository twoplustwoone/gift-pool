import { useEffect, useRef, useState } from 'react';
import { LuUserPlus } from 'react-icons/lu';
import { useFetcher } from 'react-router';
import { toast } from 'sonner';
import { Button } from '#app/components/ui/button.tsx';

/**
 * Icon-only header control that surfaces the group's invite link.
 *
 * Reuses the existing invite mechanism — no new route/action:
 * - If a link already exists, clicking copies it.
 * - Otherwise it POSTs `intent=create-invite-link` to `/groups/:id` (the same
 *   action the Group info card uses) and copies the returned URL once created.
 *
 * Permission is enforced server-side (`requireUserWithGroupPermission
 * 'manageInvites'` throws 403); callers only render this for users who can
 * invite, so the UI never presents an action the server would reject.
 */
export const GroupInviteButton = ({
  giftGroupId,
  inviteLink,
}: {
  giftGroupId: string;
  inviteLink: string | null;
}) => {
  const createFetcher = useFetcher();
  const [localInviteLink, setLocalInviteLink] = useState<string | null>(
    inviteLink,
  );
  const resolvedInviteLink = localInviteLink ?? inviteLink;
  const pending = createFetcher.state !== 'idle';
  const copiedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setLocalInviteLink(inviteLink);
  }, [inviteLink]);

  // Copy the freshly-created link once the action settles. The
  // create-invite-link action already surfaces its own success toast, so copy
  // silently here — a second toast would double up on the first click. The ref
  // guards against re-copying the same URL on incidental re-renders.
  useEffect(() => {
    const url = (createFetcher.data as { inviteUrl?: string } | undefined)
      ?.inviteUrl;
    if (createFetcher.state === 'idle' && url && copiedUrlRef.current !== url) {
      copiedUrlRef.current = url;
      setLocalInviteLink(url);
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [createFetcher.state, createFetcher.data]);

  if (resolvedInviteLink) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Invite to group"
        className="text-muted-foreground hover:text-foreground"
        onClick={async () => {
          await navigator.clipboard.writeText(resolvedInviteLink);
          toast.success('Invite link copied');
        }}
      >
        <LuUserPlus className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <createFetcher.Form method="post" action={`/groups/${giftGroupId}`}>
      <input type="hidden" name="giftGroupId" value={giftGroupId} />
      <input type="hidden" name="intent" value="create-invite-link" />
      <input type="hidden" name="expiresInDays" value="7" />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label="Invite to group"
        className="text-muted-foreground hover:text-foreground"
        disabled={pending}
      >
        <LuUserPlus className="h-5 w-5" />
      </Button>
    </createFetcher.Form>
  );
};
