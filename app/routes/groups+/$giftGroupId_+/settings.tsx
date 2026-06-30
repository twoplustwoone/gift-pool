import {
  getFormProps,
  useForm,
  type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
// Using string literal types for roles/visibility to support SQLite
import * as React from 'react';
import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
  Form,
  useActionData,
  useFetcher,
  useFetchers,
  useLoaderData,
} from 'react-router';
import { z } from 'zod';
import {
  EditableSection,
  ReadField,
  useExitOnSubmitSuccess,
} from '#app/components/editable-section.tsx';
import { ErrorList } from '#app/components/forms.tsx';
import { RoleBadge } from '#app/components/groups/RoleBadge.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#app/components/ui/select.tsx';
import { SystemLabel } from '#app/components/ui/system-label.tsx';
// import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Textarea } from '#app/components/ui/textarea.tsx';
import { prisma } from '#app/utils/db.server.ts';
import {
  createInviteLink,
  destroyInviteLink,
  getInviteLink,
} from '#app/utils/group-invitations.server.ts';
import { userHasGroupPermission } from '#app/utils/group-permissions.server.ts';
import { GroupRoleSchema, type GroupRole } from '#app/utils/group-role.ts';
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
  promoteToAdmin,
  demoteAdminToMember,
  updateOwnPreferences,
  deleteGiftGroup,
} from '#app/utils/groups.server.ts';
import { createToastHeaders } from '#app/utils/toast.server.ts';
import { applyPendingSettingsMemberMutations } from './__route.shared';
export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const userId = await requireUserIdInGroup(request, groupId);
  const giftGroupRaw = await prisma.giftGroup.findUnique({
    where: {
      id: groupId,
    },
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
              image: {
                select: {
                  id: true,
                  altText: true,
                },
              },
            },
          },
        },
      },
      reminders: {
        select: {
          id: true,
          offsetDays: true,
        },
      },
      groupInvitations: {
        where: {
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
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
    },
  });
  if (!giftGroupRaw)
    throw new Response('Group not found', {
      status: 404,
    });
  const giftGroup = {
    ...giftGroupRaw,
    groupMembers: giftGroupRaw.groupMembers.map((m) => ({
      ...m,
      role: GroupRoleSchema.catch('MEMBER').parse(m.role) as GroupRole,
    })),
    groupInvitations: giftGroupRaw.groupInvitations.map((inv) => ({
      ...inv,
      roleGranted: GroupRoleSchema.catch('MEMBER').parse(
        inv.roleGranted,
      ) as GroupRole,
      url: getInviteLink(inv.code, request),
    })),
  };
  // Settings is reachable by every member (the gear links here for all roles),
  // so these flags decide which admin sections render — not whether the page
  // loads. A plain member sees only "Your preferences".
  const canManageSettings = await userHasGroupPermission(
    userId,
    groupId,
    'manageSettings',
  );
  const canLeave = await userHasGroupPermission(userId, groupId, 'leaveGroup');
  const canDelete = await userHasGroupPermission(
    userId,
    groupId,
    'deleteGroup',
  );
  const viewerMemberRaw = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: {
        userId,
        giftGroupId: groupId,
      },
    },
    select: {
      userId: true,
      role: true,
      contributionCents: true,
      budgetVisibilityOverride: true,
      shareWishlist: true,
      shareBirthday: true,
    },
  });
  const viewerMember = viewerMemberRaw
    ? ({
        ...viewerMemberRaw,
        role: GroupRoleSchema.catch('MEMBER').parse(
          viewerMemberRaw.role,
        ) as GroupRole,
      } as const)
    : null;
  // Non-managers must not receive other members' contribution / visibility /
  // sharing settings or the admin roster — strip them so a member's payload
  // carries only their own preferences (P7.5 privacy).
  const giftGroupForViewer = canManageSettings
    ? giftGroup
    : { ...giftGroup, groupMembers: [], groupInvitations: [], reminders: [] };
  return {
    giftGroup: giftGroupForViewer,
    canManageSettings,
    canDelete,
    canLeave,
    viewerMember,
  };
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
  MemberPromoteAdmin = 'member-promote-admin',
  MemberDemoteMember = 'member-demote-member',
  MemberUpdateSelf = 'member-update-self',
  DeleteGroup = 'delete-group',
}
const UpdateSettingsSchema = z.object({
  intent: z.literal(SettingsIntent.UpdateSettings),
  giftGroupId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  budgetVisibility: z.enum(['EVERYONE', 'ADMINS', 'ONLY_SELF']),
});
const InviteCreateSchema = z.object({
  intent: z.literal(SettingsIntent.InviteCreate),
  giftGroupId: z.string(),
  label: z.string().optional(),
  roleGranted: GroupRoleSchema.optional(),
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
      .or(MemberPromoteAdminSchema)
      .or(MemberDemoteMemberSchema)
      .or(MemberUpdateSelfSchema)
      .or(DeleteGroupSchema),
  });
  if (submission.status !== 'success') {
    return data(submission.reply(), {
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
      return data(submission.reply(), {
        headers: await createToastHeaders({
          type: 'success',
          title: 'Saved',
          description: 'Group settings updated.',
        }),
      });
    }
    case SettingsIntent.InviteCreate: {
      await createInviteLink(request, v);
      return submission.reply();
    }
    case SettingsIntent.InviteRevoke: {
      await destroyInviteLink(request, v.giftGroupId, {
        groupInvitationId: v.groupInvitationId,
      });
      return submission.reply();
    }
    case SettingsIntent.JoinApprove: {
      await approveJoinRequest(request, v.giftGroupId, v.joinRequestId);
      return submission.reply();
    }
    case SettingsIntent.JoinReject: {
      await rejectJoinRequest(
        request,
        v.giftGroupId,
        v.joinRequestId,
        v.reason,
      );
      return submission.reply();
    }
    case SettingsIntent.MemberRemove: {
      await removeMember(request, v.giftGroupId, v.memberUserId, v.reason);
      return submission.reply();
    }
    case SettingsIntent.MemberBan: {
      const until = v.until ? new Date(v.until) : null;
      await banMember(request, v.giftGroupId, v.memberUserId, until);
      return submission.reply();
    }
    case SettingsIntent.OwnershipTransfer: {
      await transferOwnership(request, v.giftGroupId, v.newOwnerUserId);
      return submission.reply();
    }
    case SettingsIntent.MemberPromoteAdmin: {
      await promoteToAdmin(request, v.giftGroupId, v.memberUserId);
      return submission.reply();
    }
    case SettingsIntent.MemberDemoteMember: {
      await demoteAdminToMember(request, v.giftGroupId, v.memberUserId);
      return submission.reply();
    }
    case SettingsIntent.MemberUpdateSelf: {
      await updateOwnPreferences(request, v.giftGroupId, {
        contributionCents: v.contributionCents
          ? Number.parseInt(v.contributionCents, 10)
          : undefined,
        budgetVisibilityOverride: (v.budgetVisibilityOverride ??
          'INHERIT') as any,
        // Explicit booleans so a member can turn sharing OFF, not just on.
        shareWishlist:
          v.shareWishlist === undefined
            ? undefined
            : v.shareWishlist === 'true',
        shareBirthday:
          v.shareBirthday === undefined
            ? undefined
            : v.shareBirthday === 'true',
      });
      return data(
        { ...submission.reply(), ok: true },
        {
          headers: await createToastHeaders({
            type: 'success',
            title: 'Saved',
            description: 'Your preferences have been saved.',
          }),
        },
      );
    }
    case SettingsIntent.DeleteGroup: {
      await deleteGiftGroup(request, {
        giftGroupId: v.giftGroupId,
      });
      return submission.reply();
    }
    case SettingsIntent.ReminderAdd: {
      await addReminder(
        request,
        v.giftGroupId,
        Number.parseInt(v.offsetDays, 10),
      );
      return submission.reply();
    }
    case SettingsIntent.ReminderRemove: {
      await removeReminder(request, v.giftGroupId, v.reminderId);
      return submission.reply();
    }
  }
}
const GroupSettingsRoute = () => {
  const { giftGroup, canManageSettings, canDelete, canLeave, viewerMember } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetchers = useFetchers();
  const memberActionFetcher = useFetcher<typeof action>();
  const settingsAction = `/groups/${giftGroup.id}/settings`;
  const optimisticMembers = React.useMemo(
    () =>
      applyPendingSettingsMemberMutations({
        fetchers,
        members: giftGroup.groupMembers,
        settingsAction,
        getUserId: (member) => member.userId,
        getRole: (member) => member.role,
        setRole: (member, role) => ({ ...member, role }),
      }),
    [fetchers, giftGroup.groupMembers, settingsAction],
  );
  const optimisticViewerRole =
    optimisticMembers.find((m) => m.userId === viewerMember?.userId)?.role ??
    viewerMember?.role ??
    'MEMBER';
  const canTransfer = optimisticViewerRole === 'OWNER';
  const canPromote = optimisticViewerRole === 'OWNER';
  const canDemote = optimisticViewerRole === 'OWNER';
  const canRemove =
    optimisticViewerRole === 'OWNER' || optimisticViewerRole === 'ADMIN';
  return (
    <div className="space-y-6">
      {/* Your preferences — visible & editable by every member (P7.5) */}
      {viewerMember ? (
        <MemberPreferencesCard
          giftGroupId={giftGroup.id}
          prefs={viewerMember}
        />
      ) : null}

      {/* Admin controls — a separate surface, only for managers */}
      {canManageSettings ? (
        <>
          <SettingsCard giftGroup={giftGroup} lastResult={actionData} />
          <div className="rounded-2xl border bg-card p-4 sm:p-6">
            <RemindersSection giftGroup={giftGroup} />
          </div>

          {/* Transfer ownership */}
          {canTransfer ? (
            <div className="rounded-2xl border bg-card p-4 sm:p-6">
              <div className="mb-1 text-lg font-semibold">
                Transfer Ownership
              </div>
              <div className="mb-4 text-sm text-muted-foreground">
                Make another admin the owner of this group
              </div>
              <TransferOwnershipForm
                giftGroupId={giftGroup.id}
                members={optimisticMembers}
              />
            </div>
          ) : null}

          {/* Member management */}
          <div className="rounded-2xl border bg-card p-4 sm:p-6">
            <div className="mb-1 text-lg font-semibold">Member Actions</div>
            <div className="mb-4 text-sm text-muted-foreground">
              Promote or demote admins, remove members
            </div>
            <ul className="divide-y divide-border rounded-md border">
              {optimisticMembers.map((m: any) => {
                const isViewer = m.userId === viewerMember?.userId;
                return (
                  <li
                    key={m.userId}
                    className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar size="s" image={m.user.image} user={m.user} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">{m.user.username}</span>
                          {isViewer ? <SystemLabel>you</SystemLabel> : null}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <RoleBadge role={m.role} />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Promote / Demote (owner only) */}
                      {canPromote && m.role === 'MEMBER' && !isViewer ? (
                        <memberActionFetcher.Form
                          method="post"
                          action={settingsAction}
                        >
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
                            size="sm"
                            variant="secondary"
                            name="intent"
                            value={SettingsIntent.MemberPromoteAdmin}
                          >
                            Promote to Admin
                          </Button>
                        </memberActionFetcher.Form>
                      ) : null}
                      {canDemote && m.role === 'ADMIN' && !isViewer ? (
                        <memberActionFetcher.Form
                          method="post"
                          action={settingsAction}
                        >
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
                            size="sm"
                            variant="secondary"
                            name="intent"
                            value={SettingsIntent.MemberDemoteMember}
                          >
                            Demote to Member
                          </Button>
                        </memberActionFetcher.Form>
                      ) : null}

                      <MemberActions
                        giftGroupId={giftGroup.id}
                        memberUserId={m.userId}
                        canRemove={canRemove && !isViewer}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {canDelete ? (
            <div className="rounded-2xl border bg-card p-4 sm:p-6">
              <div className="rounded-md bg-destructive/10 p-4">
                <div className="mb-1 font-semibold text-destructive">
                  Danger Zone
                </div>
                <div className="mb-3 text-sm text-destructive/80">
                  These actions cannot be undone. Please be careful. As the
                  owner, you can't leave directly — transfer ownership first or
                  delete the group.
                </div>
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
                  <Button variant="destructive">
                    <Icon name="trash" className="mr-2" /> Delete Group
                  </Button>
                </ConfirmDialog>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {canLeave ? (
        <div className="rounded-2xl border bg-card p-4 sm:p-6">
          <div className="mb-2 font-semibold">Leave Group</div>
          <div className="mb-3 text-sm text-muted-foreground">
            You will lose access to this group and its gift plans.
          </div>
          <Form
            method="post"
            action={`/groups/${giftGroup.id}`}
            id="leave-group-form"
          >
            <input type="hidden" name="giftGroupId" value={giftGroup.id} />
            <input type="hidden" name="intent" value="leave-gift-group" />
          </Form>
          <ConfirmDialog
            title="Leave Group"
            description={<div>Are you sure you want to leave this group?</div>}
            confirmText="Leave"
            onConfirm={() => {
              const form = document.getElementById(
                'leave-group-form',
              ) as HTMLFormElement;
              form?.requestSubmit();
            }}
          >
            <Button variant="destructive">Leave Group</Button>
          </ConfirmDialog>
        </div>
      ) : null}
    </div>
  );
};
export default GroupSettingsRoute;
const SettingsCard = ({
  giftGroup,
  lastResult,
}: {
  giftGroup: any;
  lastResult: any;
}) => {
  const fetcher = useFetcher<typeof action>();
  const [editing, setEditing] = React.useState(false);
  const stopEditing = React.useCallback(() => setEditing(false), []);
  const [form] = useForm<z.input<typeof UpdateSettingsSchema>>({
    id: 'settings-form',
    lastResult: (fetcher.data ?? lastResult) as unknown as SubmissionResult<
      string[]
    >,
    constraint: getZodConstraint(UpdateSettingsSchema),
    onValidate({ formData }) {
      return parseWithZod(formData, {
        schema: UpdateSettingsSchema,
      }) as any;
    },
    defaultValue: {
      name: giftGroup.name,
      description: giftGroup.description,
      budgetVisibility: giftGroup.budgetVisibility,
    },
  });
  useExitOnSubmitSuccess({
    state: fetcher.state,
    success: form.status === 'success',
    onExit: stopEditing,
  });
  return (
    <EditableSection
      title="Group settings"
      description="Name and description for this group."
      editing={editing}
      onEdit={() => setEditing(true)}
      read={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReadField label="Name" value={giftGroup.name} />
          <ReadField
            label="Description"
            value={giftGroup.description || 'No description'}
            className="sm:col-span-2"
          />
        </div>
      }
    >
      <fetcher.Form
        method="post"
        {...getFormProps(form)}
        className="grid gap-3"
      >
        <input type="hidden" name="giftGroupId" value={giftGroup.id} />
        {/* keep budget visibility using hidden to satisfy schema */}
        <input
          type="hidden"
          name="budgetVisibility"
          value={giftGroup.budgetVisibility}
        />
        <Label htmlFor="name">Group name</Label>
        <Input id="name" name="name" defaultValue={giftGroup.name} />
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={giftGroup.description ?? ''}
        />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={stopEditing}>
            Cancel
          </Button>
          <Button
            name="intent"
            value={SettingsIntent.UpdateSettings}
            type="submit"
          >
            Save
          </Button>
        </div>
        <ErrorList errors={form.errors} id={form.errorId} />
      </fetcher.Form>
    </EditableSection>
  );
};
const MemberActions = ({
  giftGroupId,
  memberUserId,
  canRemove,
}: {
  giftGroupId: string;
  memberUserId: string;
  canRemove: boolean;
}) => {
  const fetcher = useFetcher<typeof action>();
  const settingsAction = `/groups/${giftGroupId}/settings`;
  return (
    <div className="flex items-center gap-2">
      {canRemove && (
        <fetcher.Form method="post" action={settingsAction}>
          <input type="hidden" name="giftGroupId" value={giftGroupId} />
          <input type="hidden" name="memberUserId" value={memberUserId} />
          <Button
            name="intent"
            value={SettingsIntent.MemberRemove}
            variant="destructive"
          >
            Remove
          </Button>
        </fetcher.Form>
      )}
    </div>
  );
};
const RemindersSection = ({ giftGroup }: { giftGroup: any }) => {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 font-semibold">Birthday Reminders</div>
        <div className="flex flex-wrap items-center gap-2">
          {[30, 14, 7, 3, 1].map((d) => (
            <Form key={d} method="post">
              <input type="hidden" name="giftGroupId" value={giftGroup.id} />
              <input type="hidden" name="offsetDays" value={String(d)} />
              <Button
                size="sm"
                name="intent"
                value={SettingsIntent.ReminderAdd}
              >
                {d} days
              </Button>
            </Form>
          ))}
          <Form method="post" className="flex items-center gap-2">
            <input type="hidden" name="giftGroupId" value={giftGroup.id} />
            <Label htmlFor="custom-reminder" className="sr-only">
              Custom days
            </Label>
            <Input
              id="custom-reminder"
              name="offsetDays"
              placeholder="e.g. 30"
              inputMode="numeric"
              className="w-24"
            />
            <Button size="sm" name="intent" value={SettingsIntent.ReminderAdd}>
              Add
            </Button>
          </Form>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Reminders will trigger when a member's birthday is within any of these
          day thresholds
        </div>
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

const BUDGET_VISIBILITY_LABELS: Record<string, string> = {
  INHERIT: 'Inherit group setting',
  EVERYONE: 'Everyone',
  ADMINS: 'Admins',
  ONLY_SELF: 'Only self',
};

// Every member can see and edit their own preferences here, regardless of role
// (P7.5). Contribution stays on the group Overview's dollar editor; this card
// owns budget visibility + what you share with the group.
const MemberPreferencesCard = ({
  giftGroupId,
  prefs,
}: {
  giftGroupId: string;
  prefs: any;
}) => {
  const fetcher = useFetcher<typeof action>();
  const [editing, setEditing] = React.useState(false);
  const stopEditing = React.useCallback(() => setEditing(false), []);
  const currentVisibility = prefs?.budgetVisibilityOverride ?? 'INHERIT';
  const [shareWishlist, setShareWishlist] = React.useState(
    !!prefs?.shareWishlist,
  );
  const [shareBirthday, setShareBirthday] = React.useState(
    !!prefs?.shareBirthday,
  );

  const startEditing = () => {
    // Reset drafts to stored values each time we open the editor.
    setShareWishlist(!!prefs?.shareWishlist);
    setShareBirthday(!!prefs?.shareBirthday);
    setEditing(true);
  };

  const saved = Boolean((fetcher.data as { ok?: boolean } | undefined)?.ok);
  useExitOnSubmitSuccess({
    state: fetcher.state,
    success: saved,
    onExit: stopEditing,
  });

  return (
    <EditableSection
      title="Your preferences"
      description="Your budget visibility and sharing settings for this group."
      editing={editing}
      onEdit={startEditing}
      read={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReadField
            label="Budget visibility"
            value={
              BUDGET_VISIBILITY_LABELS[currentVisibility] ??
              'Inherit group setting'
            }
          />
          <ReadField
            label="Share wishlist"
            value={prefs?.shareWishlist ? 'Shared with group' : 'Hidden'}
          />
          <ReadField
            label="Share birthday"
            value={prefs?.shareBirthday ? 'Shared with group' : 'Hidden'}
          />
        </div>
      }
    >
      <fetcher.Form
        method="post"
        action={`/groups/${giftGroupId}/settings`}
        className="grid gap-3"
      >
        <input type="hidden" name="giftGroupId" value={giftGroupId} />
        <input
          type="hidden"
          name="intent"
          value={SettingsIntent.MemberUpdateSelf}
        />
        {/* Controlled hidden inputs so unchecking persists `false` (the old
            checkbox-only form could never turn sharing off). */}
        <input
          type="hidden"
          name="shareWishlist"
          value={shareWishlist ? 'true' : 'false'}
        />
        <input
          type="hidden"
          name="shareBirthday"
          value={shareBirthday ? 'true' : 'false'}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="budgetVisibilityOverride">Budget visibility</Label>
          <Select
            name="budgetVisibilityOverride"
            defaultValue={currentVisibility}
          >
            <SelectTrigger id="budgetVisibilityOverride">
              <SelectValue placeholder="Inherit group setting" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INHERIT">Inherit group setting</SelectItem>
              <SelectItem value="EVERYONE">Everyone</SelectItem>
              <SelectItem value="ADMINS">Admins</SelectItem>
              <SelectItem value="ONLY_SELF">Only self</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shareWishlist}
            onChange={(e) => setShareWishlist(e.currentTarget.checked)}
          />
          Share my wishlist with this group
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shareBirthday}
            onChange={(e) => setShareBirthday(e.currentTarget.checked)}
          />
          Share my birthday with this group
        </label>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={stopEditing}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </fetcher.Form>
    </EditableSection>
  );
};
const TransferOwnershipForm = ({
  giftGroupId,
  members,
}: {
  giftGroupId: string;
  members: Array<{
    userId: string;
    role: string;
    user: {
      username: string;
    };
  }>;
}) => {
  const fetcher = useFetcher<typeof action>();
  const [form] = useForm({
    id: 'transfer-owner',
  });
  const admins = members.filter((m) => m.role === 'ADMIN');
  return (
    <fetcher.Form
      method="post"
      action={`/groups/${giftGroupId}/settings`}
      {...getFormProps(form)}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="giftGroupId" value={giftGroupId} />
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
    </fetcher.Form>
  );
};
