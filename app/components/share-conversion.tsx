import { Link } from 'react-router';

import { Button } from '#app/components/ui/button.tsx';
import { track } from '#app/utils/analytics.client.ts';
import { useOptionalUser } from '#app/utils/user.ts';

// The public share page is the app's most-shared surface, but visitors had no
// way to learn what GiftPool is or sign up from it. Both CTAs carry
// redirectTo=/wishlist so a converted visitor lands on their own wishlist.
const SIGNUP_HREF = '/signup?redirectTo=%2Fwishlist';

export const ShareConversionBanner = ({
  ownerName,
}: {
  ownerName: string;
}) => {
  const user = useOptionalUser();
  if (user) return null;

  return (
    <div className="border-b border-border bg-primary/10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p>
          <span className="font-medium">{ownerName}</span> made this wishlist
          on GiftPool.
        </p>
        <Button asChild size="sm" className="whitespace-nowrap">
          <Link
            to={SIGNUP_HREF}
            onClick={() =>
              track('share_cta_clicked', { placement: 'banner' })
            }
          >
            Create your own — free
          </Link>
        </Button>
      </div>
    </div>
  );
};

export const ShareConversionCard = () => {
  const user = useOptionalUser();
  if (user) return null;

  return (
    <div className="container max-w-3xl pb-12">
      <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold">
            Want one of these for yourself?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Share what you actually want — no more guessing games.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button asChild>
            <Link
              to={SIGNUP_HREF}
              onClick={() =>
                track('share_cta_clicked', { placement: 'footer_card' })
              }
            >
              Get started
            </Link>
          </Button>
          <Link
            to="/login?redirectTo=%2Fwishlist"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
};
