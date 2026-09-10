import { useState } from 'react';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { PresetPicker } from '#app/components/ui/preset-picker.tsx';
import { THANKS_PRESETS } from '#app/utils/exchange-notes.ts';
import {
  type ExchangePerson,
  type Scoreboard as ScoreboardData,
} from '#app/utils/exchanges.server.ts';

// Sentences about people, not metrics (board §3). Nothing here is a ranking
// anyone loses: "Wavered" is affectionate, and "Unguessable" is a compliment.
export function Scoreboard({ scoreboard }: { scoreboard: ScoreboardData }) {
  return (
    <section className="rounded-2xl border p-4" aria-label="Guesses">
      <h3 className="text-sm font-medium text-foreground">Guesses</h3>
      {scoreboard.awards.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {scoreboard.summary}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {scoreboard.awards.map((award) => (
              <li key={award.kind} className="flex items-center gap-3">
                <Avatar
                  size="s"
                  className="!h-9 !w-9"
                  image={null}
                  user={award.person}
                />
                <div className="min-w-0 flex-1">
                  {/* Every avatar carries a visible name — an avatar is never
                      the only label. */}
                  <p className="truncate text-sm font-medium text-foreground">
                    {award.person.name ?? award.person.username}
                  </p>
                  <p className="text-xs text-muted-foreground">{award.line}</p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium">
                  {award.title}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            {scoreboard.summary}
          </p>
        </>
      )}
    </section>
  );
}

// The only note that carries a name, and the only one that goes one way.
export function ThankYouComposer({
  gifter,
  alreadySent,
  pending,
  onSend,
}: {
  gifter: ExchangePerson;
  alreadySent: boolean;
  pending: boolean;
  onSend: (presetKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const first = (gifter.name ?? gifter.username).split(' ')[0];

  if (alreadySent) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="thanks-sent">
        You thanked {first}. They saw your name on it.
      </p>
    );
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={pending}>
        Say thanks to {first}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        They&apos;ll see your name on it now.
      </p>

      <PresetPicker
        open={open}
        onOpenChange={setOpen}
        title={`Say thanks to ${first}`}
        description="This one carries your name — the exchange is over, so there's nothing left to give away."
        options={THANKS_PRESETS.map((p) => ({ key: p.key, label: p.text }))}
        sendLabel={() => 'Send it'}
        onSend={(key) => {
          onSend(key);
          setOpen(false);
        }}
        pending={pending}
      />
    </>
  );
}
