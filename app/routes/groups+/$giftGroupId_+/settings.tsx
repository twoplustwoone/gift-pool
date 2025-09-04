import { getFormProps, useForm } from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
// Using string literal types for roles/visibility to support SQLite
import {
  type ActionFunctionArgs,
  json,
  type LoaderFunctionArgs,
} from '@remix-run/node';
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react';
import * as React from 'react';
import { z } from 'zod';
import { ErrorList } from '#app/components/forms.tsx';
import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import { CopyableField } from '#app/components/ui/copyable-field.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#app/components/ui/select.tsx';
// import { StatusButton } from '#app/components/ui/status-button.tsx';
import { prisma } from '#app/utils/db.server.ts';
import {
  createInviteLink,
  destroyInviteLink,
  getInviteLink,
} from '#app/utils/group-invitations.server.ts';
import { userHasGroupPermission } from '#app/utils/group-permissions.server.ts';
import {
  requireUserIdInGroup,
  addReminder,
  approveJoinRequest,
  banMember,
  rejectJoinRequest,
  removeMember,
  removeReminder,
  transferOwnership,
  updateGroupSettings,
  createGiftPlan,
  lockGiftPlan,
  unlockGiftPlan,
  promoteToAdmin,
  demoteAdminToMember,
  updateOwnPreferences,
  deleteGiftGroup,
} from '#app/utils/groups.server.ts';
import { createToastHeaders } from '#app/utils/toast.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const userId = await requireUserIdInGroup(request, groupId);

  const giftGroupRaw = await prisma.giftGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      description: true,
      budgetVisibility: true,
      groupMembers: {
        select: {
          userId: true,
          role: true,
          bannedUntil: true,
          contributionCents: true,
          budgetVisibilityOverride: true,
          shareWishlist: true,
          shareBirthday: true,
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              image: { select: { id: true, altText: true } },
            },
          },
        },
      },
      reminders: { select: { id: true, offsetDays: true } },
      groupInvitations: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: {
          id: true,
          code: true,
          label: true,
          roleGranted: true,
          maxUses: true,
          usedCount: true,
          requireApproval: true,
          expiresAt: true,
        },
      },
      giftPlans: {
        select: {
          id: true,
          status: true,
          birthdayDate: true,
          lockedAt: true,
          lockedById: true,
          recipient: { select: { id: true, username: true, name: true } },
        },
      },
    },
  });

  if (!giftGroupRaw) throw new Response('Group not found', { status: 404 });
  const giftGroup = {
    ...giftGroupRaw,
    groupInvitations: giftGroupRaw.groupInvitations.map((inv) => ({
      ...inv,
      url: getInviteLink(inv.code, request),
    })),
  };

  const canManageInvites = await userHasGroupPermission(
    userId,
    groupId,
    'manageInvites',
  );
  const canManageSettings = await userHasGroupPermission(
    userId,
    groupId,
    'manageSettings',
  );
  const canPromote = await userHasGroupPermission(
    userId,
    groupId,
    'promoteAdmin',
  );
  const canDemote = await userHasGroupPermission(
    userId,
    groupId,
    'demoteAdmin',
  );
  const canRemove = await userHasGroupPermission(
    userId,
    groupId,
    'removeMember',
  );
  const canBan = await userHasGroupPermission(userId, groupId, 'banMember');
  const canTransfer = await userHasGroupPermission(
    userId,
    groupId,
    'transferOwnership',
  );
  const canDelete = await userHasGroupPermission(
    userId,
    groupId,
    'deleteGroup',
  );

  const joinRequests = await prisma.joinRequest.findMany({
    where: { giftGroupId: groupId, status: 'PENDING' },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          image: { select: { id: true, altText: true } },
        },
      },
    },
  });

  const viewerMember = await prisma.usersInGiftGroups.findUnique({
    where: { userId_giftGroupId: { userId, giftGroupId: groupId } },
    select: {
      userId: true,
      role: true,
      contributionCents: true,
      budgetVisibilityOverride: true,
      shareWishlist: true,
      shareBirthday: true,
    },
  });

  const activities = await prisma.groupActivity.findMany({
    where: { giftGroupId: groupId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      type: true,
      payload: true,
      createdAt: true,
      actor: { select: { username: true } },
    },
  });

  return json({
    giftGroup,
    canManageInvites,
    canManageSettings,
    canPromote,
    canDemote,
    canRemove,
    canBan,
    canTransfer,
    canDelete,
    joinRequests,
    viewerMember,
    activities,
  });
}

export enum SettingsIntent {
  UpdateSettings = 'update-settings',
  InviteCreate = 'invite-create',
  InviteRevoke = 'invite-revoke',
  JoinApprove = 'join-approve',
  JoinReject = 'join-reject',
  MemberRemove = 'member-remove',
  MemberBan = 'member-ban',
  MemberUnban = 'member-unban',
  OwnershipTransfer = 'ownership-transfer',
  ReminderAdd = 'reminder-add',
  ReminderRemove = 'reminder-remove',
  GiftPlanCreate = 'giftplan-create',
  GiftPlanLock = 'giftplan-lock',
  GiftPlanUnlock = 'giftplan-unlock',
  MemberPromoteAdmin = 'member-promote-admin',
  MemberDemoteMember = 'member-demote-member',
  MemberUpdateSelf = 'member-update-self',
  DeleteGroup = 'delete-group',
}

const UpdateSettingsSchema = z.object({
  intent: z.literal(SettingsIntent.UpdateSettings),
  giftGroupId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  budgetVisibility: z.enum(['EVERYONE', 'ADMINS', 'ONLY_SELF']),
});

const InviteCreateSchema = z.object({
  intent: z.literal(SettingsIntent.InviteCreate),
  giftGroupId: z.string(),
  label: z.string().optional(),
  roleGranted: z.enum(['OWNER', 'ADMIN', 'MEMBER']).optional(),
  expiresInDays: z.string(),
  maxUses: z.string().optional(),
  requireApproval: z.string().optional(),
});

const InviteRevokeSchema = z.object({
  intent: z.literal(SettingsIntent.InviteRevoke),
  giftGroupId: z.string(),
  groupInvitationId: z.string(),
});

const JoinApproveSchema = z.object({
  intent: z.literal(SettingsIntent.JoinApprove),
  giftGroupId: z.string(),
  joinRequestId: z.string(),
});

const JoinRejectSchema = z.object({
  intent: z.literal(SettingsIntent.JoinReject),
  giftGroupId: z.string(),
  joinRequestId: z.string(),
  reason: z.string().optional(),
});

const MemberRemoveSchema = z.object({
  intent: z.literal(SettingsIntent.MemberRemove),
  giftGroupId: z.string(),
  memberUserId: z.string(),
  reason: z.string().optional(),
});

const MemberBanSchema = z.object({
  intent: z.literal(SettingsIntent.MemberBan),
  giftGroupId: z.string(),
  memberUserId: z.string(),
  until: z.string().optional(), // ISO date or empty => unban
});

const MemberPromoteAdminSchema = z.object({
  intent: z.literal(SettingsIntent.MemberPromoteAdmin),
  giftGroupId: z.string(),
  memberUserId: z.string(),
});

const MemberDemoteMemberSchema = z.object({
  intent: z.literal(SettingsIntent.MemberDemoteMember),
  giftGroupId: z.string(),
  memberUserId: z.string(),
});

const MemberUpdateSelfSchema = z.object({
  intent: z.literal(SettingsIntent.MemberUpdateSelf),
  giftGroupId: z.string(),
  contributionCents: z.string().optional(),
  // Use 'INHERIT' sentinel instead of empty string to avoid Select empty value issues
  budgetVisibilityOverride: z
    .enum(['INHERIT', 'EVERYONE', 'ADMINS', 'ONLY_SELF'])
    .optional(),
  shareWishlist: z.string().optional(),
  shareBirthday: z.string().optional(),
});

const OwnershipTransferSchema = z.object({
  intent: z.literal(SettingsIntent.OwnershipTransfer),
  giftGroupId: z.string(),
  newOwnerUserId: z.string(),
});

const ReminderAddSchema = z.object({
  intent: z.literal(SettingsIntent.ReminderAdd),
  giftGroupId: z.string(),
  offsetDays: z.string(),
});

const ReminderRemoveSchema = z.object({
  intent: z.literal(SettingsIntent.ReminderRemove),
  giftGroupId: z.string(),
  reminderId: z.string(),
});
const DeleteGroupSchema = z.object({
  intent: z.literal(SettingsIntent.DeleteGroup),
  giftGroupId: z.string(),
});

const GiftPlanCreateSchema = z.object({
  intent: z.literal(SettingsIntent.GiftPlanCreate),
  giftGroupId: z.string(),
  recipientUsername: z.string().min(1),
  birthdayDate: z.string(),
});

const GiftPlanLockSchema = z.object({
  intent: z.literal(SettingsIntent.GiftPlanLock),
  giftGroupId: z.string(),
  planId: z.string(),
});

const GiftPlanUnlockSchema = z.object({
  intent: z.literal(SettingsIntent.GiftPlanUnlock),
  giftGroupId: z.string(),
  planId: z.string(),
  reason: z.string().optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const submission = parseWithZod(formData, {
    schema: UpdateSettingsSchema.or(InviteCreateSchema)
      .or(InviteRevokeSchema)
      .or(JoinApproveSchema)
      .or(JoinRejectSchema)
      .or(MemberRemoveSchema)
      .or(MemberBanSchema)
      .or(OwnershipTransferSchema)
      .or(ReminderAddSchema)
      .or(ReminderRemoveSchema)
      .or(GiftPlanCreateSchema)
      .or(GiftPlanLockSchema)
      .or(GiftPlanUnlockSchema)
      .or(MemberPromoteAdminSchema)
      .or(MemberDemoteMemberSchema)
      .or(MemberUpdateSelfSchema)
      .or(DeleteGroupSchema),
  });

  if (submission.status !== 'success') {
    return json(submission.reply(), {
      status: submission.status === 'error' ? 400 : 200,
    });
  }

  const v = submission.value;
  switch (v.intent) {
    case SettingsIntent.UpdateSettings: {
      await updateGroupSettings(request, v.giftGroupId, {
        name: v.name,
        description: v.description,
        budgetVisibility: v.budgetVisibility,
      });
      return json(submission.reply());
    }
    case SettingsIntent.InviteCreate: {
      await createInviteLink(request, v);
      return json(submission.reply());
    }
    case SettingsIntent.InviteRevoke: {
      await destroyInviteLink(request, v.giftGroupId, {
        groupInvitationId: v.groupInvitationId,
      });
      return json(submission.reply());
    }
    case SettingsIntent.JoinApprove: {
      await approveJoinRequest(request, v.giftGroupId, v.joinRequestId);
      return json(submission.reply());
    }
    case SettingsIntent.JoinReject: {
      await rejectJoinRequest(
        request,
        v.giftGroupId,
        v.joinRequestId,
        v.reason,
      );
      return json(submission.reply());
    }
    case SettingsIntent.MemberRemove: {
      await removeMember(request, v.giftGroupId, v.memberUserId, v.reason);
      return json(submission.reply());
    }
    case SettingsIntent.MemberBan: {
      const until = v.until ? new Date(v.until) : null;
      await banMember(request, v.giftGroupId, v.memberUserId, until);
      return json(submission.reply());
    }
    case SettingsIntent.OwnershipTransfer: {
      await transferOwnership(request, v.giftGroupId, v.newOwnerUserId);
      return json(submission.reply());
    }
    case SettingsIntent.MemberPromoteAdmin: {
      await promoteToAdmin(request, v.giftGroupId, v.memberUserId);
      return json(submission.reply());
    }
    case SettingsIntent.MemberDemoteMember: {
      await demoteAdminToMember(request, v.giftGroupId, v.memberUserId);
      return json(submission.reply());
    }
    case SettingsIntent.MemberUpdateSelf: {
      await updateOwnPreferences(request, v.giftGroupId, {
        contributionCents: v.contributionCents
          ? parseInt(v.contributionCents, 10)
          : undefined,
        budgetVisibilityOverride: (v.budgetVisibilityOverride ??
          'INHERIT') as any,
        shareWishlist: v.shareWishlist === 'on' ? true : undefined,
        shareBirthday: v.shareBirthday === 'on' ? true : undefined,
      });
      return json(submission.reply(), {
        headers: await createToastHeaders({
          type: 'success',
          title: 'Saved',
          description: 'Your preferences have been saved.',
        }),
      });
    }
    case SettingsIntent.DeleteGroup: {
      await deleteGiftGroup(request, { giftGroupId: v.giftGroupId });
      return json(submission.reply());
    }
    case SettingsIntent.ReminderAdd: {
      await addReminder(request, v.giftGroupId, parseInt(v.offsetDays, 10));
      return json(submission.reply());
    }
    case SettingsIntent.ReminderRemove: {
      await removeReminder(request, v.giftGroupId, v.reminderId);
      return json(submission.reply());
    }
    case SettingsIntent.GiftPlanCreate: {
      const user = await prisma.user.findUnique({
        where: { username: v.recipientUsername },
      });
      if (!user) return json({ message: 'User not found' }, { status: 400 });
      await createGiftPlan(
        request,
        v.giftGroupId,
        user.id,
        new Date(v.birthdayDate),
      );
      return json(submission.reply());
    }
    case SettingsIntent.GiftPlanLock: {
      await lockGiftPlan(request, v.giftGroupId, v.planId);
      return json(submission.reply());
    }
    case SettingsIntent.GiftPlanUnlock: {
      await unlockGiftPlan(request, v.giftGroupId, v.planId, v.reason);
      return json(submission.reply());
    }
  }
}

const GroupSettingsRoute = () => {
  const {
    giftGroup,
    canManageInvites,
    canManageSettings,
    joinRequests,
    canPromote,
    canDemote,
    canRemove,
    canBan,
    canTransfer,
    canDelete,
    viewerMember,
    activities,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [activeTab, setActiveTab] = React.useState<
    'members' | 'privacy' | 'reminders' | 'invites' | 'danger'
  >('members');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionTitle>
        <Heading>Settings — {giftGroup.name}</Heading>
        <Button asChild>
          <Link to={`/groups/${giftGroup.id}`}>Back to Group</Link>
        </Button>
      </SectionTitle>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex gap-2">
          {(
            [
              ['members', 'Members'],
              ['privacy', 'Permissions & Privacy'],
              ['reminders', 'Reminders'],
              ['invites', 'Invite Links'],
              ['danger', 'Danger Zone'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              variant={activeTab === id ? 'default' : 'secondary'}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {activeTab === 'members' && (
          <>
            <h2 className="mb-2 text-lg font-bold">Members</h2>
            <ul className="divide-y divide-border rounded-md border">
              {giftGroup.groupMembers.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 p-3">
                  <Avatar user={m.user} image={m.user.image} size="s" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {m.user.username}
                      <RoleBadge role={m.role} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Budget ${(m.contributionCents / 100).toFixed(2)}
                    </div>
                  </div>
                  {canPromote && m.role === 'MEMBER' && (
                    <Form method="post">
                      <input
                        type="hidden"
                        name="giftGroupId"
                        value={giftGroup.id}
                      />
                      <input
                        type="hidden"
                        name="memberUserId"
                        value={m.userId}
                      />
                      <Button
                        name="intent"
                        value={SettingsIntent.MemberPromoteAdmin}
                      >
                        Promote to Admin
                      </Button>
                    </Form>
                  )}
                  {canDemote && m.role === 'ADMIN' && (
                    <Form method="post">
                      <input
                        type="hidden"
                        name="giftGroupId"
                        value={giftGroup.id}
                      />
                      <input
                        type="hidden"
                        name="memberUserId"
                        value={m.userId}
                      />
                      <Button
                        variant="secondary"
                        name="intent"
                        value={SettingsIntent.MemberDemoteMember}
                      >
                        Demote
                      </Button>
                    </Form>
                  )}
                  {(canRemove || canBan) && (
                    <MemberActions
                      giftGroupId={giftGroup.id}
                      memberUserId={m.userId}
                      bannedUntil={m.bannedUntil}
                      canRemove={canRemove}
                      canBan={canBan}
                    />
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <h3 className="mb-2 text-base font-semibold">Your Preferences</h3>
              <MemberPreferencesForm
                giftGroupId={giftGroup.id}
                prefs={viewerMember}
              />
            </div>

            <div className="mt-6">
              <h3 className="mb-2 text-base font-semibold">Recent Activity</h3>
              <ul className="space-y-1 text-sm">
                {activities.map((a) => (
                  <li key={a.id}>
                    <span className="text-muted-foreground">
                      [{new Date(a.createdAt).toLocaleString()}]
                    </span>{' '}
                    <span className="font-medium">{a.actor.username}</span>{' '}
                    {a.type}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {activeTab === 'privacy' && canManageSettings && (
          <>
            <h2 className="mb-2 text-lg font-bold">Permissions & Privacy</h2>
            <SettingsForm giftGroup={giftGroup} lastResult={actionData} />
          </>
        )}

        {activeTab === 'reminders' && (
          <>
            <h2 className="mb-2 text-lg font-bold">Reminders</h2>
            <RemindersSection giftGroup={giftGroup} />
          </>
        )}

        {activeTab === 'invites' && canManageInvites && (
          <>
            <h2 className="mb-2 text-lg font-bold">Invite Links</h2>
            <InviteCreateForm
              giftGroupId={giftGroup.id}
              lastResult={actionData}
            />
            <div className="mt-4 space-y-2">
              {giftGroup.groupInvitations.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="font-medium">{inv.label || 'Invite'}</div>
                    <div className="text-sm text-muted-foreground">
                      Role {inv.roleGranted} · Uses {inv.usedCount}
                      {inv.maxUses ? ` / ${inv.maxUses}` : ''} ·{' '}
                      {inv.requireApproval ? 'Requires approval' : 'Auto-join'}
                    </div>
                    <CopyableField value={inv.url} />
                  </div>
                  <Form method="post">
                    <input
                      type="hidden"
                      name="giftGroupId"
                      value={giftGroup.id}
                    />
                    <input
                      type="hidden"
                      name="groupInvitationId"
                      value={inv.id}
                    />
                    <Button
                      type="submit"
                      name="intent"
                      value={SettingsIntent.InviteRevoke}
                      variant="destructive"
                    >
                      Revoke
                    </Button>
                  </Form>
                </div>
              ))}
            </div>

            {joinRequests.length ? (
              <div className="mt-8">
                <h3 className="mb-2 text-base font-semibold">
                  Pending Join Requests
                </h3>
                <ul className="space-y-2">
                  {joinRequests.map((jr) => (
                    <li
                      key={jr.id}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <Avatar user={jr.user} image={jr.user.image} size="s" />
                      <div className="flex-1 text-sm">{jr.user.username}</div>
                      <Form method="post" className="flex items-center gap-2">
                        <input
                          type="hidden"
                          name="giftGroupId"
                          value={giftGroup.id}
                        />
                        <input
                          type="hidden"
                          name="joinRequestId"
                          value={jr.id}
                        />
                        <Button
                          name="intent"
                          value={SettingsIntent.JoinApprove}
                          variant="default"
                        >
                          Approve
                        </Button>
                        <Button
                          name="intent"
                          value={SettingsIntent.JoinReject}
                          variant="secondary"
                        >
                          Reject
                        </Button>
                      </Form>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}

        {activeTab === 'danger' && (
          <>
            <h2 className="mb-2 text-lg font-bold text-destructive">
              Danger Zone
            </h2>
            {canTransfer ? (
              <section className="mb-6 rounded-md border p-3">
                <h3 className="mb-2 font-semibold">Transfer Ownership</h3>
                <TransferOwnershipForm giftGroup={giftGroup} />
              </section>
            ) : null}
            {canDelete ? (
              <section className="rounded-md border p-3">
                <h3 className="mb-2 font-semibold">Delete Group</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Deleting a group permanently removes all memberships, invite
                  links, reminders and gift plans. This action cannot be undone.
                </p>
                <Form method="post" id="delete-group-form">
                  <input
                    type="hidden"
                    name="giftGroupId"
                    value={giftGroup.id}
                  />
                  <input
                    type="hidden"
                    name="intent"
                    value={SettingsIntent.DeleteGroup}
                  />
                </Form>
                <ConfirmDialog
                  title="Delete Group"
                  description={
                    <div>Type DELETE to confirm. This cannot be undone.</div>
                  }
                  confirmText="Delete"
                  requireText="DELETE"
                  onConfirm={() => {
                    const form = document.getElementById(
                      'delete-group-form',
                    ) as HTMLFormElement;
                    form?.requestSubmit();
                  }}
                >
                  <Button variant="destructive">Delete Group</Button>
                </ConfirmDialog>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default GroupSettingsRoute;

const SettingsForm = ({
  giftGroup,
  lastResult,
}: {
  giftGroup: any;
  lastResult: any;
}) => {
  const [form] = useForm({
    id: 'settings-form',
    lastResult,
    constraint: getZodConstraint(UpdateSettingsSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: UpdateSettingsSchema });
    },
    defaultValue: {
      name: giftGroup.name,
      description: giftGroup.description,
      budgetVisibility: giftGroup.budgetVisibility,
    },
  });

  return (
    <Form
      method="post"
      {...getFormProps(form)}
      className="grid gap-3 rounded-md border p-3"
    >
      <input type="hidden" name="giftGroupId" value={giftGroup.id} />
      <Label htmlFor="name">Name</Label>
      <Input name="name" defaultValue={giftGroup.name} />
      <Label htmlFor="description">Description</Label>
      <Input name="description" defaultValue={giftGroup.description} />
      <Label>Budget Visibility</Label>
      <Select name="budgetVisibility" defaultValue={giftGroup.budgetVisibility}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="EVERYONE">Everyone</SelectItem>
          <SelectItem value="ADMINS">Admins</SelectItem>
          <SelectItem value="ONLY_SELF">Only self</SelectItem>
        </SelectContent>
      </Select>
      <Button name="intent" value={SettingsIntent.UpdateSettings} type="submit">
        Save
      </Button>
      <ErrorList errors={form.errors} id={form.errorId} />
    </Form>
  );
};

const InviteCreateForm = ({
  giftGroupId,
  lastResult,
}: {
  giftGroupId: string;
  lastResult: any;
}) => {
  const [form] = useForm({
    id: 'invite-create',
    lastResult,
    constraint: getZodConstraint(InviteCreateSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: InviteCreateSchema });
    },
    defaultValue: { expiresInDays: '7' },
  });
  return (
    <Form
      method="post"
      {...getFormProps(form)}
      className="grid gap-2 rounded-md border p-3"
    >
      <input type="hidden" name="giftGroupId" value={giftGroupId} />
      <div className="grid gap-1">
        <Label>Label</Label>
        <Input name="label" placeholder="e.g. Family group link" />
      </div>
      <div className="grid gap-1">
        <Label>Role</Label>
        <Select name="roleGranted" defaultValue={'MEMBER'}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MEMBER">Member</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label>Expires in</Label>
        <Select name="expiresInDays" defaultValue={'7'}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 day</SelectItem>
            <SelectItem value="3">3 days</SelectItem>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="14">14 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label>Max uses (optional)</Label>
        <Input name="maxUses" placeholder="e.g. 10" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="requireApproval" name="requireApproval" />
        <Label htmlFor="requireApproval">Require approval</Label>
      </div>
      <Button name="intent" value={SettingsIntent.InviteCreate} type="submit">
        Create Invite
      </Button>
    </Form>
  );
};

const MemberActions = ({
  giftGroupId,
  memberUserId,
  bannedUntil,
  canRemove,
  canBan,
}: {
  giftGroupId: string;
  memberUserId: string;
  bannedUntil: string | null;
  canRemove: boolean;
  canBan: boolean;
}) => {
  return (
    <div className="flex items-center gap-2">
      {canRemove && (
        <Form method="post">
          <input type="hidden" name="giftGroupId" value={giftGroupId} />
          <input type="hidden" name="memberUserId" value={memberUserId} />
          <Button
            name="intent"
            value={SettingsIntent.MemberRemove}
            variant="destructive"
          >
            Remove
          </Button>
        </Form>
      )}
      {canBan && (
        <Form method="post">
          <input type="hidden" name="giftGroupId" value={giftGroupId} />
          <input type="hidden" name="memberUserId" value={memberUserId} />
          {bannedUntil ? (
            <Button
              name="intent"
              value={SettingsIntent.MemberBan}
              variant="secondary"
            >
              Unban
            </Button>
          ) : (
            <>
              <input
                type="hidden"
                name="until"
                value={new Date(
                  Date.now() + 1000 * 60 * 60 * 24 * 7,
                ).toISOString()}
              />
              <Button
                name="intent"
                value={SettingsIntent.MemberBan}
                variant="secondary"
              >
                Ban 7 days
              </Button>
            </>
          )}
        </Form>
      )}
    </div>
  );
};

const RemindersSection = ({ giftGroup }: { giftGroup: any }) => {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {[30, 14, 7, 3, 1].map((d) => (
          <Form key={d} method="post">
            <input type="hidden" name="giftGroupId" value={giftGroup.id} />
            <input type="hidden" name="offsetDays" value={String(d)} />
            <Button size="sm" name="intent" value={SettingsIntent.ReminderAdd}>
              +{d} days
            </Button>
          </Form>
        ))}
      </div>
      <ul className="space-y-1">
        {giftGroup.reminders.map((r: any) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div>Reminder: {r.offsetDays} days before</div>
            <Form method="post">
              <input type="hidden" name="giftGroupId" value={giftGroup.id} />
              <input type="hidden" name="reminderId" value={r.id} />
              <Button
                size="sm"
                variant="secondary"
                name="intent"
                value={SettingsIntent.ReminderRemove}
              >
                Remove
              </Button>
            </Form>
          </li>
        ))}
      </ul>
    </div>
  );
};

// GiftPlansSection removed (unused)

const MemberPreferencesForm = ({
  giftGroupId,
  prefs,
}: {
  giftGroupId: string;
  prefs: any;
}) => {
  const [form] = useForm({
    id: 'member-prefs',
    defaultValue: {
      contributionCents: String(prefs?.contributionCents ?? 0),
      budgetVisibilityOverride: prefs?.budgetVisibilityOverride ?? 'INHERIT',
      shareWishlist: prefs?.shareWishlist ? 'on' : '',
      shareBirthday: prefs?.shareBirthday ? 'on' : '',
    },
  });

  return (
    <Form
      method="post"
      {...getFormProps(form)}
      className="grid gap-2 rounded-md border p-3"
    >
      <input type="hidden" name="giftGroupId" value={giftGroupId} />
      <input
        type="hidden"
        name="intent"
        value={SettingsIntent.MemberUpdateSelf}
      />
      <Label>Contribution (USD cents)</Label>
      <Input
        name="contributionCents"
        defaultValue={String(prefs?.contributionCents ?? 0)}
      />
      <Label>Budget visibility override</Label>
      <Select
        name="budgetVisibilityOverride"
        defaultValue={prefs?.budgetVisibilityOverride ?? 'INHERIT'}
      >
        <SelectTrigger>
          <SelectValue placeholder="Inherit group setting" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="INHERIT">Inherit group setting</SelectItem>
          <SelectItem value="EVERYONE">Everyone</SelectItem>
          <SelectItem value="ADMINS">Admins</SelectItem>
          <SelectItem value="ONLY_SELF">Only self</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="prefs-share-wishlist"
          name="shareWishlist"
          defaultChecked={!!prefs?.shareWishlist}
        />
        <Label htmlFor="prefs-share-wishlist">Share wishlist</Label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="prefs-share-birthday"
          name="shareBirthday"
          defaultChecked={!!prefs?.shareBirthday}
        />
        <Label htmlFor="prefs-share-birthday">Share birthday</Label>
      </div>
      <Button type="submit">Save Preferences</Button>
    </Form>
  );
};

const TransferOwnershipForm = ({ giftGroup }: { giftGroup: any }) => {
  const [form] = useForm({ id: 'transfer-owner' });
  const admins = giftGroup.groupMembers.filter((m: any) => m.role === 'ADMIN');
  return (
    <Form
      method="post"
      {...getFormProps(form)}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="giftGroupId" value={giftGroup.id} />
      <Select name="newOwnerUserId">
        <SelectTrigger>
          <SelectValue placeholder="Select admin" />
        </SelectTrigger>
        <SelectContent>
          {admins.map((m: any) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.user.username}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button name="intent" value={SettingsIntent.OwnershipTransfer}>
        Transfer
      </Button>
    </Form>
  );
};
