import { Avatar } from '#app/components/ui/avatar.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { type ExchangePerson } from '#app/utils/exchanges.server.ts';
import { displayName } from './exchange-copy.ts';

// The one thing everybody opens the revealed page for goes first: who had
// you. "Your gifter" is the post-reveal name for the role — the secret is gone.
export function YourGifterCard({
  gifter,
  guessedRight,
}: Readonly<{
  gifter: ExchangePerson;
  // null until guessing ships (Phase B); then true/false.
  guessedRight: boolean | null;
}>) {
  return (
    <Card
      className="flex items-center gap-3 border-pool/40 bg-pool/5"
      data-testid="your-gifter"
    >
      <Avatar
        size="s"
        className="!h-12 !w-12"
        image={gifter.image}
        user={gifter}
      />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight">
          {displayName(gifter)} had you
        </p>
        {guessedRight === null ? null : (
          <p className="text-sm text-muted-foreground">
            {guessedRight ? 'You guessed right.' : "You didn't see it coming."}
          </p>
        )}
      </div>
    </Card>
  );
}
