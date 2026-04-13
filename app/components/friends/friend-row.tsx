import { useState } from 'react';
import {
  LuCake,
  LuEllipsisVertical,
  LuTrash,
  LuUser,
  LuUsers,
} from 'react-icons/lu';
import { Link } from 'react-router';

import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#app/components/ui/dialog.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx';
import {
  BIRTHDAY_VISIBILITY_DAYS,
  formatBirthdayLabel,
  getUpcomingBirthday,
} from '#app/utils/birthday.ts';
import { cn } from '#app/utils/misc.tsx';
import { Text } from '../ui-kit/text.tsx';

export type FriendRowEntry = {
  friendshipId: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    birthday: Date | string | null;
    // String, not a true enum — see schema note. 'FRIENDS' | 'EVERYONE' |
    // 'NOBODY'. Optional because some callers (legacy test fixtures) don't
    // set it; defaults to showing the pill.
    birthdayVisibility?: string;
    image: { id: string; altText: string | null } | null;
  };
  mutualGroups: Array<{ id: string; name: string }>;
};

export function FriendRow({
  friend,
  displayName,
  onRemove,
}: Readonly<{
  friend: FriendRowEntry;
  displayName: string;
  onRemove: () => void;
}>) {
  const { user, mutualGroups } = friend;
  // Friend has explicitly hidden their birthday — don't compute the upcoming
  // label at all so nothing shows up in the row slot.
  const birthdayHidden = user.birthdayVisibility === 'NOBODY';
  const upcoming = birthdayHidden ? null : getUpcomingBirthday(user.birthday);
  const birthdaySoon =
    upcoming && upcoming.daysUntil <= BIRTHDAY_VISIBILITY_DAYS
      ? upcoming
      : null;
  const visibleGroups = mutualGroups.slice(0, 3);
  const extraGroupCount = Math.max(0, mutualGroups.length - visibleGroups.length);
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <Card
      variant="default"
      padding="none"
      data-testid="friend-row"
      className={cn(
        'group relative min-w-0 cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-shadow',
        'hover:border-border hover:shadow-md',
        'focus-within:border-border focus-within:shadow-md',
      )}
    >
      {/*
       * Whole-card click target. Same absolute click-catcher pattern as
       * the wishlist row primitive: a Link with `inset-0` covers the
       * entire card so any tap navigates to the friend's wishlist, while
       * the action menu in the right slot re-enables pointer events for
       * itself via `pointer-events-auto`.
       */}
      <Link
        to={`/users/${user.username}/wishlist`}
        prefetch="intent"
        aria-label={`View ${displayName}'s wishlist`}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />

      <div className="pointer-events-none relative flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
        <Avatar size="m" image={user.image} user={user} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
          <div className="flex w-full min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Text
              size="base"
              weight="medium"
              className="min-w-0 max-w-full truncate text-foreground"
            >
              {displayName}
            </Text>
            <Text size="xs" className="truncate text-muted-foreground">
              @{user.username}
            </Text>
          </div>
          {visibleGroups.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {visibleGroups.map((group) => (
                <span
                  key={group.id}
                  className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  <LuUsers className="h-3 w-3 flex-shrink-0" aria-hidden />
                  <span className="truncate">{group.name}</span>
                </span>
              ))}
              {extraGroupCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  +{extraGroupCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {birthdaySoon ? (
          <div
            className="flex flex-shrink-0 flex-wrap items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200"
            aria-label={`Birthday ${formatBirthdayLabel(birthdaySoon.date, birthdaySoon.daysUntil)}`}
          >
            <LuCake className="h-3.5 w-3.5" aria-hidden />
            <span>
              {formatBirthdayLabel(birthdaySoon.date, birthdaySoon.daysUntil)}
            </span>
          </div>
        ) : null}

        <div className="pointer-events-auto relative flex flex-shrink-0 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${displayName}`}
                className="h-10 w-10 rounded-lg border border-transparent text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={(event) => event.stopPropagation()}
              >
                <LuEllipsisVertical className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="min-w-[12rem]"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenuItem asChild className="gap-2 px-2 py-2 text-sm">
                <Link to={`/users/${user.username}`}>
                  <LuUser className="h-4 w-4 text-muted-foreground" aria-hidden />
                  View profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 px-2 py-2 text-sm text-red-600 focus:text-red-700"
                onSelect={(event) => {
                  // Stop the menu's default close+activation; we want to
                  // open our controlled confirm dialog instead.
                  event.preventDefault();
                  setRemoveOpen(true);
                }}
              >
                <LuTrash className="h-4 w-4" aria-hidden />
                Remove friend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {displayName}?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            This will end your friendship with {displayName}. You can always
            send them a new friend request later.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onRemove();
                setRemoveOpen(false);
              }}
            >
              Remove friend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
