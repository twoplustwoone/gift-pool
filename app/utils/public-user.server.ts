// The single sanctioned way to serialize a user's birthday to a viewer.
//
// `canViewBirthday` gates *rendering*, but in React Router framework mode every
// field a loader returns is serialized into the SSR/`?_data=` payload — so a
// component hiding the birthday is not enough; the value must be stripped
// before it leaves the loader. Route ALL birthday-bearing user payloads through
// `gateBirthday` so a NOBODY/insufficient-visibility target's date can never be
// read from the network response.

import {
  canViewBirthday,
  type BirthdayVisibilityFacts,
} from './birthday-visibility.server.ts';

// Prisma select fragment that always pairs `birthday` with `birthdayVisibility`,
// so the gate always has the input it needs. Spread it into a user `select`.
export const birthdayGateSelect = {
  birthday: true,
  birthdayVisibility: true,
} as const;

type UserWithBirthday = {
  birthday: Date | null;
  birthdayVisibility: string;
};

// Returns the same user object with `birthday` nulled unless the viewer may see
// it. Preserves every other field so callers keep their existing payload shape.
export function gateBirthday<T extends UserWithBirthday>(
  user: T,
  facts: BirthdayVisibilityFacts,
): T {
  if (canViewBirthday(user, facts)) return user;
  return { ...user, birthday: null };
}
