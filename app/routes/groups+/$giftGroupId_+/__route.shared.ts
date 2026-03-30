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
  getRole: (member: TMember) => 'ADMIN' | 'MEMBER' | 'OWNER';
  setRole: (member: TMember, role: 'ADMIN' | 'MEMBER' | 'OWNER') => TMember;
}) {
  let nextMembers = [...members];

  for (const pending of fetchers) {
    if (!pending.formData || pending.formMethod?.toLowerCase() !== 'post') {
      continue;
    }
    if (getPathname(pending.formAction) !== settingsAction) continue;

    const intent = pending.formData.get('intent');
    if (!isSettingsMemberIntent(intent)) continue;

    if (intent === 'member-remove') {
      const memberUserId = pending.formData.get('memberUserId');
      if (typeof memberUserId !== 'string') continue;
      nextMembers = nextMembers.filter(
        (member) => getUserId(member) !== memberUserId,
      );
      continue;
    }

    if (intent === 'ownership-transfer') {
      const newOwnerUserId = pending.formData.get('newOwnerUserId');
      if (typeof newOwnerUserId !== 'string') continue;
      nextMembers = nextMembers.map((member) => {
        const memberUserId = getUserId(member);
        if (memberUserId === newOwnerUserId) {
          return setRole(member, 'OWNER');
        }
        if (getRole(member) === 'OWNER') {
          return setRole(member, 'ADMIN');
        }
        return member;
      });
      continue;
    }

    const memberUserId = pending.formData.get('memberUserId');
    if (typeof memberUserId !== 'string') continue;

    nextMembers = nextMembers.map((member) => {
      if (getUserId(member) !== memberUserId) return member;
      return setRole(
        member,
        intent === 'member-promote-admin' ? 'ADMIN' : 'MEMBER',
      );
    });
  }

  return nextMembers;
}
