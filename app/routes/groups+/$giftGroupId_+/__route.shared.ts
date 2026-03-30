import { z } from 'zod';

export enum GiftGroupIdFormIntent {
  DeleteGiftGroup = 'delete-gift-group',
  CreateInviteLink = 'create-invite-link',
  DestroyInviteLink = 'destroy-invite-link',
  LeaveGiftGroup = 'leave-gift-group',
  PlanGift = 'plan-gift',
  LockPlan = 'lock-plan',
}

export const DeleteFormSchema = z.object({
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

export const PlanGiftFormSchema = z.object({
  intent: z.literal(GiftGroupIdFormIntent.PlanGift),
  giftGroupId: z.string(),
  recipientUserId: z.string(),
  birthdayDate: z.string(),
});

export const LockPlanFormSchema = z.object({
  intent: z.literal(GiftGroupIdFormIntent.LockPlan),
  giftGroupId: z.string(),
  planId: z.string(),
});

export const SETTINGS_MEMBER_INTENTS = new Set([
  'member-promote-admin',
  'member-demote-member',
  'member-remove',
  'ownership-transfer',
] as const);

type SettingsMemberIntent = (typeof SETTINGS_MEMBER_INTENTS extends Set<infer T>
  ? T
  : never) & string;
type GroupMemberRole = 'ADMIN' | 'MEMBER' | 'OWNER';

type PendingFetcher = {
  formAction?: string;
  formMethod?: string;
  formData?: FormData | null;
};

export function getPathname(action: string | undefined) {
  if (!action) return null;
  try {
    return new URL(action, 'http://localhost').pathname;
  } catch {
    return action;
  }
}

function isSettingsMemberIntent(value: FormDataEntryValue | null): value is SettingsMemberIntent {
  return typeof value === 'string' && SETTINGS_MEMBER_INTENTS.has(value);
}

function isPendingSettingsMemberMutation(
  pending: PendingFetcher,
  settingsAction: string,
): SettingsMemberIntent | null {
  if (!pending.formData || pending.formMethod?.toLowerCase() !== 'post') {
    return null;
  }
  if (getPathname(pending.formAction) !== settingsAction) return null;
  const intent = pending.formData.get('intent');
  return isSettingsMemberIntent(intent) ? intent : null;
}

function getPendingMemberUserId(formData: FormData) {
  const memberUserId = formData.get('memberUserId');
  return typeof memberUserId === 'string' ? memberUserId : null;
}

function applyMemberRemoval<TMember>(
  members: TMember[],
  memberUserId: string,
  getUserId: (member: TMember) => string,
) {
  return members.filter((member) => getUserId(member) !== memberUserId);
}

function applyOwnershipTransfer<TMember>(
  members: TMember[],
  newOwnerUserId: string,
  getUserId: (member: TMember) => string,
  getRole: (member: TMember) => GroupMemberRole,
  setRole: (member: TMember, role: GroupMemberRole) => TMember,
) {
  return members.map((member) => {
    const memberUserId = getUserId(member);
    if (memberUserId === newOwnerUserId) {
      return setRole(member, 'OWNER');
    }
    if (getRole(member) === 'OWNER') {
      return setRole(member, 'ADMIN');
    }
    return member;
  });
}

function applyMemberRoleUpdate<TMember>(
  members: TMember[],
  memberUserId: string,
  intent: Exclude<SettingsMemberIntent, 'member-remove' | 'ownership-transfer'>,
  getUserId: (member: TMember) => string,
  setRole: (member: TMember, role: GroupMemberRole) => TMember,
) {
  const nextRole = intent === 'member-promote-admin' ? 'ADMIN' : 'MEMBER';

  return members.map((member) => {
    if (getUserId(member) !== memberUserId) return member;
    return setRole(member, nextRole);
  });
}

export function applyPendingSettingsMemberMutations<TMember>({
  fetchers,
  members,
  settingsAction,
  getUserId,
  getRole,
  setRole,
}: {
  fetchers: PendingFetcher[];
  members: TMember[];
  settingsAction: string;
  getUserId: (member: TMember) => string;
  getRole: (member: TMember) => GroupMemberRole;
  setRole: (member: TMember, role: GroupMemberRole) => TMember;
}) {
  let nextMembers = [...members];

  for (const pending of fetchers) {
    const intent = isPendingSettingsMemberMutation(pending, settingsAction);
    if (!intent || !pending.formData) continue;

    if (intent === 'member-remove') {
      const memberUserId = getPendingMemberUserId(pending.formData);
      if (!memberUserId) continue;
      nextMembers = applyMemberRemoval(nextMembers, memberUserId, getUserId);
      continue;
    }

    if (intent === 'ownership-transfer') {
      const newOwnerUserId = pending.formData.get('newOwnerUserId');
      if (typeof newOwnerUserId !== 'string') continue;
      nextMembers = applyOwnershipTransfer(
        nextMembers,
        newOwnerUserId,
        getUserId,
        getRole,
        setRole,
      );
      continue;
    }

    const memberUserId = getPendingMemberUserId(pending.formData);
    if (!memberUserId) continue;

    nextMembers = applyMemberRoleUpdate(
      nextMembers,
      memberUserId,
      intent,
      getUserId,
      setRole,
    );
  }

  return nextMembers;
}
