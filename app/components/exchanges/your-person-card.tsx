import { LuGift } from 'react-icons/lu';
import { Link } from 'react-router';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Section } from '#app/components/ui/section.tsx';
import { type OwnAssignmentView } from '#app/utils/exchanges.server.ts';
import { displayName, firstName, formatExchangeDate } from './exchange-copy.ts';

// "Your person" is the section label only — everywhere else the copy uses the
// name. The wishlist link is the primary action of the whole drawn page.
export function YourPersonCard({
  assignment,
  spendingGuideline,
  eventDate,
  viewerIsFriendOfGiftee,
}: Readonly<{
  assignment: OwnAssignmentView;
  spendingGuideline: string | null;
  eventDate: Date | string;
  viewerIsFriendOfGiftee?: boolean;
}>) {
  const giftee = assignment.giftee;
  const first = firstName(giftee);
  const meta = [spendingGuideline, `by ${formatExchangeDate(eventDate)}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <Section title="Your person" data-testid="your-person">
      <div className="flex items-center gap-3">
        <Avatar
          size={14}
          image={giftee.image}
          user={giftee}
          className="ring-2 ring-pool/20"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight">
            {displayName(giftee)}
          </p>
          <p className="text-sm text-muted-foreground">{meta}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {assignment.canViewWishlist ? (
          <Button asChild className="w-full sm:w-auto">
            <Link to={`/users/${giftee.username}/wishlist`}>
              <LuGift aria-hidden className="mr-2 h-4 w-4" />
              See {first}'s wishlist · {assignment.wishlistItemCount}{' '}
              {assignment.wishlistItemCount === 1 ? 'item' : 'items'}
            </Link>
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground">
          You can see {first}'s wishlist while the exchange runs
          {viewerIsFriendOfGiftee === false
            ? ", even though you're not friends on Gift Pool"
            : ''}
          . If you claim something, {first} won't know it was you.
        </p>
      </div>
    </Section>
  );
}
