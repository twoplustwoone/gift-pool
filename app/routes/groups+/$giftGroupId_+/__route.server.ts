import { parseWithZod } from '@conform-to/zod';
import { type GroupInvitation } from '@prisma/client';
import {
  type ActionFunctionArgs,
  json,
  type LoaderFunctionArgs,
} from '@remix-run/node';

import { type RelationshipState } from '#app/utils/friends.ts';
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
      createdAt: true,
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

  type FriendRelationship = {
    state: RelationshipState;
    friendshipId: string | null;
    incomingRequestId: string | null;
    outgoingRequestId: string | null;
  };

  const emptyRelationship = (): FriendRelationship => ({
    state: 'NONE',
    friendshipId: null,
    incomingRequestId: null,
    outgoingRequestId: null,
  });

  const memberUserIds = giftGroup.groupMembers
    .map((member) => member.user.id)
    .filter((id) => id !== userId);

  const [friendships, pendingRequests] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        OR: [
          { userAId: userId, userBId: { in: memberUserIds } },
          { userBId: userId, userAId: { in: memberUserIds } },
        ],
      },
      select: { id: true, userAId: true, userBId: true },
    }),
    prisma.friendRequest.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { fromUserId: userId, toUserId: { in: memberUserIds } },
          { toUserId: userId, fromUserId: { in: memberUserIds } },
        ],
      },
      select: { id: true, fromUserId: true, toUserId: true },
    }),
  ]);

  const relationshipMap = new Map<string, FriendRelationship>();

  memberUserIds.forEach((id) => {
    relationshipMap.set(id, emptyRelationship());
  });

  for (const friendship of friendships) {
    const otherId =
      friendship.userAId === userId ? friendship.userBId : friendship.userAId;
    relationshipMap.set(otherId, {
      state: 'FRIENDS',
      friendshipId: friendship.id,
      incomingRequestId: null,
      outgoingRequestId: null,
    });
  }

  for (const request of pendingRequests) {
    const otherId =
      request.fromUserId === userId ? request.toUserId : request.fromUserId;
    const current = relationshipMap.get(otherId) ?? emptyRelationship();
    if (current.state === 'FRIENDS') continue;
    if (request.fromUserId === userId) {
      relationshipMap.set(otherId, {
        state: 'PENDING_OUTGOING',
        friendshipId: null,
        incomingRequestId: null,
        outgoingRequestId: request.id,
      });
    } else {
      relationshipMap.set(otherId, {
        state: 'PENDING_INCOMING',
        friendshipId: null,
        incomingRequestId: request.id,
        outgoingRequestId: null,
      });
    }
  }

  const groupMembersWithFriendState = giftGroup.groupMembers.map((member) => {
    if (member.user.id === userId) {
      return {
        ...member,
        friendRelationship: {
          state: 'FRIENDS' as RelationshipState,
          friendshipId: null,
          incomingRequestId: null,
          outgoingRequestId: null,
        },
      };
    }
    return {
      ...member,
      friendRelationship:
        relationshipMap.get(member.user.id) ?? emptyRelationship(),
    };
  });

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
    giftGroup: {
      ...giftGroup,
      groupMembers: groupMembersWithFriendState,
    },
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

    case GiftGroupIdFormIntent.CreateInviteLink: {
      await createInviteLink(request, submission.value);
      // Fetch the latest active invitation and return its absolute URL so the
      // client can copy it without a full reload.
      const { prisma } = await import('#app/utils/db.server.ts');
      const { getInviteLink } = await import(
        '#app/utils/group-invitations.server.ts'
      );
      const latest = await prisma.groupInvitation.findFirst({
        where: {
          giftGroupId,
          expiresAt: { gt: new Date() },
          revokedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
      const inviteUrl = latest ? getInviteLink(latest.code, request) : null;
      return json(
        { ...submission.reply(), inviteUrl },
        {
          headers: await createToastHeaders({
            description: 'Invite link has been created.',
            type: 'success',
          }),
        },
      );
    }

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
