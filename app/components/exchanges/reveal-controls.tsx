import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import { SwitchRow } from '#app/components/ui/switch.tsx';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import { type ExchangeOrganizerProgress } from '#app/utils/exchanges.server.ts';
import { countWord, formatExchangeDate, inDaysLabel } from './exchange-copy.ts';

type RevealActionData = { error?: string; revealed?: boolean } | undefined;

// The organizer's reveal block, live from the exchange date onwards. The
// auto-reveal date is visible from the first day so nobody feels rushed; with
// auto-reveal off the copy says "no rush" and the button never expires.
export function RevealControls({
  exchangeId,
  progress,
  autoRevealAt,
  eventDate,
  now,
  revealMode = 'ORGANIZER',
}: Readonly<{
  exchangeId: string;
  progress: ExchangeOrganizerProgress;
  autoRevealAt: Date | string | null;
  eventDate: Date | string;
  now: Date;
  revealMode?: 'ORGANIZER' | 'SECRET_FOREVER';
}>) {
  // A secret-forever exchange never shows the loop: it closes, scores the
  // guesses and stops. Promising "everyone sees the whole loop" here would be
  // a warning the server will not honour.
  const secretForever = revealMode === 'SECRET_FOREVER';
  const canToggleAutoReveal = !secretForever;
  const fetcher = useFetcher<RevealActionData>();
  const settingsFetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const pending = fetcher.state !== 'idle';
  const everyoneGave = progress.given >= progress.total;
  const outstanding = progress.total - progress.received;

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.revealed) setOpen(false);
  }, [fetcher.state, fetcher.data]);

  const daysSince = Math.max(
    0,
    Math.floor(
      (now.getTime() - new Date(eventDate).getTime()) / (24 * 60 * 60 * 1000),
    ),
  );

  const setAutoReveal = (on: boolean) => {
    const body = new FormData();
    body.set('intent', EXCHANGE_INTENT.UpdateSettings);
    body.set('exchangeId', exchangeId);
    body.set('autoReveal', on ? 'on' : 'off');
    void settingsFetcher.submit(body, { method: 'post' });
  };

  return (
    <div className="space-y-3" data-testid="reveal-controls">
      <div>
        <p className="text-base font-semibold">
          {secretForever
            ? 'Ready to close it'
            : autoRevealAt
              ? 'Ready when you are'
              : "It's yours to call"}
        </p>
        <p className="text-sm text-muted-foreground">
          {everyoneGave
            ? 'Everyone has given their gift. '
            : `${countWord(progress.total - progress.given)} ${progress.total - progress.given === 1 ? 'person still has' : 'people still have'} a gift to give. `}
          {secretForever
            ? 'Closing it scores the guesses for everyone at once. The pairings are never shown.'
            : autoRevealAt
              ? 'Revealing shows the whole loop to everyone at once.'
              : 'Nothing happens until you reveal — you turned auto-reveal off, so the exchange will wait as long as you need.'}
        </p>
      </div>
      <Button
        type="button"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        {secretForever ? 'Finish the exchange' : 'Reveal the pairings'}
      </Button>
      <p
        className="text-xs text-muted-foreground"
        data-testid="auto-reveal-line"
      >
        {secretForever
          ? 'Nothing is shown either way — this only scores the guesses.'
          : autoRevealAt
            ? `If you don't, Gift Pool reveals on ${formatExchangeDate(autoRevealAt)} — ${inDaysLabel(autoRevealAt, now)}.`
            : daysSince === 0
              ? 'No rush.'
              : `${countWord(daysSince)[0]!.toUpperCase()}${countWord(daysSince).slice(1)} ${daysSince === 1 ? 'day' : 'days'} since the exchange. No rush.`}
      </p>
      {canToggleAutoReveal ? (
        <SwitchRow
          id="auto-reveal"
          title="Reveal for me if I forget"
          description={
            autoRevealAt
              ? `On — ${formatExchangeDate(autoRevealAt)}. The group is told the date either way.`
              : 'Off. You can switch it back on — the group is told the date either way.'
          }
          checked={autoRevealAt != null}
          disabled={settingsFetcher.state !== 'idle'}
          onCheckedChange={setAutoReveal}
        />
      ) : null}

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={
          secretForever
            ? 'Close the exchange and score the guesses?'
            : 'Show everyone who had who?'
        }
        consequences={
          secretForever
            ? [
                `All ${countWord(progress.total)} of you see who guessed right — the pairings stay secret, for good.`,
                "It can't be undone.",
              ]
            : [
                `All ${countWord(progress.total)} of you see the whole loop at the same moment — you included. You'll find out who had you here too.`,
                "It can't be undone.",
              ]
        }
        caution={
          fetcher.data?.error ??
          (outstanding > 0
            ? `${outstanding === 1 ? 'One person' : `${countWord(outstanding)} people`} ${outstanding === 1 ? "hasn't" : "haven't"} said they got their gift yet. Their pairing will still show.`
            : undefined)
        }
        confirmText={
          secretForever ? 'Finish the exchange' : 'Reveal the pairings'
        }
        cancelText="Not yet"
        pending={pending}
        pendingLabel={secretForever ? 'Finishing…' : 'Revealing…'}
        pendingHint="Telling everyone at once."
        closeOnConfirm={false}
        onConfirm={() => {
          const body = new FormData();
          body.set('intent', EXCHANGE_INTENT.Reveal);
          body.set('exchangeId', exchangeId);
          void fetcher.submit(body, { method: 'post' });
        }}
      />
    </div>
  );
}
