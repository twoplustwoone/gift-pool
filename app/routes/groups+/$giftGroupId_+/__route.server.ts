import { parseWithZod } from '@conform-to/zod';
import { type GroupInvitation } from '@prisma/client';
import {
  type ActionFunctionArgs,
  json,
  type LoaderFunctionArgs,
} from '@remix-run/node';

import {
  CreateInviteLinkFormSchema,
  DeleteFormSchema,
  DestroyInviteLinkFormSchema,
  GiftGroupIdFormIntent,
  LeaveGroupFormSchema,
  LockPlanFormSchema,
  PlanGiftFormSchema,
} from './__route.shared';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const { requireUserIdInGroup } = await import('#app/utils/groups.server.ts');
  const { prisma } = await import('#app/utils/db.server.ts');
  const { userHasGroupPermission } = await import(
    '#app/utils/group-permissions.server.ts'
  );
  const { getInviteLink } = await import(
    '#app/utils/group-invitations.server.ts'
  );

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
    select: { role: true, contributionCents: true },
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

  // Activity feed disabled; pagination param ignored for now
  const activities: Array<any> = [];

  return json({
    giftGroup,
    canInvite,
    canDelete,
    canLeave,
    canSettings,
    canLockPlan,
    viewer: {
      userId,
      role: viewerMembership?.role ?? ('MEMBER' as const),
      contributionCents: viewerMembership?.contributionCents,
    },
    inviteLink: existingInvitation
      ? getInviteLink(existingInvitation.code, request)
      : null,
    groupInvitationId: existingInvitation?.id,
    activities,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { requireUserId } = await import('#app/utils/auth.server.ts');
  const { deleteGiftGroup, createGiftPlan, lockGiftPlan, leaveGroup } =
    await import('#app/utils/groups.server.ts');
  const { createInviteLink, destroyInviteLink } = await import(
    '#app/utils/group-invitations.server.ts'
  );
  const { createToastHeaders, redirectWithToast } = await import(
    '#app/utils/toast.server.ts'
  );

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
