import { type ReactNode } from 'react';
import { SecrecyNote } from '#app/components/ui/secrecy-note.tsx';
import { Section } from '#app/components/ui/section.tsx';
import { type ExchangeOrganizerProgress } from '#app/utils/exchanges.server.ts';

// Totals only, and only across the whole exchange. No per-person figure is
// ever rendered here — a count scoped to one person could be worked backwards
// into a pairing. The dashed note states the boundary in the product.
export function OrganizerProgressPanel({
  progress,
  afterEvent,
  actions,
}: Readonly<{
  progress: ExchangeOrganizerProgress;
  // On and after the exchange day the figures change tense.
  afterEvent: boolean;
  // Slot for "Send a reminder" (Phase B) and the reveal block.
  actions?: ReactNode;
}>) {
  const rows: Array<[string, number]> = afterEvent
    ? [
        ['Gifts given', progress.given],
        ['Marked received', progress.received],
      ]
    : [
        ['Have their gift', progress.haveGift],
        ['Wrapped', progress.wrapped],
      ];
  return (
    <Section
      title="How it's going"
      description="Organizer"
      data-testid="organizer-progress"
    >
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-bold">
              {value}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                of {progress.total}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <SecrecyNote title="Totals only" className="mt-3">
        You can't see who has who, who sent what, or anything about one person.
      </SecrecyNote>
      {actions ? <div className="mt-4 space-y-3">{actions}</div> : null}
    </Section>
  );
}
