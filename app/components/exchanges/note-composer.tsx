import { useState } from 'react';
import { Button } from '#app/components/ui/button.tsx';
import { PresetPicker } from '#app/components/ui/preset-picker.tsx';
import {
  GIFTEE_NOTE_PRESETS,
  GIFTER_NOTE_PRESETS,
  NOTE_DAILY_ALLOWANCE,
} from '#app/utils/exchange-notes.ts';
import { type ClueCandidate } from '#app/utils/exchanges.server.ts';

export type NoteSendDirection = 'TO_GIFTEE' | 'TO_GIFTER';

// Notes and clues share one allowance and one sentence explaining the morning
// batch, said at the point of sending rather than buried in settings: it is a
// secrecy feature, so it should read as care rather than a limit.
export function NoteComposer({
  direction,
  personFirstName,
  remainingToday,
  deliveryLabel,
  pending,
  onSend,
  triggerLabel,
}: {
  direction: NoteSendDirection;
  personFirstName: string;
  remainingToday: number;
  /** Which morning this would land on — "tomorrow morning", or "this
   * morning" for one written overnight. Computed in the recipient's zone,
   * because promising the wrong morning is a promise people plan around. */
  deliveryLabel: string;
  pending: boolean;
  onSend: (presetKey: string) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const toGiftee = direction === 'TO_GIFTEE';
  const presets = toGiftee ? GIFTER_NOTE_PRESETS : GIFTEE_NOTE_PRESETS;
  const exhausted = remainingToday <= 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={exhausted}
      >
        {triggerLabel ?? (toGiftee ? 'Send a note' : 'Reply with a note')}
      </Button>
      {exhausted ? (
        <p className="mt-2 text-xs text-muted-foreground">
          That&apos;s your {NOTE_DAILY_ALLOWANCE} notes for today. You can send
          another tomorrow morning.
        </p>
      ) : null}

      <PresetPicker
        open={open}
        onOpenChange={setOpen}
        title={
          toGiftee ? `Send ${personFirstName} a note` : 'Reply to your gifter'
        }
        description={
          toGiftee
            ? `Pick one. ${personFirstName} will get it ${deliveryLabel} with everyone else's — a 2am note would tell them more than you meant to.`
            : `Pick one. They'll get it ${deliveryLabel} with everyone else's, so it won't say when you were awake.`
        }
        options={presets.map((p) => ({ key: p.key, label: p.text }))}
        sendLabel={() => `Send ${deliveryLabel}`}
        onSend={(key) => {
          onSend(key);
          setOpen(false);
        }}
        pending={pending}
        allowance={{
          remaining: remainingToday,
          total: NOTE_DAILY_ALLOWANCE,
          exhaustedLabel: `That's your ${NOTE_DAILY_ALLOWANCE} notes for today. You can send another tomorrow morning.`,
        }}
      />
    </>
  );
}

// Clues are true things about the sender, shown exactly as the recipient will
// read them, each carrying how far it narrows the field. One that gives the
// sender away is still offered — declining is one tap, and nothing is ever
// sent automatically.
export function CluePicker({
  personFirstName,
  clues,
  remainingToday,
  deliveryLabel,
  pending,
  onSend,
}: {
  personFirstName: string;
  clues: ClueCandidate[];
  remainingToday: number;
  deliveryLabel: string;
  pending: boolean;
  onSend: (clueKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const exhausted = remainingToday <= 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={exhausted}
      >
        Send a clue
      </Button>

      <PresetPicker
        open={open}
        onOpenChange={setOpen}
        title={`Send ${personFirstName} a clue`}
        description={`These are true things about you. You choose which ones ${personFirstName} gets — and you can see exactly what they'll read. It arrives ${deliveryLabel}.`}
        options={clues.map((clue) => ({
          key: clue.key,
          label: clue.text,
          subtitle: clue.uniquelyIdentifies
            ? 'Gives you away — only you match'
            : `Narrows it to ${clue.narrowsTo} ${clue.narrowsTo === 1 ? 'person' : 'people'}`,
          caution: clue.uniquelyIdentifies,
        }))}
        sections={
          clues.length > 0
            ? [
                {
                  label: 'From what Gift Pool knows',
                  keys: clues.map((c) => c.key),
                },
              ]
            : undefined
        }
        sendLabel={() => 'Send this clue'}
        onSend={(key) => {
          onSend(key);
          setOpen(false);
        }}
        pending={pending}
        allowance={{
          remaining: remainingToday,
          total: NOTE_DAILY_ALLOWANCE,
          exhaustedLabel: `That's your ${NOTE_DAILY_ALLOWANCE} notes for today. You can send another tomorrow morning.`,
        }}
        emptyLabel="Gift Pool doesn't know anything about you two yet. A note is the way to go."
        footnote={`Clues count towards your ${NOTE_DAILY_ALLOWANCE} notes a day.`}
      />
    </>
  );
}
