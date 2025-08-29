import { getFormProps, useForm, useInputControl } from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { type GroupInvitation } from '@prisma/client';
import {
  type ActionFunctionArgs,
  json,
  type LoaderFunctionArgs,
} from '@remix-run/node';
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
} from '@remix-run/react';
import { useState } from 'react';

import { z } from 'zod';
import { ErrorList } from '#app/components/forms.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
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
import { Heading } from '#app/components/ui/heading.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { SectionSubtitle } from '#app/components/ui/sectionSubtitle';
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#app/components/ui/select.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Subheading } from '#app/components/ui/subheading.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#app/components/ui/tooltip.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
  createInviteLink,
  destroyInviteLink,
  getInviteLink,
} from '#app/utils/group-invitations.server.ts';
import { userHasGroupPermission } from '#app/utils/group-permissions.server.ts';
import {
  deleteGiftGroup,
  leaveGroup,
  requireUserIdInGroup,
  createGiftPlan,
  lockGiftPlan,
} from '#app/utils/groups.server.ts';
import { useDebounce, useIsPending } from '#app/utils/misc.tsx';
import {
  createToastHeaders,
  redirectWithToast,
} from '#app/utils/toast.server.ts';

export enum GiftGroupIdFormIntent {
  DeleteGiftGroup = 'delete-gift-group',
  CreateInviteLink = 'create-invite-link',
  DestroyInviteLink = 'destroy-invite-link',
  LeaveGiftGroup = 'leave-gift-group',
  PlanGift = 'plan-gift',
  LockPlan = 'lock-plan',
}

const DeleteFormSchema = z.object({
  intent: z.literal(GiftGroupIdFormIntent.DeleteGiftGroup),
  giftGroupId: z.string(),
});

export const CreateInviteLinkFormSchema = z.object({
  intent: z.literal(GiftGroupIdFormIntent.CreateInviteLink),
  giftGroupId: z.string(),
  expiresInDays: z.string(),
});

export const DestroyInviteLinkFormSchema = z.object({
  intent: z.literal(GiftGroupIdFormIntent.DestroyInviteLink),
  giftGroupId: z.string(),
  groupInvitationId: z.string(),
});

export const LeaveGroupFormSchema = z.object({
  intent: z.literal(GiftGroupIdFormIntent.LeaveGiftGroup),
  giftGroupId: z.string(),
});

const PlanGiftFormSchema = z.object({
  intent: z.literal(GiftGroupIdFormIntent.PlanGift),
  giftGroupId: z.string(),
  recipientUserId: z.string(),
  birthdayDate: z.string(),
});

const LockPlanFormSchema = z.object({
  intent: z.literal(GiftGroupIdFormIntent.LockPlan),
  giftGroupId: z.string(),
  planId: z.string(),
});

export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const userId = await requireUserIdInGroup(request, groupId);

  const giftGroup = await prisma.giftGroup.findUnique({
    where: { id: groupId },
    select: {
      name: true,
      description: true,
      id: true,
      budgetVisibility: true,
      groupMembers: {
        select: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              birthday: true,
              image: {
                select: {
                  id: true,
                  altText: true,
                },
              },
            },
          },
          role: true,
          contributionCents: true,
          budgetVisibilityOverride: true,
        },
      },
      giftPlans: {
        select: {
          id: true,
          recipientUserId: true,
          birthdayDate: true,
          status: true,
          lockedAt: true,
        },
      },
    },
  });

  if (!giftGroup) {
    throw new Response('Group not found', { status: 404 });
  }

  const canDelete = await userHasGroupPermission(
    userId,
    groupId,
    'deleteGroup',
  );
  const canInvite = await userHasGroupPermission(userId, groupId, 'manageInvites');
  const canLeave = await userHasGroupPermission(userId, groupId, 'leaveGroup');
  const canSettings = await userHasGroupPermission(userId, groupId, 'manageSettings');
  const canLockPlan = await userHasGroupPermission(userId, groupId, 'lockGiftPlan');

  const viewerMembership = await prisma.usersInGiftGroups.findUnique({
    where: { userId_giftGroupId: { userId, giftGroupId: groupId } },
    select: { role: true },
  });

  let existingInvitation: GroupInvitation | null = null;
  if (canInvite) {
    existingInvitation = await prisma.groupInvitation.findFirst({
      where: {
        giftGroupId: groupId,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  const activities = await prisma.groupActivity.findMany({
    where: { giftGroupId: groupId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, type: true, createdAt: true, actor: { select: { username: true } } },
  });

  return json({
    giftGroup,
    canInvite,
    canDelete,
    canLeave,
    canSettings,
    canLockPlan,
    viewer: { userId, role: viewerMembership?.role ?? 'MEMBER' as const },
    inviteLink: existingInvitation
      ? getInviteLink(existingInvitation.code)
      : null,
    groupInvitationId: existingInvitation?.id,
    activities,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUserId(request);
  const formData = await request.formData();

  const submission = parseWithZod(formData, {
    schema: DeleteFormSchema.or(CreateInviteLinkFormSchema)
      .or(DestroyInviteLinkFormSchema)
      .or(LeaveGroupFormSchema)
      .or(PlanGiftFormSchema)
      .or(LockPlanFormSchema),
  });

  if (submission.status !== 'success') {
    return json(submission.reply(), {
      status: submission.status === 'error' ? 400 : 200,
    });
  }

  const { giftGroupId } = submission.value;

  switch (submission.value.intent) {
    case GiftGroupIdFormIntent.DeleteGiftGroup:
      await deleteGiftGroup(request, submission.value);
      return redirectWithToast('/groups', {
        type: 'success',
        title: 'Success',
        description: 'Group has been deleted.',
      });

    case GiftGroupIdFormIntent.CreateInviteLink:
      await createInviteLink(request, submission.value);
      return json(submission.reply(), {
        headers: await createToastHeaders({
          description: 'Invite link has been created.',
          type: 'success',
        }),
      });

    case GiftGroupIdFormIntent.DestroyInviteLink:
      await destroyInviteLink(request, giftGroupId, submission.value);
      return json(submission.reply(), {
        headers: await createToastHeaders({
          description: 'Invite link has been destroyed.',
          type: 'success',
        }),
      });

    case GiftGroupIdFormIntent.LeaveGiftGroup:
      await leaveGroup(request, giftGroupId);

      return redirectWithToast('/groups', {
        type: 'success',
        title: 'Success',
        description: 'You have left the group.',
      });
    case GiftGroupIdFormIntent.PlanGift: {
      const { recipientUserId, birthdayDate } = submission.value;
      await createGiftPlan(request, giftGroupId, recipientUserId, new Date(birthdayDate));
      return json(submission.reply(), {
        headers: await createToastHeaders({ description: 'Gift plan created.', type: 'success' }),
      });
    }
    case GiftGroupIdFormIntent.LockPlan: {
      const { planId } = submission.value;
      await lockGiftPlan(request, giftGroupId, planId);
      return json(submission.reply(), {
        headers: await createToastHeaders({ description: 'Budget locked for plan.', type: 'success' }),
      });
    }
  }
}

const GiftGroupIndex = () => {
  const { giftGroup, canInvite, canDelete, canLeave, canSettings, viewer } =
    useLoaderData<typeof loader>();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionTitle>
        <div className="flex min-h-10 w-full content-between justify-between">
          <Heading>{giftGroup.name}</Heading>
          {(canInvite || canDelete || canLeave || canSettings) && (
            <div className="flex gap-1">
              {canInvite && <CreateInviteLinkDialog />}
              {canSettings && (
                <Button asChild variant={'secondary'}>
                  <Link to={`/groups/${giftGroup.id}/settings`}>
                    <Icon name="pencil-1">Settings</Icon>
                  </Link>
                </Button>
              )}
              {canDelete && <DeleteGroupDialog id={giftGroup.id} />}
              {canLeave && <LeaveGroupDialog id={giftGroup.id} />}
            </div>
          )}
        </div>
        <SectionSubtitle>
          <Subheading>{giftGroup.description}</Subheading>
        </SectionSubtitle>
      </SectionTitle>
      <div className="min-h-0 flex-1 overflow-y-auto pb-bottom-nav sm:pb-0">
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <section>
              <h2 className="mb-4 text-xl font-bold">Upcoming Birthdays</h2>
              <UpcomingBirthdays />
            </section>
            <section>
              <h2 className="mb-4 text-xl font-bold">Members & Budgets</h2>
              <MembersAndBudgets />
            </section>
          </div>
          <aside className="hidden md:block md:pl-4">
            <RightRail />
          </aside>
        </div>
      </div>
    </div>
  );
};

export default GiftGroupIndex;

function UpcomingBirthdays() {
  const { giftGroup, canLockPlan } = useLoaderData<typeof loader>();
  const items = giftGroup.groupMembers
    .filter((m) => !!m.user.birthday)
    .map((m) => {
      const bday = new Date(m.user.birthday as unknown as string);
      const today = new Date();
      const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
      const next = thisYear >= new Date(today.getFullYear(), today.getMonth(), today.getDate())
        ? thisYear
        : new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
      const plan = giftGroup.giftPlans.find((p) => p.recipientUserId === m.user.id);
      return { user: m.user, nextDate: next, plan };
    })
    .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
    .slice(0, 5);

  if (!items.length) {
    return <div className="text-sm text-muted-foreground">No upcoming birthdays. Create a gift plan from Settings.</div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map(({ user, nextDate, plan }) => (
        <div key={user.id} className="flex items-center gap-3 rounded-md border p-3">
          <Avatar user={user} image={user.image} size="s" />
          <div className="flex-1">
            <div className="font-medium">{user.username}</div>
            <div className="text-xs text-muted-foreground">{nextDate.toLocaleDateString()}</div>
          </div>
          {plan ? (
            plan.status === 'PLANNING' && canLockPlan ? (
              <Form method="post" className="flex items-center gap-2">
                <input type="hidden" name="giftGroupId" value={giftGroup.id} />
                <input type="hidden" name="planId" value={plan.id} />
                <StatusButton status="idle" name="intent" value={GiftGroupIdFormIntent.LockPlan} variant="secondary">Lock</StatusButton>
              </Form>
            ) : (
              <div className="text-xs rounded bg-muted px-2 py-0.5">{plan.status}</div>
            )
          ) : (
            <Form method="post" className="flex items-center gap-2">
              <input type="hidden" name="giftGroupId" value={giftGroup.id} />
              <input type="hidden" name="recipientUserId" value={user.id} />
              <input type="hidden" name="birthdayDate" value={nextDate.toISOString()} />
              <StatusButton status="idle" name="intent" value={GiftGroupIdFormIntent.PlanGift}>Plan Gift</StatusButton>
            </Form>
          )}
        </div>
      ))}
    </div>
  );
}

function MembersAndBudgets() {
  const { giftGroup, viewer } = useLoaderData<typeof loader>();
  return (
    <div className="flex flex-col gap-4">
      {giftGroup.groupMembers.map((groupMember) => {
        const isSelf = groupMember.user.id === viewer.userId;
        const effectiveVisibility =
          groupMember.budgetVisibilityOverride || giftGroup.budgetVisibility;
        const isAdminViewer = viewer.role === 'OWNER' || viewer.role === 'ADMIN';
        const visible =
          effectiveVisibility === 'EVERYONE' ||
          (effectiveVisibility === 'ADMINS' && (isAdminViewer || isSelf)) ||
          (effectiveVisibility === 'ONLY_SELF' && isSelf);
        return (
          <Link
            to={`/users/${groupMember.user.username}`}
            className="flex items-center gap-2 rounded-md border p-2"
            key={groupMember.user.id}
          >
            <Avatar size={'s'} image={groupMember.user.image} user={groupMember.user} />
            <div className="text-body-md">{groupMember.user.username}</div>
            <div className="ml-auto text-sm text-muted-foreground">
              {visible ? `$${(groupMember.contributionCents / 100).toFixed(2)}` : 'Hidden'}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function RightRail() {
  const { canInvite, inviteLink, activities } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-6">
      {canInvite ? (
        <div className="rounded-md border p-3">
          <div className="mb-2 font-semibold">Invite</div>
          {inviteLink ? (
            <div className="space-y-2">
              <div className="text-sm">Use this link to invite others:</div>
              <Input readOnly value={inviteLink} onClick={(e) => (e.currentTarget as HTMLInputElement).select()} />
            </div>
          ) : (
            <div className="text-sm">Use the Invite button in the header to create a link.</div>
          )}
        </div>
      ) : null}
      <div className="rounded-md border p-3" data-testid="panel-activity">
        <div className="mb-2 font-semibold">Recent Activity</div>
        <ul className="space-y-1 text-sm">
          {activities.map((a) => (
            <li key={a.id}>
              <span className="text-muted-foreground">[{new Date(a.createdAt).toLocaleString()}]</span> {a.actor.username} {a.type}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const CreateInviteLinkDialog = () => {
  const { inviteLink, giftGroup } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [form, fields] = useForm({
    id: GiftGroupIdFormIntent.CreateInviteLink,
    lastResult: actionData,
    constraint: getZodConstraint(CreateInviteLinkFormSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: CreateInviteLinkFormSchema });
    },
    defaultValue: {
      expiresInDays: '7',
    },
  });

  const expiresInDays = useInputControl(fields.expiresInDays);

  const [hasCopied, setHasCopied] = useState(false);

  const debouncedReset = useDebounce(() => setHasCopied(false), 2000);

  const copyLink = () => {
    setHasCopied(true);
    debouncedReset();
    void navigator.clipboard.writeText(inviteLink!);
  };

  const handleInputClick = (
    event: React.MouseEvent<HTMLInputElement, MouseEvent>,
  ) => {
    event.currentTarget.select();
    copyLink();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={'default'}>
          <Icon name="link-2" className="scale-125 max-md:scale-150">
            <span className="max-md:hidden">Invite</span>
          </Icon>
        </Button>
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
                    <Button onClick={copyLink} size="sm" className="px-3">
                      <span className="sr-only">Copy</span>
                      <Icon name="copy" className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copied to clipboard</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
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
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant={'secondary'} type="button">
                Cancel
              </Button>
            </DialogClose>
            {inviteLink ? (
              <DestroyInviteLinkButton />
            ) : (
              <StatusButton
                type="submit"
                name="intent"
                value={GiftGroupIdFormIntent.CreateInviteLink}
                variant="default"
                status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
                disabled={isPending}
                className="max-md:aspect-square max-md:px-0"
                form={form.id}
              >
                Create link
              </StatusButton>
            )}
            <ErrorList errors={form.errors} id={form.errorId} />
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DestroyInviteLinkButton = () => {
  const { giftGroup, groupInvitationId } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [form] = useForm({
    id: GiftGroupIdFormIntent.DestroyInviteLink,
    lastResult: fetcher.data,
    constraint: getZodConstraint(DestroyInviteLinkFormSchema),
  });
  return (
    <fetcher.Form method="POST" {...getFormProps(form)}>
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
      >
        Destroy link
      </StatusButton>
    </fetcher.Form>
  );
};

const DeleteGroupDialog = ({ id }: { id: string }) => {
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [form] = useForm({
    id: GiftGroupIdFormIntent.DeleteGiftGroup,
    lastResult: actionData,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={'destructive'}>
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
};

const LeaveGroupDialog = ({ id }: { id: string }) => {
  const actionData = useActionData<typeof action>();
  const isPending = useIsPending();
  const [form] = useForm({
    id: GiftGroupIdFormIntent.LeaveGiftGroup,
    lastResult: actionData,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={'destructive'}>
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
};
