import { type LoaderFunctionArgs } from 'react-router';
import { getUserId } from '#app/utils/auth.server';
import { prisma } from '#app/utils/db.server';
function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// Find next birthday date (this year or next) from a month/day reference
function nextBirthdayDate(birthday: Date, now = new Date()) {
  const bMonth = birthday.getMonth();
  const bDate = birthday.getDate();
  const thisYear = new Date(now.getFullYear(), bMonth, bDate);
  if (thisYear >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    return thisYear;
  }
  return new Date(now.getFullYear() + 1, bMonth, bDate);
}
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mockParam = url.searchParams.get('mock');
  const mock: 'empty' | 'data' | undefined =
    mockParam === 'empty' || mockParam === 'data'
      ? (mockParam as any)
      : undefined;

  // Mocked responses for tests
  if (mock === 'empty') {
    return {
      birthdays: [],
      activity: [],
    };
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
  const userId = await getUserId(request);
  if (!userId) {
    return {
      birthdays: [],
      activity: [],
    };
  }

  // Upcoming birthdays for users sharing at least one group with the current user
  const memberships = await prisma.usersInGiftGroups.findMany({
    where: {
      userId,
    },
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
  });
  const now = new Date();
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;

  // Collect potential birthdays with at least one shared group id
  const birthdayMap = new Map<
    string,
    {
      id: string;
      name: string;
      username: string | null;
      date: Date;
      groupId: string | null;
    }
  >();
  for (const m of memberships) {
    for (const gm of m.giftGroup.groupMembers) {
      const u = gm.user;
      if (!u.birthday || u.id === userId) continue;
      // Respect the owner's privacy choice — hide their upcoming birthday
      // from the Home reminders panel when they've opted out. `FRIENDS` and
      // `EVERYONE` both keep showing since anyone sharing a group with them
      // is reading this panel.
      if (u.birthdayVisibility === 'NOBODY') continue;
      const nextDate = nextBirthdayDate(u.birthday, now);
      const key = u.id;
      if (!birthdayMap.has(key)) {
        birthdayMap.set(key, {
          id: u.id,
          name: u.name ?? u.username ?? 'Friend',
          username: u.username,
          date: nextDate,
          groupId: m.giftGroup.id,
        });
      }
    }
  }
  const birthdays = Array.from(birthdayMap.values())
    .filter((b) => b.date.getTime() - now.getTime() <= sixtyDays)
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

  // TODO: Wire real recent activity once available.
  const activity: Array<{
    id: string;
    description: string;
    timestampISO: string;
  }> = [];
  return {
    birthdays,
    activity,
  };
}
export default null;
