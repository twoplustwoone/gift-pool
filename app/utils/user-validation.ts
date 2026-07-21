import { z } from 'zod';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

export const UsernameSchema = z
  .string({ required_error: 'Username is required' })
  .min(USERNAME_MIN_LENGTH, {
    message: `Username is too short (minimum ${USERNAME_MIN_LENGTH} characters)`,
  })
  .max(USERNAME_MAX_LENGTH, { message: 'Username is too long' })
  .regex(/^[a-zA-Z0-9_]+$/, {
    message:
      'Username can only include letters, numbers, and underscores — no spaces or hyphens',
  })
  // users can type the username in any case, but we store it in lowercase
  .transform((value) => value.toLowerCase());

export const PASSWORD_MIN_LENGTH = 6;

export const PasswordSchema = z
  .string({ required_error: 'Password is required' })
  .min(PASSWORD_MIN_LENGTH, {
    message: `Password is too short (minimum ${PASSWORD_MIN_LENGTH} characters)`,
  })
  .max(100, { message: 'Password is too long' });
export const NameSchema = z
  .string({ required_error: 'Name is required' })
  .min(3, { message: 'Name is too short' })
  .max(40, { message: 'Name is too long' });
export const EmailSchema = z
  .string({ required_error: 'Email is required' })
  .email({ message: 'Email is invalid' })
  .min(3, { message: 'Email is too short' })
  .max(100, { message: 'Email is too long' })
  // users can type the email in any case, but we store it in lowercase
  .transform((value) => value.toLowerCase());

export const PasswordAndConfirmPasswordSchema = z
  .object({ password: PasswordSchema, confirmPassword: PasswordSchema })
  .superRefine(({ confirmPassword, password }, ctx) => {
    if (confirmPassword !== password) {
      ctx.addIssue({
        path: ['confirmPassword'],
        code: 'custom',
        message: 'The passwords must match',
      });
    }
  });

export const BIO_MAX_LENGTH = 160;
export const BioSchema = z
  .string()
  .max(BIO_MAX_LENGTH, {
    message: `Bio must be ${BIO_MAX_LENGTH} characters or fewer`,
  })
  .transform((value) => value.trim());

// SQLite doesn't support Prisma enums, so we store the value as a string and
// enforce the union at the app layer. Keep these two in sync.
// Ordered from most-visible to least-visible.
export const BIRTHDAY_VISIBILITY_VALUES = [
  'EVERYONE',
  'FRIENDS_OF_FRIENDS',
  'FRIENDS',
  'NOBODY',
] as const;
export type BirthdayVisibility = (typeof BIRTHDAY_VISIBILITY_VALUES)[number];
export const BirthdayVisibilitySchema = z.enum(BIRTHDAY_VISIBILITY_VALUES);

// Ordered from most-visible to least-visible. No 'NOBODY' — a hidden wishlist is
// handled by not sharing the link rather than a visibility setting.
export const WISHLIST_VISIBILITY_VALUES = [
  'EVERYONE',
  'FRIENDS_OF_FRIENDS',
  'FRIENDS',
] as const;
export type WishlistVisibility = (typeof WISHLIST_VISIBILITY_VALUES)[number];
export const WishlistVisibilitySchema = z.enum(WISHLIST_VISIBILITY_VALUES);

export const WISHLIST_NOTE_MAX_LENGTH = 400;
// `.optional()` matters here: Conform's default coercion strips a
// literal empty-string form value to `undefined` before Zod ever sees it
// (@conform-to/zod's `stripEmptyString`), so a required `z.string()` would
// reject "clear the note" as a missing field rather than a valid empty one
// — the note would silently fail to save and the UI would revert to the
// last value. `.optional()` lets `undefined` through; the transform maps
// both `undefined` and whitespace-only input back to `''`.
export const WishlistNoteSchema = z
  .string()
  .max(WISHLIST_NOTE_MAX_LENGTH, {
    message: `Message must be ${WISHLIST_NOTE_MAX_LENGTH} characters or fewer`,
  })
  .optional()
  .transform((v) => (v ?? '').trim());

// Accepts YYYY-MM-DD from a native date input, or an empty string (meaning
// "clear the field"). Transforms to a Date at NOON UTC or null.
//
// Noon UTC is the same calendar date in every timezone from UTC-11 to
// UTC+11, which covers every populated timezone. Midnight UTC would shift
// the date backwards for users west of UTC (e.g. LA picks 1992-05-26 but
// local-time getters read May 25), so we intentionally sit at the middle
// of the day instead. Readers use `getUTCMonth` / `getUTCDate` to stay
// consistent with storage (see `getUpcomingBirthday`).
export const BirthdaySchema = z
  .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .transform((value) => {
    if (!value) return null;
    const parsed = new Date(`${value}T12:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });
