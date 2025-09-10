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

