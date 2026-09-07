import { useState } from 'react';
import { LuCheck } from 'react-icons/lu';
import { useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { Section } from '#app/components/ui/section.tsx';
import {
  GIFT_STAGE,
  GIFT_STAGE_LABELS,
  GIFT_STAGE_ORDER,
  type GiftStage,
} from '#app/utils/exchange-constants.ts';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import { cn } from '#app/utils/misc.tsx';

const VISIBLE_STAGES: GiftStage[] = [
  GIFT_STAGE.GOT_IT,
  GIFT_STAGE.WRAPPED,
  GIFT_STAGE.GIVEN,
];

const NEXT_LABEL: Record<GiftStage, string | null> = {
  NONE: 'Mark it as got',
  GOT_IT: 'Mark it wrapped',
  WRAPPED: 'Mark it given',
  GIVEN: null,
};

function stageIndex(stage: GiftStage) {
  return GIFT_STAGE_ORDER.indexOf(stage);
}

// Three states the gifter owns. Status is never carried by colour alone: done
// is a filled tick, current is a dashed ring, upcoming is an empty ring.
// Marking a stage is optimistic and reversible (tap a done stage to step back).
export function GiftProgressStepper({
  exchangeId,
  stage,
  gifteeFirstName,
  lead = false,
}: Readonly<{
  exchangeId: string;
  stage: GiftStage;
  gifteeFirstName: string;
  // On the exchange day this card leads the page; same component, reordered.
  lead?: boolean;
}>) {
  const fetcher = useFetcher();
  const [optimistic, setOptimistic] = useState<GiftStage | null>(null);
  const current = fetcher.state === 'idle' ? stage : (optimistic ?? stage);
  const currentIndex = stageIndex(current);
  const [announcement, setAnnouncement] = useState('');

  const submit = (next: GiftStage) => {
    setOptimistic(next);
    setAnnouncement(
      next === GIFT_STAGE.NONE
        ? 'Gift progress reset.'
        : `Marked ${GIFT_STAGE_LABELS[next].toLowerCase()}.`,
    );
    const body = new FormData();
    body.set('intent', EXCHANGE_INTENT.SetGiftStage);
    body.set('exchangeId', exchangeId);
    body.set('stage', next);
    void fetcher.submit(body, { method: 'post' });
  };

  const nextStage = GIFT_STAGE_ORDER[currentIndex + 1];
  const nextLabel = NEXT_LABEL[current];

  return (
    <Section
      title="Your gift"
      description="Only you see this"
      className={cn(lead && 'border-pool/40')}
      data-testid="gift-progress"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ol className="flex items-center gap-2" aria-label="Gift progress">
        {VISIBLE_STAGES.map((s, i) => {
          const idx = stageIndex(s);
          const done = idx <= currentIndex;
          const isCurrentNext = idx === currentIndex + 1;
          return (
            <li key={s} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                // Done stages step back to the previous stage; the next stage
                // advances; later stages are not skippable.
                disabled={!done && !isCurrentNext}
                onClick={() =>
                  submit(
                    done ? (GIFT_STAGE_ORDER[idx - 1] ?? GIFT_STAGE.NONE) : s,
                  )
                }
                aria-pressed={done}
                aria-label={`${GIFT_STAGE_LABELS[s]}${done ? ' (done)' : isCurrentNext ? ' (next)' : ''}`}
                data-testid={`stage-${s.toLowerCase()}`}
                data-state={done ? 'done' : isCurrentNext ? 'next' : 'later'}
                className="flex min-h-11 flex-1 flex-col items-center gap-1 rounded-lg px-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border-2',
                    done && 'border-pool bg-pool text-pool-foreground',
                    isCurrentNext && 'border-dashed border-pool text-pool',
                    !done && !isCurrentNext && 'border-border text-transparent',
                  )}
                >
                  {done ? <LuCheck className="h-4 w-4" /> : null}
                </span>
                <span
                  className={cn(
                    done ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {GIFT_STAGE_LABELS[s]}
                </span>
              </button>
              {i < VISIBLE_STAGES.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'h-px w-4 shrink-0',
                    idx < currentIndex ? 'bg-pool' : 'bg-border',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {nextLabel && nextStage ? (
        <Button
          type="button"
          className="mt-4 w-full sm:w-auto"
          variant={lead ? 'default' : 'outline'}
          onClick={() => submit(nextStage)}
          disabled={fetcher.state !== 'idle'}
        >
          {nextLabel}
        </Button>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        {gifteeFirstName} marks it received on their side.
      </p>
    </Section>
  );
}
