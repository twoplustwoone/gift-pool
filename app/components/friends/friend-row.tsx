import { useState } from 'react';
import {
  LuCake,
  LuEllipsisVertical,
  LuHeart,
  LuTrash,
  LuUser,
  LuUsers,
} from 'react-icons/lu';
import { Link } from 'react-router';

import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogClose as DialogClose,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#app/components/ui/responsive-dialog.tsx';
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
    // Server-computed via `canViewBirthday` (the single source of truth for
    // birthday visibility). Optional because optimistic just-accepted entries
    // are built client-side before the loader has computed it — `undefined`
    // shows the pill, and the next loader run fills in the real value.
    birthdayVisible?: boolean;
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
  // Friend has hidden their birthday from the viewer (per `canViewBirthday`) —
  // don't compute the upcoming label at all so nothing shows up in the row slot.
  const birthdayHidden = user.birthdayVisible === false;
  const upcoming = birthdayHidden ? null : getUpcomingBirthday(user.birthday);
  const birthdaySoon =
    upcoming && upcoming.daysUntil <= BIRTHDAY_VISIBILITY_DAYS
      ? upcoming
      : null;
  // One chip plus a count. The meta row is a single line, and at grid widths
  // three chips would each shrink to an unreadable stub; the profile page
  // carries the full list.
  const visibleGroups = mutualGroups.slice(0, 1);
  const extraGroupCount = Math.max(
    0,
    mutualGroups.length - visibleGroups.length,
  );
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <Card
      variant="default"
      padding="none"
      data-testid="friend-row"
      className={cn(
        // `h-full` matters in the grid: the <li> stretches to the row, and
        // without this the card floats at its own height inside that cell,
        // so neighbours don't even share a bottom edge.
        'group relative h-full min-w-0 cursor-pointer overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-shadow',
        'hover:border-border hover:shadow-md',
        'focus-within:border-border focus-within:shadow-md',
      )}
    >
      {/*
       * Whole-card click target. Same absolute click-catcher pattern as
       * the wishlist row primitive: a Link with `inset-0` covers the
       * entire card so any tap navigates to the friend's profile, while
       * the action menu in the right slot re-enables pointer events for
       * itself via `pointer-events-auto`.
       */}
      <Link
        to={`/users/${user.username}`}
        prefetch="intent"
        aria-label={`View ${displayName}'s profile`}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      />

      <div className="pointer-events-none relative flex items-center gap-3 p-3">
        <Avatar size={11} image={user.image} user={user} />
        {/*
         * At most two rows — identity, then meta — and never more, so card
         * height doesn't move with name length, birthday, or group count.
         *
         * 2.875rem is both rows together (24px name + 2px gap + 20px meta).
         * Pinning it is what keeps a friend with no birthday and no shared
         * group the same height as a full card; `justify-center` then centres
         * that lone name rather than leaving it top-weighted. Note min-height
         * resolves against the border box here, so this belongs on the text
         * column, not on the padded row above it.
         */}
        <div className="flex min-h-[2.875rem] min-w-0 flex-1 flex-col items-start justify-center gap-0.5 text-left">
          <div className="flex w-full min-w-0 items-baseline gap-x-2">
            {/* Capped rather than shrink-to-fit so the handle always keeps a
             * readable share; both truncate instead of wrapping to a second
             * line, which is what made cards with long names taller. */}
            <Text
              size="base"
              weight="medium"
              className="max-w-[65%] flex-none truncate text-foreground"
            >
              {displayName}
            </Text>
            <Text size="xs" className="min-w-0 truncate text-muted-foreground">
              @{user.username}
            </Text>
          </div>
          {/* The birthday sits on this line rather than beside the name: out
           * there it competed with the name for width and forced it to
           * truncate early. Single line — chips never wrap. */}
          <div
            className={cn(
              'flex h-5 w-full min-w-0 items-center gap-1 overflow-hidden',
              !birthdaySoon && visibleGroups.length === 0 && 'hidden',
            )}
          >
            {birthdaySoon ? (
              <span
                className="inline-flex flex-none items-center gap-1 rounded-full bg-warning-muted px-2 py-0.5 text-[11px] font-semibold text-warning ring-1 ring-inset ring-warning/30"
                aria-label={`Birthday ${formatBirthdayLabel(birthdaySoon.date, birthdaySoon.daysUntil)}`}
              >
                <LuCake className="h-3 w-3 flex-shrink-0" aria-hidden />
                <span>
                  {formatBirthdayLabel(
                    birthdaySoon.date,
                    birthdaySoon.daysUntil,
                  )}
                </span>
              </span>
            ) : null}
            {visibleGroups.map((group) => (
              <span
                key={group.id}
                className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                <LuUsers className="h-3 w-3 flex-shrink-0" aria-hidden />
                <span className="truncate">{group.name}</span>
              </span>
            ))}
            {extraGroupCount > 0 ? (
              <span className="inline-flex flex-none items-center rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                +{extraGroupCount}
              </span>
            ) : null}
          </div>
        </div>

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
              {/* The card itself now routes to the profile, so the wishlist
               * needs its own entry point — it's the action people actually
               * come here for. */}
              <DropdownMenuItem asChild className="gap-2 px-2 py-2 text-sm">
                <Link to={`/users/${user.username}/wishlist`} prefetch="intent">
                  <LuHeart
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  View wishlist
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="gap-2 px-2 py-2 text-sm">
                <Link to={`/users/${user.username}`}>
                  <LuUser
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  View profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 px-2 py-2 text-sm text-destructive focus:text-destructive"
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
