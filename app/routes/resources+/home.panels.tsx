import { type LoaderFunctionArgs } from 'react-router';
import { getUserId } from '#app/utils/auth.server';
import { prisma } from '#app/utils/db.server';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

type GroupMemberUser = {
  id: string;
  name: string | null;
  username: string;
  birthday: Date | null;
  birthdayVisibility: string;
};

type Membership = {
  giftGroup: {
    id: string;
    groupMembers: Array<{ user: GroupMemberUser }>;
  };
};

type UpcomingBirthdayEntry = {
  id: string;
  name: string;
  username: string | null;
  date: Date;
  groupId: string | null;
};

type HomeBirthday = {
  id: string;
  name: string;
  username: string | null;
  dateISO: string;
  dateLabel: string;
  groupId: string | null;
};

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// Find next birthday date (this year or next) from a month/day reference.
// Reads the stored birthday in UTC because `BirthdaySchema` writes noon UTC
// — local-time getters would shift by a day for viewers west of UTC.
function nextBirthdayDate(birthday: Date, now = new Date()) {
  const bMonth = birthday.getUTCMonth();
  const bDate = birthday.getUTCDate();
  const thisYear = new Date(now.getFullYear(), bMonth, bDate);
  if (thisYear >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    return thisYear;
  }
  return new Date(now.getFullYear() + 1, bMonth, bDate);
}

// Is this group-mate's birthday visible to the viewer?
// - `NOBODY` → never.
// - `FRIENDS` → only when the viewer has a confirmed friendship.
// - `FRIENDS_OF_FRIENDS` → only when the viewer is a direct friend OR shares a mutual friend.
// - `EVERYONE` → always.
// - Unexpected values default to the most restrictive behaviour (treat as FRIENDS).
function isBirthdayVisibleToViewer(
  user: GroupMemberUser,
  friendIds: Set<string>,
  friendOfFriendIds: Set<string>,
) {
  if (user.birthdayVisibility === 'NOBODY') return false;
  if (user.birthdayVisibility === 'EVERYONE') return true;
  if (user.birthdayVisibility === 'FRIENDS_OF_FRIENDS') {
    return friendIds.has(user.id) || friendOfFriendIds.has(user.id);
  }
  // FRIENDS or any unrecognised value: require a direct friendship
  return friendIds.has(user.id);
}

// Walk the viewer's group memberships and build a de-duped map of
// `userId → upcoming-birthday entry`. Pulled out of the loader body to keep
// the complexity low — the loader just orchestrates DB calls and formats.
function collectUpcomingBirthdays(
  memberships: Membership[],
  friendIds: Set<string>,
  friendOfFriendIds: Set<string>,
  viewerId: string,
  now: Date,
): Map<string, UpcomingBirthdayEntry> {
  const birthdayMap = new Map<string, UpcomingBirthdayEntry>();
  for (const m of memberships) {
    for (const gm of m.giftGroup.groupMembers) {
      const u = gm.user;
      if (!u.birthday || u.id === viewerId) continue;
      if (!isBirthdayVisibleToViewer(u, friendIds, friendOfFriendIds)) continue;
      if (birthdayMap.has(u.id)) continue;
      birthdayMap.set(u.id, {
        id: u.id,
        name: u.name ?? u.username ?? 'Friend',
        username: u.username,
        date: nextBirthdayDate(u.birthday, now),
        groupId: m.giftGroup.id,
      });
    }
  }
  return birthdayMap;
}

function sortAndSliceUpcomingBirthdays(
  birthdayMap: Map<string, UpcomingBirthdayEntry>,
  now: Date,
): HomeBirthday[] {
  return Array.from(birthdayMap.values())
    .filter((b) => b.date.getTime() - now.getTime() <= SIXTY_DAYS_MS)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5)
    .map((b) => ({
      id: b.id,
      name: b.name,
      username: b.username,
      dateISO: b.date.toISOString().slice(0, 10),
      dateLabel: formatDateLabel(b.date),
      groupId: b.groupId,
    }));
}

function buildFriendIdSet(
  friendships: Array<{ userAId: string; userBId: string }>,
  viewerId: string,
): Set<string> {
  const friendIds = new Set<string>();
  for (const f of friendships) {
    friendIds.add(f.userAId === viewerId ? f.userBId : f.userAId);
  }
  return friendIds;
}

function resolveMockPayload(mock: 'empty' | 'data' | undefined) {
  if (mock === 'empty') {
    return { birthdays: [], activity: [] };
  }
  if (mock === 'data') {
    const now = new Date();
    const in10 = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 10,
    );
    return {
      birthdays: [
        {
          id: 'u_mock_1',
          name: 'Alex Johnson',
          username: 'alex',
          dateISO: in10.toISOString().slice(0, 10),
          dateLabel: formatDateLabel(in10),
          groupId: 'g_mock_1',
        },
      ],
      activity: [
        {
          id: 'a_mock_1',
          description:
            'Jamie added “Noise-cancelling headphones” to Family Gifts',
          timestampISO: now.toISOString(),
        },
      ],
    };
  }
  return null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mockParam = url.searchParams.get('mock');
  const mock: 'empty' | 'data' | undefined =
    mockParam === 'empty' || mockParam === 'data' ? mockParam : undefined;

  const mocked = resolveMockPayload(mock);
  if (mocked) return mocked;

  const userId = await getUserId(request);
  if (!userId) {
    return { birthdays: [], activity: [] };
  }

  // Upcoming birthdays for users sharing at least one group with the current
  // user. We also load the viewer's friendships so we can enforce
  // `birthdayVisibility === 'FRIENDS'` — otherwise a group-mate who isn't
  // actually friends with the viewer would leak through.
  const [memberships, friendships] = await Promise.all([
    prisma.usersInGiftGroups.findMany({
      where: { userId },
      select: {
        giftGroup: {
          select: {
            id: true,
            groupMembers: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    birthday: true,
                    birthdayVisibility: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    }),
  ]);

  const friendIds = buildFriendIdSet(friendships, userId);

  // Collect group-member IDs with FRIENDS_OF_FRIENDS birthday visibility that
  // are not already direct friends — these need a mutual-friend check.
  const fofCandidateIds = new Set<string>();
  for (const m of memberships) {
    for (const gm of m.giftGroup.groupMembers) {
      const u = gm.user;
      if (
        u.id !== userId &&
        u.birthdayVisibility === 'FRIENDS_OF_FRIENDS' &&
        !friendIds.has(u.id)
      ) {
        fofCandidateIds.add(u.id);
      }
    }
  }

  // One extra query: find any friendship that links a FOF candidate to one of
  // the viewer's direct friends, confirming the mutual-friend relationship.
  const friendOfFriendIds = new Set<string>();
  if (fofCandidateIds.size > 0) {
    const friendIdArray = Array.from(friendIds);
    const candidateArray = Array.from(fofCandidateIds);
    const mutualLinks = await prisma.friendship.findMany({
      where: {
        OR: [
          { userAId: { in: candidateArray }, userBId: { in: friendIdArray } },
          { userBId: { in: candidateArray }, userAId: { in: friendIdArray } },
        ],
      },
      select: { userAId: true, userBId: true },
    });
    for (const f of mutualLinks) {
      const fofId = fofCandidateIds.has(f.userAId) ? f.userAId : f.userBId;
      friendOfFriendIds.add(fofId);
    }
  }

  const now = new Date();
  const birthdayMap = collectUpcomingBirthdays(
    memberships,
    friendIds,
    friendOfFriendIds,
    userId,
    now,
  );
  const birthdays = sortAndSliceUpcomingBirthdays(birthdayMap, now);

  // TODO: Wire real recent activity once available.
  const activity: Array<{
    id: string;
    description: string;
    timestampISO: string;
  }> = [];
  return { birthdays, activity };
}
