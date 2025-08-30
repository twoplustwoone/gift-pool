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
  useNavigation,
} from '@remix-run/react';
import { useState } from 'react';

import { z } from 'zod';
import { ErrorList } from '#app/components/forms.tsx';
import { ActivityFeedCard } from '#app/components/groups/ActivityFeedCard.tsx';
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
import { track } from '#app/utils/analytics.client.ts';
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
  const canInvite = await userHasGroupPermission(
    userId,
    groupId,
    'manageInvites',
  );
  const canLeave = await userHasGroupPermission(userId, groupId, 'leaveGroup');
  const canSettings = await userHasGroupPermission(
    userId,
    groupId,
    'manageSettings',
  );
  const canLockPlan = await userHasGroupPermission(
    userId,
    groupId,
    'lockGiftPlan',
  );

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

  const url = new URL(request.url);
  const activityTake = Math.min(
    Math.max(parseInt(url.searchParams.get('activity_take') ?? '10', 10), 1),
    50,
  );
  const activities = await prisma.groupActivity.findMany({
    where: { giftGroupId: groupId },
    orderBy: { createdAt: 'desc' },
    take: activityTake,
    select: {
      id: true,
      type: true,
      createdAt: true,
      actor: { select: { username: true } },
    },
  });

  return json({
    giftGroup,
    canInvite,
    canDelete,
    canLeave,
    canSettings,
    canLockPlan,
    viewer: { userId, role: viewerMembership?.role ?? ('MEMBER' as const) },
    inviteLink: existingInvitation
      ? getInviteLink(existingInvitation.code, request)
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
      await createGiftPlan(
        request,
        giftGroupId,
        recipientUserId,
        new Date(birthdayDate),
      );
      return json(submission.reply(), {
        headers: await createToastHeaders({
          description: 'Gift plan created.',
          type: 'success',
        }),
      });
    }
    case GiftGroupIdFormIntent.LockPlan: {
      const { planId } = submission.value;
      await lockGiftPlan(request, giftGroupId, planId);
      return json(submission.reply(), {
        headers: await createToastHeaders({
          description: 'Budget locked for plan.',
          type: 'success',
        }),
      });
    }
  }
}

const GiftGroupIndex = () => {
  const { giftGroup, canInvite, canDelete, canLeave, canSettings, viewer } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== 'idle';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-6 p-4 sm:space-y-8 sm:p-6">
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
              label: 'Total pledged',
              value: `$${(giftGroup.groupMembers.reduce((s, m) => s + m.contributionCents, 0) / 100).toFixed(2)}`,
            },
          ]}
          actions={
            canInvite || canDelete || canLeave || canSettings ? (
              <div className="flex items-center gap-2">
                {canInvite && <CreateInviteLinkDialog />}
                <GroupActions
                  giftGroupId={giftGroup.id}
                  canSettings={canSettings}
                  canLeave={canLeave}
                  canDelete={canDelete}
                />
              </div>
            ) : null
          }
        />
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card padding="lg" data-testid="panel-birthdays">
              <h2 className="mb-4 text-lg font-semibold tracking-tight sm:text-xl">
                Upcoming Birthdays
              </h2>
              {isLoading ? <BirthdaysSkeleton /> : <UpcomingBirthdays />}
            </Card>
            <Card padding="lg" data-testid="panel-members">
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
          <div className="fixed bottom-5 right-4 z-20 md:hidden">
            <CreateInviteLinkDialog asFab />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default GiftGroupIndex;

const QuickStat = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-center">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-base font-semibold">{value}</div>
  </div>
);

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
  const { giftGroup, canLockPlan } = useLoaderData<typeof loader>();
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
      {items.map(({ user, nextDate, plan }) => (
        <div
          key={user.id}
          className="border-subcard-border bg-subcard flex items-center gap-3 rounded-xl border p-3"
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
          {plan ? (
            plan.status === 'PLANNING' && canLockPlan ? (
              <Form method="post" className="flex items-center gap-2">
                <input type="hidden" name="giftGroupId" value={giftGroup.id} />
                <input type="hidden" name="planId" value={plan.id} />
                <StatusButton
                  status="idle"
                  name="intent"
                  value={GiftGroupIdFormIntent.LockPlan}
                  variant="secondary"
                >
                  Lock
                </StatusButton>
              </Form>
            ) : (
              <div className="rounded bg-muted px-2 py-0.5 text-xs">
                {plan.status}
              </div>
            )
          ) : (
            <Form
              method="post"
              className="flex items-center gap-2"
              onSubmit={() =>
                track('group_plan_gift_clicked', {
                  groupId: giftGroup.id,
                  memberId: user.id,
                })
              }
            >
              <input type="hidden" name="giftGroupId" value={giftGroup.id} />
              <input type="hidden" name="recipientUserId" value={user.id} />
              <input
                type="hidden"
                name="birthdayDate"
                value={nextDate.toISOString()}
              />
              <StatusButton
                status="idle"
                name="intent"
                value={GiftGroupIdFormIntent.PlanGift}
              >
                Plan Gift
              </StatusButton>
            </Form>
          )}
        </div>
      ))}
    </div>
  );
};

const MembersAndBudgets = () => {
  const { giftGroup, viewer } = useLoaderData<typeof loader>();
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
            className="border-subcard-border bg-subcard flex items-center gap-3 rounded-xl border p-2"
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
              <div className="text-body-md">{groupMember.user.username}</div>
            </Link>
            <div className="ml-auto text-sm text-muted-foreground">
              {visible ? (
                isSelf ? (
                  <InlineBudgetEditor
                    giftGroupId={giftGroup.id}
                    initialCents={groupMember.contributionCents}
                  />
                ) : (
                  `$${(groupMember.contributionCents / 100).toFixed(2)}`
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
  const { canInvite, inviteLink, activities, giftGroup, viewer } =
    useLoaderData<typeof loader>();
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
      <ActivityFeedCard
        items={activities.map((a) => ({
          id: a.id,
          icon: activityIcon(a.type),
          text: humanizeActivity(a.type, a.actor.username),
          timestamp: new Date(a.createdAt).toLocaleString(),
        }))}
        loadMore={
          <Button asChild variant="secondary" size="sm">
            <Link to={`?activity_take=20`} prefetch="intent">
              Load more
            </Link>
          </Button>
        }
      />
    </div>
  );
};

const CreateInviteLinkDialog = ({ asFab = false }: { asFab?: boolean }) => {
  const { inviteLink, giftGroup, viewer } = useLoaderData<typeof loader>();
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
        {asFab ? (
          <Button
            variant="default"
            size="sm"
            className="rounded-full shadow-lg"
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
                        copyLink();
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
            )}
            <ErrorList errors={form.errors} id={form.errorId} />
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DestroyInviteLinkButton = () => {
  const { giftGroup, groupInvitationId, viewer } =
    useLoaderData<typeof loader>();
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
};

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

import { type IconName } from '@/icon-name';

const EmptyState = ({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: IconName;
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

function humanizeActivity(type: string, actor: string) {
  const map: Record<string, string> = {
    'invite.create': 'created an invite link',
    'invite.revoke': 'revoked an invite link',
    'group.delete': 'deleted the group',
    'member.remove': 'removed a member',
    'member.promote': 'promoted a member to admin',
    'member.demote': 'demoted an admin to member',
    'reminder.add': 'added a reminder',
    'reminder.remove': 'removed a reminder',
    'giftplan.create': 'created a gift plan',
    'giftplan.lock': 'locked a gift plan',
    'giftplan.unlock': 'unlocked a gift plan',
    'settings.update': 'updated settings',
    'member.update-self': 'updated their preferences',
    'join.approve': 'approved a join request',
    'join.reject': 'rejected a join request',
  };
  return `${actor} ${map[type] ?? type}`;
}

function activityIcon(type: string): IconName {
  if (type.startsWith('invite.')) return 'link-2';
  if (type.startsWith('giftplan.lock')) return 'lock-closed';
  if (type.startsWith('giftplan.')) return 'check';
  if (type.startsWith('member.')) return 'person';
  if (type.startsWith('group.delete')) return 'trash';
  if (type.startsWith('settings.')) return 'pencil-1';
  if (type.startsWith('join.')) return 'avatar';
  return 'update';
}

const InlineBudgetEditor = ({
  giftGroupId,
  initialCents,
}: {
  giftGroupId: string;
  initialCents: number;
}) => {
  const fetcher = useFetcher();
  const [value, setValue] = useState<string>((initialCents / 100).toFixed(2));
  const pending = fetcher.state !== 'idle';
  return (
    <fetcher.Form
      method="post"
      action={`/groups/${giftGroupId}/settings`}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="intent" value="member-update-self" />
      <input type="hidden" name="giftGroupId" value={giftGroupId} />
      <label className="sr-only" htmlFor="budget-input">
        Budget
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input
          id="budget-input"
          name="contributionCents"
          inputMode="decimal"
          aria-label="Set your budget"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          className="w-24 pl-5"
          onBlur={(e) => {
            // Convert dollars to cents for server
            const dollars = parseFloat(e.currentTarget.value || '0');
            const cents = Math.round(dollars * 100);
            // replace value with dollars fixed
            setValue((cents / 100).toFixed(2));
          }}
        />
      </div>
      {Math.round(parseFloat(value || '0') * 100) !== initialCents ? (
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          name="contributionCents"
          value={String(Math.round(parseFloat(value || '0') * 100))}
          disabled={pending}
          onClick={() => track('group_budget_saved', { groupId: giftGroupId })}
        >
          Save
        </Button>
      ) : null}
    </fetcher.Form>
  );
};
