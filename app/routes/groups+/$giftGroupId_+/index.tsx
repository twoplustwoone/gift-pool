import {
  getFormProps,
  useForm,
  useInputControl,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from '@remix-run/react';
import { useRef, useState } from 'react';
import { FaLink } from 'react-icons/fa';
import { type z } from 'zod';

import { ErrorList } from '#app/components/forms.tsx';
import { GroupActions } from '#app/components/groups/GroupActions.tsx';
import { GroupHeaderCard } from '#app/components/groups/GroupHeaderCard.tsx';
import { InviteCard } from '#app/components/groups/InviteCard.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card, CardContent } from '#app/components/ui/card.tsx';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '#app/components/ui/dialog.tsx';
import { DropdownMenuItem } from '#app/components/ui/dropdown-menu.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
// kept for legacy layout elsewhere; not used here
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#app/components/ui/select.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
// kept for legacy layout elsewhere; not used here
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#app/components/ui/tooltip.tsx';
import { Flex } from '#app/components/ui-kit';
import { track } from '#app/utils/analytics.client.ts';
import { useDebounce, useIsPending } from '#app/utils/misc.tsx';
import {
  type loader as routeLoader,
  type action as routeAction,
} from './__route.server';
import {
  GiftGroupIdFormIntent,
  CreateInviteLinkFormSchema,
  DestroyInviteLinkFormSchema,
} from './__route.shared';

export { loader, action } from './__route.server';

const GiftGroupIndex = () => {
  const { giftGroup, canInvite, canDelete, canLeave, canSettings, viewer } =
    useLoaderData<typeof routeLoader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 p-3 sm:space-y-8 sm:p-6">
        <div className="sm:hidden">
          <Button asChild variant="ghost" size="sm">
            <Link to="/groups">
              <Icon name="arrow-left" /> Back
            </Link>
          </Button>
        </div>
        <GroupHeaderCard
          name={giftGroup.name}
          description={giftGroup.description}
          stats={[
            { label: 'Members', value: giftGroup.groupMembers.length },
            {
              label: 'Birthdays this month',
              value: countBirthdaysThisMonth(giftGroup),
            },
            {
              label: 'Your budget',
              value: viewer.contributionCents
                ? `$${(viewer.contributionCents / 100).toFixed(2)}`
                : 'Not set',
            },
          ]}
          actions={
            canInvite || canDelete || canLeave || canSettings ? (
              <div className="flex items-center gap-2">
                {canInvite ? (
                  <div className="hidden sm:block">
                    <CreateInviteLinkDialog />
                  </div>
                ) : null}
                <GroupActions
                  giftGroupId={giftGroup.id}
                  canSettings={canSettings}
                  canLeave={canLeave}
                  canDelete={canDelete}
                  extraItems={
                    canInvite ? (
                      <CreateInviteLinkDialog
                        trigger={
                          <DropdownMenuItem asChild className="sm:hidden">
                            <Button
                              variant={'ghost'}
                              size={'sm'}
                              className="w-full text-left"
                            >
                              <Flex gap={2}>
                                <FaLink size={10} /> Invite
                              </Flex>
                            </Button>
                          </DropdownMenuItem>
                        }
                      />
                    ) : null
                  }
                />
              </div>
            ) : null
          }
        />
        <div className="grid gap-4 sm:gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-3 sm:space-y-6">
            <Card
              padding="lg"
              className="p-4 sm:p-6"
              data-testid="panel-birthdays"
            >
              <h2 className="mb-4 text-lg font-semibold tracking-tight sm:text-xl">
                Upcoming Birthdays
              </h2>
              {isLoading ? <BirthdaysSkeleton /> : <UpcomingBirthdays />}
            </Card>
            <Card
              padding="lg"
              className="p-4 sm:p-6"
              data-testid="panel-members"
            >
              <h2 className="mb-4 text-lg font-semibold tracking-tight sm:text-xl">
                Members & Budgets
              </h2>
              {isLoading ? <MembersSkeleton /> : <MembersAndBudgets />}
            </Card>
          </div>
          <aside className="hidden md:block md:pl-2">
            <RightRail />
          </aside>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-bottom-nav sm:pb-0">
        {canInvite ? (
          <div className="fixed bottom-[calc(theme(spacing.4)+env(safe-area-inset-bottom)+4rem)] right-4 z-20 md:hidden">
            <CreateInviteLinkDialog asFab />
          </div>
        ) : null}
      </div>
    </div>
  );
};
export default GiftGroupIndex;

function countBirthdaysThisMonth(giftGroup: any) {
  const now = new Date();
  const m = now.getMonth();
  return giftGroup.groupMembers.filter((gm: any) => {
    const b = gm.user.birthday as unknown as string | null;
    if (!b) return false;
    const d = new Date(b);
    return d.getMonth() === m;
  }).length;
}

const UpcomingBirthdays = () => {
  const { giftGroup } = useLoaderData<typeof routeLoader>();
  const items = giftGroup.groupMembers
    .filter((m) => !!m.user.birthday)
    .map((m) => {
      const bday = new Date(m.user.birthday as unknown as string);
      const today = new Date();
      const thisYear = new Date(
        today.getFullYear(),
        bday.getMonth(),
        bday.getDate(),
      );
      const next =
        thisYear >=
        new Date(today.getFullYear(), today.getMonth(), today.getDate())
          ? thisYear
          : new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
      const plan = giftGroup.giftPlans.find(
        (p) => p.recipientUserId === m.user.id,
      );
      return { user: m.user, nextDate: next, plan };
    })
    .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
    .slice(0, 5);

  if (!items.length) {
    return (
      <EmptyState
        title="No upcoming birthdays"
        description="Create a gift plan from Settings to get started."
        icon="clock"
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map(({ user, nextDate }) => (
        <div
          key={user.id}
          className="flex items-center gap-3 rounded-xl border border-subcard-border bg-subcard p-3"
        >
          <Avatar user={user} image={user.image} size="s" />
          <div className="flex-1">
            <div className="font-medium">{user.username}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {nextDate.toLocaleDateString()}
              {daysUntil(nextDate) <= 14 ? (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  in {daysUntil(nextDate)} days
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const MembersAndBudgets = () => {
  const { giftGroup, viewer } = useLoaderData<typeof routeLoader>();
  // Aggregate totals not currently displayed
  return (
    <div className="flex flex-col gap-3">
      {giftGroup.groupMembers.map((groupMember) => {
        const isSelf = groupMember.user.id === viewer.userId;
        const effectiveVisibility =
          groupMember.budgetVisibilityOverride || giftGroup.budgetVisibility;
        const isAdminViewer =
          viewer.role === 'OWNER' || viewer.role === 'ADMIN';
        const visible =
          effectiveVisibility === 'EVERYONE' ||
          (effectiveVisibility === 'ADMINS' && (isAdminViewer || isSelf)) ||
          (effectiveVisibility === 'ONLY_SELF' && isSelf);
        return (
          <div
            className="flex items-center gap-3 rounded-xl border border-subcard-border bg-subcard p-2"
            key={groupMember.user.id}
          >
            <Link
              to={`/users/${groupMember.user.username}`}
              className="flex items-center gap-2"
            >
              <Avatar
                size={'s'}
                image={groupMember.user.image}
                user={groupMember.user}
              />
              <div className="text-body-md">
                {groupMember.user.username}
                {isSelf ? ' (You)' : ''}
              </div>
            </Link>
            <div className="ml-auto text-sm">
              {visible ? (
                isSelf ? (
                  <InlineBudgetEditor
                    giftGroupId={giftGroup.id}
                    initialCents={groupMember.contributionCents}
                  />
                ) : (
                  <span className="text-foreground">
                    ${(groupMember.contributionCents / 100).toFixed(2)}
                  </span>
                )
              ) : (
                'Hidden'
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RightRail = () => {
  const { canInvite, inviteLink, giftGroup, viewer } =
    useLoaderData<typeof routeLoader>();
  return (
    <div className="space-y-6">
      {canInvite ? (
        <InviteCard
          url={inviteLink}
          onCopy={() =>
            track('group_invite_copied', {
              groupId: giftGroup.id,
              actorRole: viewer.role,
              surface: 'desktop',
            })
          }
        />
      ) : null}
      {/* activity panel temporarily hidden */}
    </div>
  );
};

const CreateInviteLinkDialog = ({
  asFab = false,
  trigger,
}: {
  asFab?: boolean;
  trigger?: React.ReactNode;
}) => {
  const { inviteLink, giftGroup, viewer } = useLoaderData<typeof routeLoader>();

  // Local copy-ui state only used when we already have a link
  const [hasCopied, setHasCopied] = useState(false);
  const debouncedReset = useDebounce(() => setHasCopied(false), 2000);

  const copyExistingLink = () => {
    if (!inviteLink) return;
    setHasCopied(true);
    debouncedReset();
    void navigator.clipboard.writeText(inviteLink);
  };

  const handleInputClick = (
    event: React.MouseEvent<HTMLInputElement, MouseEvent>,
  ) => {
    event.currentTarget.select();
    copyExistingLink();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : asFab ? (
          <Button
            type="button"
            size="icon"
            aria-label="Invite"
            title="Invite"
            className="h-14 w-14 rounded-full border bg-primary text-primary-foreground shadow-lg"
          >
            <Icon name="link-2" className="scale-150" />
            <span className="sr-only">Invite</span>
          </Button>
        ) : (
          <Button variant={'default'}>
            <Icon name="link-2" className="scale-125 max-md:scale-150">
              <span className="max-md:hidden">Invite</span>
            </Icon>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create invite link</DialogTitle>
          <DialogDescription>
            Invite others to join this group using a link.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {inviteLink ? (
            <>
              <div className="flex items-center space-x-2">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="link" className="sr-only">
                    Link
                  </Label>
                  <Input
                    id="link"
                    defaultValue={inviteLink}
                    readOnly
                    onClick={handleInputClick}
                  />
                </div>
                <TooltipProvider>
                  <Tooltip open={hasCopied}>
                    <TooltipTrigger asChild className="h-full">
                      <Button
                        onClick={() => {
                          copyExistingLink();
                          track('group_invite_copied', {
                            groupId: giftGroup.id,
                            actorRole: viewer.role,
                            surface: 'modal',
                          });
                        }}
                        size="sm"
                        className="px-3"
                        aria-label="Copy invite link"
                      >
                        <span className="sr-only">Copy</span>
                        <Icon name="copy" className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copied to clipboard</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
                <DialogClose asChild>
                  <Button variant={'secondary'} type="button">
                    Cancel
                  </Button>
                </DialogClose>
                <DestroyInviteLinkButton />
              </DialogFooter>
            </>
          ) : (
            <CreateInviteForm />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Separate component so hooks only run when the form actually renders.
const CreateInviteForm = () => {
  const { giftGroup, viewer } = useLoaderData<typeof routeLoader>();
  const actionData = useActionData<typeof routeAction>();
  const isPending = useIsPending();
  const [form, fields] = useForm<z.input<typeof CreateInviteLinkFormSchema>>({
    id: GiftGroupIdFormIntent.CreateInviteLink,
    lastResult: actionData as unknown as SubmissionResult<string[]>,
    constraint: getZodConstraint(CreateInviteLinkFormSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: CreateInviteLinkFormSchema,
      }) as any;
    },
    defaultValue: { expiresInDays: '7' },
  });

  const expiresInDays = useInputControl(fields.expiresInDays);

  return (
    <>
      <Form method="POST" {...getFormProps(form)}>
        <input type="hidden" name="giftGroupId" value={giftGroup.id} />
        <div className="flex items-center">
          <div className="w-1/2">Link expires after</div>
          <div className="w-1/2">
            <Select
              value={expiresInDays.value}
              onValueChange={expiresInDays.change}
              defaultValue={fields.expiresInDays.initialValue}
              name={fields.expiresInDays.name}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an expiration time" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup
                  onFocus={expiresInDays.focus}
                  onBlur={expiresInDays.blur}
                >
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Form>
      <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
        <DialogClose asChild>
          <Button variant={'secondary'} type="button">
            Cancel
          </Button>
        </DialogClose>
        <StatusButton
          type="submit"
          name="intent"
          value={GiftGroupIdFormIntent.CreateInviteLink}
          variant="default"
          status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
          disabled={isPending}
          className=""
          form={form.id}
          onClick={() =>
            track('group_invite_regenerated', {
              groupId: giftGroup.id,
              actorRole: viewer.role,
              surface: 'modal',
            })
          }
        >
          Create link
        </StatusButton>
        <ErrorList errors={form.errors} id={form.errorId} />
      </DialogFooter>
    </>
  );
};

const DestroyInviteLinkButton = () => {
  const { giftGroup, groupInvitationId, viewer } =
    useLoaderData<typeof routeLoader>();
  const fetcher = useFetcher<typeof routeAction>();
  const [form] = useForm<z.input<typeof DestroyInviteLinkFormSchema>>({
    id: GiftGroupIdFormIntent.DestroyInviteLink,
    lastResult: fetcher.data as unknown as SubmissionResult<string[]>,
    constraint: getZodConstraint(DestroyInviteLinkFormSchema),
  });
  return (
    <fetcher.Form
      method="POST"
      {...getFormProps(form)}
      className="inline-block"
    >
      <input type="hidden" name="giftGroupId" value={giftGroup.id} />
      <input type="hidden" name="groupInvitationId" value={groupInvitationId} />
      <StatusButton
        status={
          fetcher.state === 'submitting' ? 'pending' : (form.status ?? 'idle')
        }
        disabled={fetcher.state !== 'idle'}
        value={GiftGroupIdFormIntent.DestroyInviteLink}
        form={form.id}
        variant="destructive"
        type="submit"
        name="intent"
        onClick={() =>
          track('group_invite_regenerated', {
            groupId: giftGroup.id,
            actorRole: viewer.role,
            surface: 'modal',
          })
        }
      >
        Destroy link
      </StatusButton>
    </fetcher.Form>
  );
};

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

const BirthdaysSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="h-12 animate-pulse rounded-md bg-muted/40" />
    ))}
  </div>
);

const MembersSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
    ))}
  </div>
);

const EmptyState = ({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: any;
}) => (
  <Card padding="md" className="rounded-xl border-dashed bg-muted/20">
    <CardContent className="flex items-center gap-3 text-sm">
      {icon ? <Icon name={icon} className="text-muted-foreground" /> : null}
      <div>
        <div className="font-medium">{title}</div>
        {description ? (
          <div className="text-muted-foreground">{description}</div>
        ) : null}
      </div>
    </CardContent>
  </Card>
);

function daysUntil(date: Date) {
  const today = new Date();
  const diff = Math.ceil(
    (date.getTime() -
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  return Math.max(diff, 0);
}

// activity helpers removed while activity is disabled

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
        <span className="hidden sm:inline-flex">
          {value > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label="Edit your budget"
            >
              ${dollars} <Icon name="pencil-1" className="ml-1" />
            </Button>
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
