import { useEffect, useRef, useState } from 'react';
import { LuGift } from 'react-icons/lu';
import { Link, useFetcher } from 'react-router';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '#app/components/ui/responsive-dialog.tsx';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import {
  type ExchangePerson,
  type OwnAssignmentView,
} from '#app/utils/exchanges.server.ts';
import { cn } from '#app/utils/misc.tsx';
import { displayName, firstName, formatExchangeDate } from './exchange-copy.ts';

// The "you drew…" moment. A deliberate cover step: the name is the one thing
// in the product that must not appear on a screen someone else can glance at,
// so the user picks the moment. Opening the cover marks the assignment viewed
// (once, server-side) and announces the name exactly once via an assertive
// live region. Reopening the exchange never re-shows this screen.
export function YouDrewCard({
  exchangeId,
  exchangeTitle,
  assignment,
  organizer,
  spendingGuideline,
  eventDate,
  exchangeHref,
  viewerIsOrganizer,
  open,
  onOpenChange,
}: Readonly<{
  exchangeId: string;
  exchangeTitle: string;
  assignment: OwnAssignmentView;
  organizer: ExchangePerson;
  spendingGuideline: string | null;
  eventDate: Date | string;
  exchangeHref: string;
  viewerIsOrganizer: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const fetcher = useFetcher();
  const [revealed, setRevealed] = useState(false);
  const announced = useRef(false);
  const [announcement, setAnnouncement] = useState('');
  const giftee = assignment.giftee;
  const name = displayName(giftee);

  useEffect(() => {
    if (revealed && !announced.current) {
      announced.current = true;
      setAnnouncement(`You drew ${name}.`);
    }
  }, [revealed, name]);

  const reveal = () => {
    setRevealed(true);
    const body = new FormData();
    body.set('intent', EXCHANGE_INTENT.MarkAssignmentViewed);
    body.set('exchangeId', exchangeId);
    void fetcher.submit(body, { method: 'post' });
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <p role="alert" aria-live="assertive" className="sr-only">
          {announcement}
        </p>
        {!revealed ? (
          <>
            <ResponsiveDialogHeader>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {exchangeTitle}
              </p>
              <ResponsiveDialogTitle>Names are drawn</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                Your person is behind this card. Only you will ever see it, so
                pick a moment when nobody's reading over your shoulder.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <button
              type="button"
              onClick={reveal}
              aria-label="Tap to see who you drew"
              data-testid="you-drew-cover"
              className="group flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-pool/50 bg-pool/5 p-6 text-pool outline-none transition-colors hover:bg-pool/10 focus-visible:ring-2 focus-visible:ring-ring motion-safe:active:scale-[0.99]"
            >
              <LuGift aria-hidden className="h-10 w-10" />
              <span className="text-sm font-semibold">
                Tap to see who you drew
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Later
            </Button>
          </>
        ) : (
          <div
            className={cn(
              'space-y-4 text-center',
              'motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in',
            )}
            data-testid="you-drew-result"
          >
            <ResponsiveDialogHeader className="items-center text-center">
              <ResponsiveDialogTitle className="text-base font-medium text-muted-foreground">
                You drew
              </ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="flex flex-col items-center gap-3">
              <Avatar
                size={20}
                className="ring-4 ring-pool/20"
                image={giftee.image}
                user={giftee}
              />
              <p className="text-2xl font-bold leading-tight">{name}</p>
              <ResponsiveDialogDescription className="text-center">
                You're giving {firstName(giftee)} a gift. {firstName(giftee)}{' '}
                has no idea it's you.
              </ResponsiveDialogDescription>
            </div>
            <dl className="mx-auto grid max-w-xs grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-muted px-2 py-2">
                <dt className="text-[10px] uppercase text-muted-foreground">
                  Guideline
                </dt>
                <dd className="font-semibold">{spendingGuideline ?? '—'}</dd>
              </div>
              <div className="rounded-lg bg-muted px-2 py-2">
                <dt className="text-[10px] uppercase text-muted-foreground">
                  By
                </dt>
                <dd className="font-semibold">
                  {formatExchangeDate(eventDate)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted px-2 py-2">
                <dt className="text-[10px] uppercase text-muted-foreground">
                  Wishlist
                </dt>
                <dd className="font-semibold">
                  {assignment.wishlistItemCount}{' '}
                  {assignment.wishlistItemCount === 1 ? 'item' : 'items'}
                </dd>
              </div>
            </dl>
            <div className="flex flex-col gap-2">
              {assignment.canViewWishlist ? (
                <Button asChild>
                  <Link to={`/users/${giftee.username}/wishlist`}>
                    See {firstName(giftee)}'s wishlist
                  </Link>
                </Button>
              ) : null}
              <Button
                asChild
                variant={assignment.canViewWishlist ? 'ghost' : 'default'}
              >
                <Link to={exchangeHref} onClick={() => onOpenChange(false)}>
                  Go to the exchange
                </Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only you can see this.
              {viewerIsOrganizer
                ? ''
                : ` Not even ${firstName(organizer)} knows.`}
            </p>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
