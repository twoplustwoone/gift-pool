import { LuX } from 'react-icons/lu';
import { Link, useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import { type ExchangePerson } from '#app/utils/exchanges.server.ts';
import {
  OCCASION_TYPE_LABELS,
  type OccasionType,
} from '#app/utils/pool-constants.ts';
import { firstName, formatExchangeDate } from './exchange-copy.ts';

// Lives on the group overview, because that is where a non-participant
// actually is. Dismissing is per exchange and permanent for that exchange; the
// prompt then drops to `ExchangeQuietLine` rather than vanishing.
export function ExchangeJoinPrompt({
  exchange,
  participantCount,
  className,
}: Readonly<{
  exchange: {
    id: string;
    title: string;
    occasionType: OccasionType;
    eventDate: Date | string;
    organizer: ExchangePerson;
  };
  participantCount: number;
  className?: string;
}>) {
  const dismissFetcher = useFetcher();
  const joinFetcher = useFetcher();
  if (dismissFetcher.formData) return null;
  return (
    <Card className={className} data-testid="exchange-join-prompt">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{exchange.title} is happening</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A {OCCASION_TYPE_LABELS[exchange.occasionType].toLowerCase()} gift
            exchange — everyone draws one person and gives to them. Join before{' '}
            {firstName(exchange.organizer)} draws names on{' '}
            {formatExchangeDate(exchange.eventDate)}.
          </p>
        </div>
        <dismissFetcher.Form method="post" action={`/exchanges/${exchange.id}`}>
          <input
            type="hidden"
            name="intent"
            value={EXCHANGE_INTENT.DismissJoinPrompt}
          />
          <input type="hidden" name="exchangeId" value={exchange.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            className="-mr-2 -mt-2 h-11 w-11 rounded-full"
          >
            <LuX aria-hidden className="h-4 w-4" />
          </Button>
        </dismissFetcher.Form>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <joinFetcher.Form method="post" action={`/exchanges/${exchange.id}`}>
          <input type="hidden" name="intent" value={EXCHANGE_INTENT.OptIn} />
          <input type="hidden" name="exchangeId" value={exchange.id} />
          <Button type="submit" disabled={joinFetcher.state !== 'idle'}>
            Join the exchange
          </Button>
        </joinFetcher.Form>
        <dismissFetcher.Form method="post" action={`/exchanges/${exchange.id}`}>
          <input
            type="hidden"
            name="intent"
            value={EXCHANGE_INTENT.DismissJoinPrompt}
          />
          <input type="hidden" name="exchangeId" value={exchange.id} />
          <Button type="submit" variant="ghost">
            Not this time
          </Button>
        </dismissFetcher.Form>
        <span className="text-sm text-muted-foreground">
          {participantCount}{' '}
          {participantCount === 1 ? 'person is' : 'people are'} in
        </span>
      </div>
    </Card>
  );
}

// After dismissal: one quiet line with a Join link, so nobody is locked out
// by a stray tap.
export function ExchangeQuietLine({
  exchange,
  canJoin = true,
  className,
}: Readonly<{
  exchange: { id: string; title: string };
  // False once names are drawn: the line stays (the exchange exists and the
  // record will appear after the reveal) but joining is over.
  canJoin?: boolean;
  className?: string;
}>) {
  return (
    <p className={className} data-testid="exchange-quiet-line">
      <span className="text-sm text-muted-foreground">
        {exchange.title} exchange ·{' '}
        {canJoin ? "you're not in it" : "names are drawn · you're not in it"}
      </span>{' '}
      <Link
        to={`/exchanges/${exchange.id}`}
        className="text-sm font-semibold text-primary"
      >
        {canJoin ? 'Join' : 'View'}
      </Link>
    </p>
  );
}
