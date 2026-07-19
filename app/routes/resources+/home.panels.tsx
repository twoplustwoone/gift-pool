import { type LoaderFunctionArgs } from 'react-router';
import { getUserId } from '#app/utils/auth.server';
import { canViewBirthday } from '#app/utils/birthday-visibility.server';
import { prisma } from '#app/utils/db.server';
import {
  getForYouActions,
  getRecentGiftMemory,
} from '#app/utils/home-for-you.server';

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
    name: string;
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
      // The home panel stays friend-gated: it deliberately does not apply the
      // group-share override (condition (b) of `canViewBirthday`), so a
      // group-mate who isn't a friend can't surface here just by enabling
      // shareBirthday. That override is the group overview's concern.
      const visible = canViewBirthday(u, {
        isDirectFriend: friendIds.has(u.id),
        isMutualFriend: friendOfFriendIds.has(u.id),
        sharesActiveBirthdayGroup: false,
      });
      if (!visible) continue;
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
    return { birthdays: [], forYou: [], memory: [], groups: [] };
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
      forYou: [
        {
          id: 'plan:u_mock_1',
          kind: 'plan' as const,
          title: 'Plan a gift for Alex Johnson',
          detail: `Birthday · ${formatDateLabel(in10)}`,
          href: '/users/alex',
        },
      ],
      memory: [
        {
          id: 'p_mock_1',
          recipientLabel: 'Jamie',
          giftLabel: 'Noise-cancelling headphones',
          contributorCount: 4,
          whenISO: now.toISOString(),
        },
      ],
      groups: [{ id: 'g_mock_1', name: 'Family Gifts' }],
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
    return { birthdays: [], forYou: [], memory: [], groups: [] };
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
            name: true,
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

  // "For you" actions + earned Gift Memory (§6.2). Replaces the old
  // recent-activity stub — memory is factual completed-gift history only.
  const [forYou, memory] = await Promise.all([
    getForYouActions(
      userId,
      birthdays.map((b) => ({
        id: b.id,
        name: b.name,
        username: b.username,
        dateLabel: b.dateLabel,
      })),
    ),
    getRecentGiftMemory(userId),
  ]);

  const groups = memberships
    .map((m) => ({ id: m.giftGroup.id, name: m.giftGroup.name }))
    .slice(0, 4);

  return { birthdays, forYou, memory, groups };
}
