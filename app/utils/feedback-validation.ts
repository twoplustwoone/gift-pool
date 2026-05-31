import { z } from 'zod';
import { EmailSchema } from './user-validation.ts';

// String fields in the DB (SQLite has no native enums); valid values are
// enforced here at the app layer. See `prisma/schema.prisma` model `Feedback`.
export const FEEDBACK_TYPE_VALUES = ['BUG', 'FEATURE', 'QUESTION'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPE_VALUES)[number];
export const FeedbackTypeSchema = z.enum(FEEDBACK_TYPE_VALUES);

export const FEEDBACK_STATUS_VALUES = [
  'NEW',
  'IN_PROGRESS',
  'RESOLVED',
  'WONT_FIX',
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUS_VALUES)[number];
export const FeedbackStatusSchema = z.enum(FEEDBACK_STATUS_VALUES);

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  BUG: 'Bug',
  FEATURE: 'Suggestion',
  QUESTION: 'Question',
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  WONT_FIX: "Won't fix",
};

export const FEEDBACK_MESSAGE_MIN_LENGTH = 10;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

// Optional email field on the form: blank is allowed (the action requires it
// only for anonymous submitters, via superRefine), but a non-blank value must
// be a valid email. Empty string normalizes to undefined.
const OptionalEmailSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(EmailSchema.optional());

export const FeedbackSchema = z.object({
  type: FeedbackTypeSchema,
  message: z
    .string({ required_error: 'Please tell us a little more' })
    .trim()
    .min(FEEDBACK_MESSAGE_MIN_LENGTH, {
      message: `Please use at least ${FEEDBACK_MESSAGE_MIN_LENGTH} characters`,
    })
    .max(FEEDBACK_MESSAGE_MAX_LENGTH, {
      message: `Please keep it under ${FEEDBACK_MESSAGE_MAX_LENGTH} characters`,
    }),
  email: OptionalEmailSchema,
  // Captured client-side, best-effort context. Never trusted for auth.
  pageUrl: z.string().max(500).optional(),
});

export type FeedbackInput = z.input<typeof FeedbackSchema>;
