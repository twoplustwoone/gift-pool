import { useFetcher, useRouteLoaderData } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '#app/components/ui/dialog.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { track } from '#app/utils/analytics.client.ts';
import {
  type loader as routeLoader,
  type action as routeAction,
} from './__route.server';

const GiftGroupOverview = () => {
  const { giftGroup, inviteLink, viewer, canInvite } = useRouteLoaderData<
    typeof routeLoader
  >('routes/groups+/$giftGroupId_+/_layout')!;
  const createFetcher = useFetcher<typeof routeAction>();

  useEffect(() => {
    const url = (createFetcher.data as any)?.inviteUrl as string | undefined;
    if (createFetcher.state === 'idle' && url) {
      void navigator.clipboard.writeText(url);
    }
  }, [createFetcher.state, createFetcher.data]);

  return (
    <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
      <Card padding="lg">
        <div className="mb-4 text-lg font-semibold">Group Information</div>
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-muted-foreground">Name</div>
            <div className="text-foreground">{giftGroup.name}</div>
          </div>
          {giftGroup.description ? (
            <div>
              <div className="text-muted-foreground">Description</div>
              <div className="text-foreground">{giftGroup.description}</div>
            </div>
          ) : null}
          <div>
            <div className="text-muted-foreground">Created</div>
            <div className="text-foreground">
              {new Date(
                giftGroup.createdAt as unknown as string,
              ).toLocaleDateString()}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Your Contribution Limit</div>
            <div>
              <InlineBudgetEditor
                giftGroupId={giftGroup.id}
                initialCents={viewer.contributionCents ?? 0}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Maximum amount you'll contribute per gift
            </div>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div className="mb-1 text-lg font-semibold">Invite Members</div>
        <div className="mb-4 text-sm text-muted-foreground">
          Share this link to invite new members to the group
        </div>
        {inviteLink ? (
          <Button
            className="w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteLink);
            }}
          >
            <Icon name="copy" className="mr-2" /> Copy Invite Link
          </Button>
        ) : canInvite ? (
          <createFetcher.Form
            method="post"
            action={`/groups/${giftGroup.id}`}
            className="w-full"
          >
            <input type="hidden" name="giftGroupId" value={giftGroup.id} />
            <input type="hidden" name="intent" value="create-invite-link" />
            <input type="hidden" name="expiresInDays" value="7" />
            <Button
              className="w-full"
              disabled={createFetcher.state !== 'idle'}
            >
              <Icon name="link-2" className="mr-2" /> Create & Copy Invite Link
            </Button>
          </createFetcher.Form>
        ) : (
          <div className="text-sm text-muted-foreground">
            No active invite link. Ask an admin to create one.
          </div>
        )}
      </Card>
    </div>
  );
};
export default GiftGroupOverview;

// The rest of this file contains the inline budget editor used above.

/* const DeleteGroupDialog = ({ id }: { id: string }) => {
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [form] = useForm({
    id: GiftGroupIdFormIntent.DeleteGiftGroup,
    lastResult: actionData,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={'destructive'}
          onClick={() => track('group_deleted', { groupId: id })}
        >
          <Icon name="trash" className="scale-125 max-md:scale-150">
            <span className="max-md:hidden">Delete</span>
          </Icon>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete group</DialogTitle>
          <DialogDescription>
            Warning! This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          Are you sure you want to delete this group?
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant={'secondary'} type="button">
              Cancel
            </Button>
          </DialogClose>
          <Form method="POST" {...getFormProps(form)}>
            <input type="hidden" name="giftGroupId" value={id} />
            <StatusButton
              type="submit"
              name="intent"
              value={GiftGroupIdFormIntent.DeleteGiftGroup}
              variant="destructive"
              status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
              disabled={isPending}
              className="w-full max-md:aspect-square max-md:px-0"
            >
              Delete group
            </StatusButton>
            <ErrorList errors={form.errors} id={form.errorId} />
          </Form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; */

/* const LeaveGroupDialog = ({ id }: { id: string }) => {
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [form] = useForm({
    id: GiftGroupIdFormIntent.LeaveGiftGroup,
    lastResult: actionData,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={'destructive'}
          onClick={() => track('group_left', { groupId: id })}
        >
          <Icon name="exit" className="scale-125 max-md:scale-150">
            <span className="max-md:hidden">Leave group</span>
          </Icon>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Leave group</DialogTitle>
          <DialogDescription>
            Are you sure you want to leave this group?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant={'secondary'} type="button">
              Cancel
            </Button>
          </DialogClose>
          <Form method="POST" {...getFormProps(form)}>
            <input type="hidden" name="giftGroupId" value={id} />
            <StatusButton
              type="submit"
              name="intent"
              value={GiftGroupIdFormIntent.LeaveGiftGroup}
              variant="destructive"
              status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
              disabled={isPending}
              className="w-full max-md:aspect-square max-md:px-0"
            >
              Leave group
            </StatusButton>
          </Form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; */

// no skeletons/empty-state needed on overview

// activity helpers not needed on the overview page

const InlineBudgetEditor = ({
  giftGroupId,
  initialCents,
}: {
  giftGroupId: string;
  initialCents: number;
}) => {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number>(initialCents);
  const dollars = (value / 100).toFixed(2);
  const pending = fetcher.state !== 'idle';

  const submit = (next: number) => {
    const cents = Math.max(0, Math.round(next));
    setValue(cents); // optimistic
    const fd = new FormData();
    fd.set('intent', 'member-update-self');
    fd.set('giftGroupId', giftGroupId);
    fd.set('contributionCents', String(cents));
    fetcher.submit(fd, {
      method: 'post',
      action: `/groups/${giftGroupId}/settings`,
    });
    track('group_budget_saved', { groupId: giftGroupId });
  };

  const selectOnceRef = useRef(false);
  const handleFocusSelectAll = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!selectOnceRef.current) {
      e.currentTarget.select();
      selectOnceRef.current = true;
    }
  };
  const handleMouseUpPreserve = (e: React.MouseEvent<HTMLInputElement>) => {
    if (selectOnceRef.current) return;
    e.preventDefault();
  };

  // Mobile: open modal instead of inline edit
  const MobileButton = (
    <Dialog>
      <DialogTrigger asChild>
        {value > 0 ? (
          <Button variant="ghost" size="sm">
            ${dollars} <Icon name="pencil-1" className="ml-1" />
          </Button>
        ) : (
          <Button>Set your budget</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set your budget</DialogTitle>
        </DialogHeader>
        <fetcher.Form
          method="post"
          action={`/groups/${giftGroupId}/settings`}
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.querySelector(
              'input[name="dollars"]',
            ) as HTMLInputElement;
            const next = Math.max(
              0,
              Math.round(parseFloat(input.value || '0') * 100),
            );
            submit(next);
          }}
        >
          <input type="hidden" name="intent" value="member-update-self" />
          <input type="hidden" name="giftGroupId" value={giftGroupId} />
          <Label htmlFor="budget-mobile">Amount</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="budget-mobile"
              name="dollars"
              defaultValue={dollars}
              inputMode="decimal"
              className="border-input bg-input pl-5 text-foreground"
              onFocus={handleFocusSelectAll}
              onMouseUp={handleMouseUpPreserve}
            />
          </div>
          <DialogFooter className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="sm:hidden">{MobileButton}</span>
        <span className="hidden items-center gap-2 sm:inline-flex">
          {value > 0 ? (
            <>
              <span className="text-xl font-bold text-foreground">
                ${dollars}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit your budget"
                onClick={() => setEditing(true)}
              >
                <Icon name="pencil-1" />
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)}>Set your budget</Button>
          )}
        </span>
      </div>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action={`/groups/${giftGroupId}/settings`}
      className="hidden items-center gap-2 sm:flex"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.querySelector(
          'input[name="dollars"]',
        ) as HTMLInputElement;
        const next = Math.max(
          0,
          Math.round(parseFloat(input.value || '0') * 100),
        );
        submit(next);
        setEditing(false);
      }}
    >
      <input type="hidden" name="intent" value="member-update-self" />
      <input type="hidden" name="giftGroupId" value={giftGroupId} />
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input
          name="dollars"
          defaultValue={dollars}
          inputMode="decimal"
          className="w-28 border-input bg-input pl-5 text-foreground"
          aria-label="Your budget"
          onFocus={handleFocusSelectAll}
          onMouseUp={handleMouseUpPreserve}
          onBlur={(e) => {
            const v = Math.max(0, parseFloat(e.currentTarget.value || '0'));
            e.currentTarget.value = v.toFixed(2);
          }}
        />
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setEditing(false)}
      >
        Cancel
      </Button>
    </fetcher.Form>
  );
};
