import { useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { Section } from '#app/components/ui/section.tsx';
import {
  GIFT_OUTCOME,
  GIFT_OUTCOME_LABELS,
  type GiftOutcome,
} from '#app/utils/exchange-constants.ts';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';

// The giftee's outcome, captured while the feeling is real and shown to the
// gifter only after the reveal. Two options, both kind. No stars, no text.
export function ReceivedCard({
  exchangeId,
  received,
}: Readonly<{
  exchangeId: string;
  received: { receivedAt: Date | string; outcome: GiftOutcome | null } | null;
}>) {
  const fetcher = useFetcher();
  const submitted =
    fetcher.formData?.get('outcome')?.toString() ?? received?.outcome ?? null;

  return (
    <Section
      title="What you got"
      description={
        submitted
          ? "Thanks — they'll see this after the reveal."
          : "Someone gave you something. Tell them how it landed — they'll see it after the reveal."
      }
      data-testid="received-card"
    >
      <div className="flex flex-wrap gap-2">
        {(Object.keys(GIFT_OUTCOME) as GiftOutcome[]).map((outcome) => {
          const selected = submitted === outcome;
          return (
            <fetcher.Form method="post" key={outcome}>
              <input
                type="hidden"
                name="intent"
                value={EXCHANGE_INTENT.SetReceived}
              />
              <input type="hidden" name="exchangeId" value={exchangeId} />
              <input type="hidden" name="outcome" value={outcome} />
              <Button
                type="submit"
                variant={selected ? 'default' : 'outline'}
                aria-pressed={selected}
                disabled={fetcher.state !== 'idle'}
              >
                {GIFT_OUTCOME_LABELS[outcome]}
              </Button>
            </fetcher.Form>
          );
        })}
      </div>
    </Section>
  );
}
