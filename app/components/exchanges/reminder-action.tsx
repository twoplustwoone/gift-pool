import { useState } from 'react';
import { Button } from '#app/components/ui/button.tsx';
import { PresetPicker } from '#app/components/ui/preset-picker.tsx';
import { type ExchangeReminderAvailability } from '#app/utils/exchange-reminders.server.ts';

const countPeople = (n: number) => (n === 1 ? '1 person' : `${n} people`);

function unavailableLine(
  availability: ExchangeReminderAvailability,
): string | null {
  switch (availability.status) {
    case 'NO_ELIGIBLE':
      return 'Everyone has answered.';
    case 'COOLDOWN':
      return 'You reminded them today. You can do it again tomorrow.';
    case 'WEEKLY_LIMIT':
      return "That's three reminders this week — enough for one exchange.";
    case 'NOT_APPLICABLE':
      return null;
    default:
      return null;
  }
}

// Reuses the preset picker unchanged (board §12). The count is aggregate and
// the organizer never learns who received it — there is no list to show, on
// purpose.
export function ExchangeReminderAction({
  availability,
  pending,
  onSend,
}: {
  availability: ExchangeReminderAvailability;
  pending: boolean;
  onSend: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (availability.status === 'NOT_APPLICABLE') return null;

  const line = unavailableLine(availability);
  if (availability.status !== 'AVAILABLE') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="reminder-state">
        {line}
      </p>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        Remind
      </Button>
      <PresetPicker
        open={open}
        onOpenChange={setOpen}
        title="Send a reminder"
        description={`${countPeople(availability.eligibleCount)} haven't answered yet. They'll get one nudge — you won't be told who.`}
        options={[
          {
            key: 'ANSWER',
            label: 'Answer before the draw',
            subtitle: `Goes to ${countPeople(availability.eligibleCount)}`,
          },
        ]}
        sendLabel={() => 'Send the reminder'}
        onSend={() => {
          onSend();
          setOpen(false);
        }}
        pending={pending}
        footnote="Who received it, and whether they opened it, stays private."
      />
    </>
  );
}
