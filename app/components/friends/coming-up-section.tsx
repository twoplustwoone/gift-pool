import { LuCake, LuCalendar, LuGift } from 'react-icons/lu';
import { Link } from 'react-router';

import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import {
  COMING_UP_WINDOW_DAYS,
  formatBirthdayLabel,
  getUpcomingBirthday,
} from '#app/utils/birthday.ts';
import { Text } from '../ui-kit/text.tsx';
import { type FriendRowEntry } from './friend-row.tsx';

type ComingUpFriend = {
  daysUntil: number;
  entry: FriendRowEntry;
  label: string;
};

// Friends with a birthday inside the window, soonest first.
//
// Exported for tests: the visibility rule is the whole point of this
// component, and it's much cheaper to assert on the derived list than to
// scrape the rendered rail.
export function selectComingUpFriends(
  friends: readonly FriendRowEntry[],
  windowDays: number = COMING_UP_WINDOW_DAYS,
): ComingUpFriend[] {
  return friends
    .flatMap((entry) => {
      // `birthdayVisible` is the server-computed `canViewBirthday` result and
      // is the single source of truth — a friend who hid their birthday must
      // never surface here, the same guard `friend-row.tsx` applies to the
      // badge. Optimistic just-accepted entries leave it `undefined`, which
      // stays permissive until the next loader run fills it in.
      if (entry.user.birthdayVisible === false) return [];
      const upcoming = getUpcomingBirthday(entry.user.birthday);
      if (!upcoming || upcoming.daysUntil > windowDays) return [];
      return [
        {
          daysUntil: upcoming.daysUntil,
          entry,
          label: formatBirthdayLabel(upcoming.date, upcoming.daysUntil),
        },
      ];
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

function ComingUpCard({ entry, label }: ComingUpFriend) {
  const { user } = entry;
  const displayName = user.name ?? user.username;

  return (
    <li className="flex w-44 shrink-0 snap-start flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:w-48">
      <Link
        to={`/users/${user.username}`}
        prefetch="intent"
        className="flex min-w-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      >
        <Avatar size={10} image={user.image} user={user} />
        <div className="min-w-0">
          <Text
            size="sm"
            weight="semibold"
            className="block truncate text-foreground"
          >
            {displayName}
          </Text>
          <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-gift">
            <LuCake className="h-3 w-3 shrink-0" aria-hidden />
            {/* The cake icon is decorative, so without this the date reads as
             * a bare "Jul 28" with no hint of what it refers to. */}
            <span className="sr-only">Birthday&nbsp;</span>
            <span className="truncate">{label}</span>
          </span>
        </div>
      </Link>
      <Button asChild size="sm" className="w-full">
        {/* `/pools/new` accepts a standalone `?recipientId=` and opens with
         * the recipient preselected — no dedicated route needed.
         *
         * The label has to name the recipient: several of these render at
         * once, and a screen reader listing links would otherwise announce
         * "Plan gift" repeatedly with no way to tell them apart. */}
        <Link
          to={`/pools/new?recipientId=${user.id}`}
          aria-label={`Plan gift for ${displayName}`}
        >
          <LuGift className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Plan gift
        </Link>
      </Button>
    </li>
  );
}

export function ComingUpSection({
  friends,
  windowDays = COMING_UP_WINDOW_DAYS,
}: Readonly<{
  friends: readonly FriendRowEntry[];
  windowDays?: number;
}>) {
  const comingUp = selectComingUpFriends(friends, windowDays);
  // Nothing on the horizon is not a state worth a card — stay silent.
  if (comingUp.length === 0) return null;

  return (
    <section
      aria-labelledby="coming-up-heading"
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pool/15 text-pool">
          <LuCalendar className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2
            id="coming-up-heading"
            className="text-sm font-semibold text-foreground"
          >
            Coming up
          </h2>
          <Text size="xs" className="text-muted-foreground">
            Birthdays in the next {windowDays} days
          </Text>
        </div>
      </div>
      {/* Horizontal rail on narrow screens; on wide ones it simply stops
       * overflowing. Scrollbar is styled down rather than hidden so the
       * affordance survives on desktop. */}
      <ul className="-mx-1 flex snap-x snap-proximity gap-3 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar]:h-1.5">
        {comingUp.map((item) => (
          <ComingUpCard key={item.entry.friendshipId} {...item} />
        ))}
      </ul>
    </section>
  );
}
