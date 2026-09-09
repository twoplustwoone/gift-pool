import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '#app/components/ui/responsive-dialog.tsx';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import { type DrawPreview } from '#app/utils/exchanges.server.ts';
import { cn } from '#app/utils/misc.tsx';
import { countWord, listNames, repeatsSentence } from './exchange-copy.ts';

// Why the draw button is disabled, stated under it — never silently hidden.
export function drawDisabledReason(preview: DrawPreview): string | null {
  switch (preview.kind) {
    case 'TOO_FEW': {
      const missing = preview.need - preview.have;
      return missing === 1
        ? 'Needs one more person.'
        : `Needs ${countWord(missing)} more people.`;
    }
    case 'INFEASIBLE':
      // Deliberately not "leaves nobody for X": the blocked person is the most
      // constrained one, and may still have a candidate — what fails is the
      // loop closing, not that person having anyone at all.
      return `These exclusions don't leave a full loop.`;
    default:
      return null;
  }
}

type DrawActionData = { error?: string; drawn?: boolean } | undefined;

// The draw button plus its consequence line, and the confirmation it opens.
// Mobile renders it as the page's only sticky element; desktop promotes the
// same control into the header band (`variant="inline"`).
export function DrawControls({
  exchangeId,
  preview,
  variant = 'footer',
  onRemoveExclusion,
}: Readonly<{
  exchangeId: string;
  preview: DrawPreview;
  variant?: 'footer' | 'inline';
  // Infeasible state offers Remove per exclusion; the caller wires the intent.
  onRemoveExclusion?: (exclusionId: string) => void;
}>) {
  const fetcher = useFetcher<DrawActionData>();
  const pending = fetcher.state !== 'idle';
  const [open, setOpen] = useState(false);
  const reason = drawDisabledReason(preview);

  // Keep the sheet open on failure so the message is read in context; close
  // on success (the page re-renders into the drawn state anyway).
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.drawn) setOpen(false);
  }, [fetcher.state, fetcher.data]);

  const button = (
    <Button
      type="button"
      size={variant === 'footer' ? 'lg' : 'default'}
      className={variant === 'footer' ? 'w-full' : undefined}
      // Too few people: visible and disabled with the reason beneath. An
      // infeasible draw stays live so the button opens the explanation.
      disabled={preview.kind === 'TOO_FEW'}
      onClick={() => setOpen(true)}
      data-testid="draw-names"
    >
      Draw names
    </Button>
  );

  const consequenceLine = (
    <p
      className={cn(
        'text-center text-xs',
        reason ? 'text-warning' : 'text-muted-foreground',
      )}
      data-testid="draw-consequence"
    >
      {reason ?? 'Nobody can be added after the draw.'}
    </p>
  );

  return (
    <>
      {variant === 'footer' ? (
        <div className="sticky bottom-[calc(theme(spacing.bottom-nav)+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-border/60 bg-background/95 px-4 pb-3 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <div className="space-y-1.5">
            {button}
            {consequenceLine}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1">
          {button}
          {consequenceLine}
        </div>
      )}

      {preview.kind === 'ok' ? (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={`Draw names for ${preview.participantCount} people?`}
          description={`${listNames(preview.names)}.`}
          consequences={[
            'Nobody can join or leave afterwards without starting a new draw.',
            repeatsSentence(preview.repeats, preview.participantCount),
            "You'll draw a name too, and you won't see anybody else's.",
          ].filter((line): line is string => line !== null)}
          caution={fetcher.data?.error}
          confirmText="Draw names"
          cancelText="Not yet"
          pending={pending}
          pendingLabel="Drawing names…"
          pendingHint="Hang on — this only happens once."
          closeOnConfirm={false}
          onConfirm={() => {
            const body = new FormData();
            body.set('intent', EXCHANGE_INTENT.DrawNames);
            body.set('exchangeId', exchangeId);
            void fetcher.submit(body, { method: 'post' });
          }}
        />
      ) : preview.kind === 'INFEASIBLE' ? (
        <ResponsiveDialog open={open} onOpenChange={setOpen}>
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>
                These exclusions don&apos;t leave a full loop
              </ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <ResponsiveDialogDescription>
              {preview.exclusions
                .map((e) => `"${e.aName} and ${e.bName}"`)
                .join(' plus ')}{' '}
              leave {preview.blockedName} too few people to give to for the loop
              to close.
            </ResponsiveDialogDescription>
            <ul className="space-y-2">
              {preview.exclusions.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {e.aName} <span className="text-muted-foreground">and</span>{' '}
                    {e.bName}
                  </span>
                  {onRemoveExclusion ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRemoveExclusion(e.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <ResponsiveDialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Add more people instead
              </Button>
            </ResponsiveDialogFooter>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      ) : null}
    </>
  );
}
